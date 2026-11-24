/**
 * The API tutor: the provider's own chat-completions endpoint, with tools.
 *
 * It speaks the same record vocabulary `createAgy` emits (`agent_start`, `message_start`,
 * `message_update`, `tool_execution_start/end`, `message_end`, `agent_settled`), so the studio's
 * one `handle` renders it without knowing which runtime is talking. What it costs is stated rather
 * than hidden: there is no resident process, so the thread lives in this module's memory and a
 * studio restart begins a new one; there are no dialogs; and it reads none of the vault's skills.
 *
 * Stream facts this adapter relies on, from docs.mistral.ai (read 2026-11-06):
 *   - server-sent events, `data: <json>` per event, terminated by `data: [DONE]`;
 *   - `delta.content` is a string while answering, and a **list of chunks**
 *     (`{type:"thinking"}` / `{type:"text"}`) during the reasoning phase, or always for some
 *     models: both shapes are read in the same stream and only text reaches the learner;
 *   - streamed `tool_calls` arrive by `index`, with `function.arguments` split across events.
 */
import { execFile } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { HttpError } from "../integrations/pi/bridge.ts";
import { resolveContained } from "../integrations/pi/paths.ts";
import { STUDIO_CONTRACT } from "./agy.ts";
import { nivelesDeEffort, PROVEEDORES, proveedorPorId } from "./proveedores.ts";
import type { TutorConfig } from "./tutor.ts";

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);

/** Steps a single turn may take before the studio stops it: a turn, not an agent loop forever. */
const MAX_STEPS = 12;
/** How long a provider may stay silent before the turn is cut: an idle socket must not latch the studio. */
const IDLE_MS = 60_000;

/** What one `read` returns, and what one engine call may say back to the model. */
const MAX_TEXT = 20_000;
const MAX_OUTPUT = 8_000;

/**
 * The tools, under the names the page already labels (`read`, `write`, `edit`, `bash`) and with
 * Pi's argument names, so note-tracking and the labels keep working for this runtime too.
 */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "read",
      description: "Read a text file inside the Learnings folder. Returns its lines.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the Learnings folder." },
          offset: { type: "integer", description: "First line to read (1-based)." },
          limit: { type: "integer", description: "How many lines to read." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write",
      description: "Write a text file inside the Learnings folder, creating its folders.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the Learnings folder." },
          content: { type: "string", description: "The whole file." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit",
      description: "Replace one exact piece of text in a file inside the Learnings folder.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the Learnings folder." },
          oldText: { type: "string", description: "The exact text to replace; it must appear once." },
          newText: { type: "string", description: "The text that replaces it." },
        },
        required: ["path", "oldText", "newText"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description: "Run the study engine (`learning status --json`, `learning validate --json`, `learning advance --stage ... --verdict ... --json`). The studio adds --root, --workspace and --rules for you. Nothing else is allowed.",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "For example: learning status --json" } },
        required: ["command"],
      },
    },
  },
];

const TOOL_GUIDE = [
  "[Herramientas]",
  "Puedes leer (read), escribir (write) y editar (edit) notas dentro de la carpeta de Learnings, y preguntarle al motor (bash) con `learning ...`.",
  "El motor es la autoridad: no declares aprobado nada que él no haya aprobado. Usa `bash` con `learning status --json` (el estudio añade --root, --workspace y --rules): ahí ves dónde está el estudio.",
  "No escribas fuera de la carpeta de Learnings: esas rutas se rechazan.",
].join("\n");

/** A tool call, assembled from the deltas that carry it. */
interface Llamada {
  id: string;
  name: string;
  args: Json;
  raw: string;
}

/** What one model step produced. */
interface Paso {
  text: string;
  calls: Llamada[];
}

const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((chunk): chunk is Json => isRecord(chunk) && chunk.type === "text" && typeof chunk.text === "string")
    .map((chunk) => chunk.text as string)
    .join("");
};

/** One request, read as it streams: text reaches the learner, tools come back assembled. */
async function leerTurno(
  url: string,
  key: string,
  providerName: string,
  body: Json,
  controller: AbortController,
  onText: (delta: string) => void,
  fetchImpl: typeof fetch,
  idleMs: number = IDLE_MS,
): Promise<Paso> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // A provider (or a proxy) may quote the request back at us; the key is scrubbed before it can
    // reach a message, the page or a log.
    const said = detail.slice(0, 300).split(key).join("[clave]").replace(/\s+/g, " ").trim();
    throw new Error(`${providerName} respondió ${response.status}${said ? `: ${said}` : ""}`);
  }
  if (response.body === null) throw new Error(`${providerName} no envió respuesta`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<number, { id: string; name: string; args: string }>();
  let text = "";
  let buffer = "";
  let done = false;
  // A provider that accepts the turn and then goes quiet would otherwise hold the studio's only
  // turn for as long as it likes; silence is cut, and the cut says it was silence.
  let stalled = false;
  let watchdog: NodeJS.Timeout | undefined;
  const bump = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => { stalled = true; controller.abort(); }, idleMs);
  };
  const dataOf = (line: string) => (line.startsWith("data:") ? line.slice(5).trim() : "");
  const consume = (payload: string) => {
    if (payload === "[DONE]") { done = true; return; }
    let record: unknown;
    try { record = JSON.parse(payload); } catch { return; }
    if (!isRecord(record) || !Array.isArray(record.choices)) return;
    const choice = record.choices.find(isRecord);
    if (!isRecord(choice) || !isRecord(choice.delta)) return;
    const chunk = textOf(choice.delta.content);
    if (chunk) { text += chunk; onText(chunk); }
    if (!Array.isArray(choice.delta.tool_calls)) return;
    for (const entry of choice.delta.tool_calls) {
      if (!isRecord(entry)) continue;
      const index = typeof entry.index === "number" ? entry.index : 0;
      const carrier = calls.get(index) ?? { id: "", name: "", args: "" };
      if (typeof entry.id === "string" && entry.id) carrier.id = entry.id;
      if (isRecord(entry.function)) {
        if (typeof entry.function.name === "string" && entry.function.name) carrier.name = entry.function.name;
        if (typeof entry.function.arguments === "string") carrier.args += entry.function.arguments;
      }
      calls.set(index, carrier);
    }
  };
  bump();
  try {
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bump();
      buffer += decoder.decode(chunk.value, { stream: true });
      // Events end at a blank line; the tail stays buffered until its own blank line arrives.
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        // One payload per `data:` line: two of them in one block are two events, not one string.
        for (const line of block.split(/\r?\n/)) {
          const payload = dataOf(line);
          if (payload) consume(payload);
          if (done) break;
        }
        if (done) break;
      }
    }
    // A stream that ends without its blank line still carried a last event.
    for (const line of buffer.split(/\r?\n/)) {
      const payload = dataOf(line);
      if (payload) consume(payload);
    }
  } catch (error) {
    if (stalled) throw new Error(`${providerName} dejó de responder durante ${Math.round(idleMs / 1000)} s; el turno se cortó.`);
    throw error;
  } finally {
    if (watchdog) clearTimeout(watchdog);
  }
  await reader.cancel().catch(() => {});
  const assembled: Llamada[] = [...calls.entries()].sort(([left], [right]) => left - right).map(([index, call]) => {
    let args: Json = {};
    try { const parsed = JSON.parse(call.args || "{}"); if (isRecord(parsed)) args = parsed; } catch { /* the model sent no usable arguments */ }
    return { id: call.id || `call-${index}`, name: call.name, args, raw: call.args };
  });
  return { text, calls: assembled };
}

/** Where a write may land: inside the folder, after the nearest existing ancestor is real. */
function destinoDeEscritura(root: string, raw: unknown): { ok: true; path: string } | { ok: false; reason: string } {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, reason: "falta la ruta" };
  if (raw.includes("\0")) return { ok: false, reason: "la ruta tiene un byte nulo" };
  if (isAbsolute(raw)) return { ok: false, reason: "usa una ruta relativa a la carpeta de Learnings" };
  const rootReal = realpathSync(root);
  const absolute = resolve(rootReal, raw);
  const inside = relative(rootReal, absolute);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`)) {
    return { ok: false, reason: "esa ruta queda fuera de la carpeta de Learnings" };
  }
  let ancestor = dirname(absolute);
  while (!existsSync(ancestor) && ancestor !== dirname(ancestor)) ancestor = dirname(ancestor);
  const realAncestor = realpathSync(ancestor);
  const reached = relative(rootReal, realAncestor);
  if (reached === ".." || reached.startsWith(`..${sep}`)) {
    return { ok: false, reason: "esa ruta sale de la carpeta de Learnings por un enlace" };
  }
  mkdirSync(dirname(absolute), { recursive: true });
  const final = join(realpathSync(dirname(absolute)), basename(absolute));
  // The parent is contained; the file itself must not be a link, or the write lands wherever the
  // link points -- including a dangling one, whose target does not exist yet.
  try {
    if (lstatSync(final).isSymbolicLink()) {
      return { ok: false, reason: "esa ruta es un enlace simbólico: escribe el archivo real al que apunta" };
    }
  } catch { /* nothing there yet: a new file */ }
  return { ok: true, path: final };
}

/** An existing file the tutor may look at: the studio's own containment rule. */
function destinoExistente(root: string, raw: unknown): { ok: true; path: string } | { ok: false; reason: string } {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, reason: "falta la ruta" };
  if (isAbsolute(raw)) return { ok: false, reason: "usa una ruta relativa a la carpeta de Learnings" };
  const contained = resolveContained(root, resolve(root, raw));
  return contained.ok ? { ok: true, path: contained.targetReal } : { ok: false, reason: contained.reason };
}

/** The flags whose value is a path the engine writes to or reads from. */
const RUTAS = new Set(["--root", "--workspace", "--rules", "--source", "--exam-source"]);

/**
 * The engine is the one program the tutor may run, and it may not be pointed outside the vault:
 * `learning init --workspace /tmp/x` writes a study there without `write` ever being called. The
 * flags the engine requires on every command are supplied here, so `learning status --json` works.
 */
function engineArgs(
  command: unknown,
  engine: string,
  root: string,
  rulesPath: string,
): { ok: true; args: string[] } | { ok: false; reason: string } {
  if (typeof command !== "string" || !command.trim()) return { ok: false, reason: "falta el comando" };
  const tokens = (command.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []).map((token) => (token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : token));
  const [first, ...rest] = tokens;
  const allowed = new Set(["learning", "./bin/learning", "bin/learning", engine]);
  if (!allowed.has(first)) return { ok: false, reason: "solo puedes correr el motor de aprendizaje: `learning ...`" };
  const rootReal = realpathSync(root);
  const passed = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!RUTAS.has(token)) continue;
    const value = rest[index + 1];
    if (value === undefined) return { ok: false, reason: `${token} necesita una ruta` };
    passed.add(token);
    const absolute = isAbsolute(value) ? resolve(value) : resolve(rootReal, value);
    const inside = relative(rootReal, absolute);
    if (inside === ".." || inside.startsWith(`..${sep}`)) {
      return { ok: false, reason: `${token} apunta fuera de la carpeta de Learnings; el motor solo trabaja dentro` };
    }
    for (let walk = absolute; walk !== dirname(walk); walk = dirname(walk)) {
      if (!existsSync(walk)) continue;
      const reached = relative(rootReal, realpathSync(walk));
      if (reached === ".." || reached.startsWith(`..${sep}`)) {
        return { ok: false, reason: `${token} sale de la carpeta de Learnings por un enlace` };
      }
      break;
    }
  }
  const injected = [
    ...(passed.has("--root") ? [] : ["--root", rootReal]),
    ...(passed.has("--workspace") ? [] : ["--workspace", rootReal]),
    ...(passed.has("--rules") ? [] : ["--rules", rulesPath]),
  ];
  return { ok: true, args: [...injected, ...rest] };
}

function correr(engine: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<{ ok: boolean; content: string }> {
  return new Promise((resolveRun) => {
    execFile(engine, args, { cwd, env, timeout: 60_000, maxBuffer: 1 << 20 }, (error, stdout, stderr) => {
      const output = `${stdout}${stderr}`.trim();
      const capped = output.length > MAX_OUTPUT ? `${output.slice(0, MAX_OUTPUT)}\n[…recortado]` : output;
      const code = error && typeof (error as { code?: unknown }).code === "number" ? Number((error as { code: number }).code) : error ? 1 : 0;
      resolveRun({ ok: code === 0, content: capped || `(el motor salió con código ${code} y no dijo nada)` });
    });
  });
}

/** Executes one call and answers with what the model should read back. */
async function ejecutar(options: {
  root: string;
  engine: string;
  rulesPath: string;
  env: NodeJS.ProcessEnv;
  call: Llamada;
}): Promise<{ ok: boolean; content: string }> {
  const { root, engine, rulesPath, env, call } = options;
  switch (call.name) {
    case "read": {
      const where = destinoExistente(root, call.args.path);
      if (!where.ok) return { ok: false, content: where.reason };
      const lines = readFileSync(where.path, "utf8").split("\n");
      const offset = typeof call.args.offset === "number" && call.args.offset > 0 ? Math.floor(call.args.offset) : 1;
      const limit = typeof call.args.limit === "number" && call.args.limit > 0 ? Math.floor(call.args.limit) : 400;
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const text = slice.length ? slice.join("\n") : "(el archivo no tiene líneas en ese rango)";
      return { ok: true, content: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[…recortado]` : text };
    }
    case "write": {
      const where = destinoDeEscritura(root, call.args.path);
      if (!where.ok) return { ok: false, content: where.reason };
      if (typeof call.args.content !== "string") return { ok: false, content: "falta el contenido" };
      writeFileSync(where.path, call.args.content, "utf8");
      const lines = call.args.content.split("\n").length;
      return { ok: true, content: `escrito ${relative(realpathSync(root), where.path)} (${lines} líneas)` };
    }
    case "edit": {
      const where = destinoExistente(root, call.args.path);
      if (!where.ok) return { ok: false, content: where.reason };
      const { oldText, newText } = call.args;
      if (typeof oldText !== "string" || !oldText) return { ok: false, content: "falta oldText" };
      if (typeof newText !== "string") return { ok: false, content: "falta newText" };
      const before = readFileSync(where.path, "utf8");
      const first = before.indexOf(oldText);
      if (first < 0) return { ok: false, content: "ese texto no aparece en el archivo" };
      if (before.indexOf(oldText, first + 1) >= 0) return { ok: false, content: "ese texto aparece más de una vez: escribe el trozo exacto que quieres cambiar" };
      writeFileSync(where.path, `${before.slice(0, first)}${newText}${before.slice(first + oldText.length)}`, "utf8");
      return { ok: true, content: `editado ${relative(realpathSync(root), where.path)}` };
    }
    case "bash": {
      const command = engineArgs(call.args.command, engine, root, rulesPath);
      if (!command.ok) return { ok: false, content: command.reason };
      return correr(engine, command.args, root, env);
    }
    default:
      return { ok: false, content: `herramienta desconocida: ${call.name || "(sin nombre)"}` };
  }
}

/**
 * The handle the studio starts: the same shape as `createAgy`, so `startTutor` branches on the
 * config instead of on a second protocol.
 */
export function createApi(options: {
  root: string;
  config: TutorConfig;
  onRecord: (record: Json) => void;
  onError: (message: string) => void;
  /** Where the provider lives; a test or a local proxy points it elsewhere. */
  base?: string;
  /** Where the key is read from. The studio passes the process environment. */
  env?: Record<string, string | undefined>;
  /** Extra environment for the engine child, never the key map. */
  childEnv?: Record<string, string>;
  /** The study engine binary, as the studio resolved it. */
  engine: string;
  /** The rules file the engine requires on every command. */
  rulesPath: string;
  fetchImpl?: typeof fetch;
  maxSteps?: number;
  /** How long a silent provider is tolerated before the turn is cut; a test shortens it. */
  idleMs?: number;
}) {
  const provider = proveedorPorId(options.config.proveedor) ?? proveedorPorId("mistral");
  const base = options.base ?? provider?.base ?? "";
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  // The engine child gets the studio's environment without any provider key: it never needs one,
  // and a tool result is the one place a key could come back to the model.
  const engineEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const provider of PROVEEDORES) delete engineEnv[provider.variable];
  Object.assign(engineEnv, options.childEnv);
  const messages: Json[] = [];
  const config = { ...options.config };
  let busy = false;
  let stopped = false;
  let aborted = false;
  let controller: AbortController | undefined;

  const emit = (record: Json) => options.onRecord(record);
  const failure = (message: string) => options.onError(message);

  const key = () => String(env[provider?.variable ?? "MISTRAL_API_KEY"] ?? "").trim();

  const preparar = () => {
    if (!provider) throw new HttpError(400, "unknown provider");
    if (!key()) throw new HttpError(503, `falta ${provider.variable}: expórtala y reinicia el estudio`);
    if (!config.modelo) throw new HttpError(400, `elige un modelo de ${provider.nombre} en Configuración`);
    if (messages.length === 0) messages.push({ role: "system", content: `${TOOL_GUIDE}\n\n${STUDIO_CONTRACT}` });
    if (provider.nombre !== "Mistral") throw new HttpError(400, `${provider.nombre} todavía no está implementado`);
  };

  const unTurno = async (text: string) => {
    emit({ type: "agent_start" });
    emit({ type: "message_start", message: { role: "user", content: text } });
    let answer = "";
    let started = false;
    try {
      // The system message is written before the learner's, so the provider reads the frame first.
      preparar();
      messages.push({ role: "user", content: text });
      for (let step = 0; step < (options.maxSteps ?? MAX_STEPS); step += 1) {
        if (aborted || stopped) return;
        const body: Json = { model: config.modelo, messages, stream: true, tools: TOOLS };
        const levels = nivelesDeEffort(config.modelo);
        if (config.pensamiento && levels.includes(config.pensamiento)) body.reasoning_effort = config.pensamiento;
        const paso = await leerTurno(
          `${base}chat/completions`,
          key(),
          provider!.nombre,
          body,
          controller!,
          (delta) => {
            if (!started) { emit({ type: "message_start", message: { role: "assistant" } }); started = true; }
            answer += delta;
            emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta } });
          },
          fetchImpl,
          options.idleMs,
        );
        if (paso.calls.length === 0) {
          messages.push({ role: "assistant", content: paso.text });
          if (!paso.text.trim()) failure(`${provider!.nombre} terminó sin responder; vuelve a intentarlo.`);
          return;
        }
        messages.push({
          role: "assistant",
          content: paso.text || null,
          tool_calls: paso.calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.raw || "{}" } })),
        });
        for (const call of paso.calls) {
          if (aborted || stopped) return;
          emit({ type: "tool_execution_start", toolCallId: call.id, toolName: call.name, args: call.args });
          let result: { ok: boolean; content: string };
          try {
            result = await ejecutar({ root: options.root, engine: options.engine, rulesPath: options.rulesPath, env: engineEnv, call });
          } catch (error) {
            result = { ok: false, content: error instanceof Error ? error.message : String(error) };
          }
          emit({ type: "tool_execution_end", toolCallId: call.id, toolName: call.name, args: call.args, isError: !result.ok });
          messages.push({ role: "tool", tool_call_id: call.id, name: call.name, content: result.content });
        }
      }
      failure(`${provider!.nombre} no cerró el turno en ${options.maxSteps ?? MAX_STEPS} pasos; revisa la carpeta antes de seguir.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!aborted && !stopped) {
        if (error instanceof HttpError) failure(error.message);
        else if ((error as { name?: string }).name === "AbortError") return;
        else failure(message);
      }
    } finally {
      // A turn the learner stopped ends without an answer, but it still ends: the studio releases
      // its turn on `agent_settled` and would otherwise keep it locked forever.
      if (!aborted && started && answer) emit({ type: "message_end", message: { role: "assistant", content: answer } });
      emit({ type: "agent_settled" });
      busy = false;
      controller = undefined;
    }
  };

  return {
    conversation() { return undefined; },
    /** The thread lives in memory; there is no id to reopen after a restart. */
    open(_id?: string) { /* nothing to reopen */ },
    prompt(text: string) {
      if (stopped) throw new HttpError(503, "the tutor is not running");
      if (busy) throw new HttpError(409, `${provider?.nombre ?? "El proveedor"} is busy`);
      busy = true;
      aborted = false;
      controller = new AbortController();
      void unTurno(text).catch((error) => {
        if (!aborted && !stopped) failure(error instanceof Error ? error.message : String(error));
      });
    },
    abort() {
      aborted = true;
      controller?.abort();
    },
    stop() {
      stopped = true;
      controller?.abort();
    },
  };
}
