#!/usr/bin/env node
/**
 * Bench the tutor on topics it has no example for (issue #246).
 *
 * Every proof so far is one PL/SQL part whose shape is close to a kit example. This
 * script measures whether the agy runtime meets the standard on topics from other
 * domains: it starts a *second* studio — its own root, port, token and state dir, never
 * the running service and never the real vault — and drives it through its own HTTP API
 * exactly as `studio/ui/studio.js` does: ask for a new topic in Universitario mode,
 * answer the diagnosis on the study-view bridge (the page's own submit route), choose
 * the method, ask for Part 1, wait for the turn to settle with its corrections, then
 * measure the written part with the four gates and copy it back for screenshots.
 *
 * Subcommands
 *   run     start the scratch studio and drive the topics (on the machine that has the
 *           repo, the engine binary and the agy runtime: the VPS)
 *   shots   render the copied parts with the reader and screenshot them black × wide
 *           (on the machine with a browser, i.e. locally)
 *   gates   re-run the four gates on the copied parts (no runtime needed)
 *
 * Nothing here writes outside its own scratch root and output directory; the real
 * vault is only read, to prove the bench never touched it.
 */
import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_DEFAULT = resolve(HERE, "..", "..");
/** The tutor production runs: same runtime, same model (tutor.json on the VPS). */
const AGENTE = "agy";
const MODELO = "gemini-3.8-flash-high";
/** A fixed 64-hex token, so a rerun reuses the same studio origin. */
const TOKEN = "2462462462462462462462462462462462462462462462462462462462462462";
/** The topics the issue asks for: five domains, no kit example for any of them. */
const TOPICS = [
  { id: "rust-borrowing", request: "Rust borrowing" },
  { id: "tcp-handshake", request: "TCP handshake" },
  { id: "bayes-theorem", request: "Bayes' theorem" },
  { id: "git-branching", request: "Git branching" },
  { id: "css-flexbox", request: "CSS flexbox" },
];
/** The four gates the standard is measured with, in the order the skill runs them. */
const GATES = ["scene-gate.mjs", "scene-lint.mjs", "deck-gate.mjs", "explain-check.mjs"];
/** The visual pieces a part can carry, and the tag each one is written with. */
// lk-quick-quiz, lk-figure and lk-audio joined the kit after the first run (1d9046f).
// lk-tree and lk-explorer are kit pieces (docs/kit.md) that were missing from this list until the third run.
const PIECES = ["lk-story", "lk-scene", "lk-walkthrough", "lk-cards", "lk-memory", "lk-tables", "lk-venn", "lk-diagram", "lk-math", "lk-widget", "lk-checkpoint", "lk-quiz", "lk-quick-quiz", "lk-figure", "lk-audio", "lk-video", "lk-ask", "lk-tree", "lk-explorer"];

// ---- arguments -----------------------------------------------------------

function parseArgs(argv) {
  const [command = "run", ...rest] = argv;
  const args = { command, topics: [] };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = rest[i + 1];
    const value = next !== undefined && !next.startsWith("--") ? rest[++i] : "true";
    if (key === "topic") args.topics.push(value);
    else args[key] = value;
  }
  return args;
}

const num = (value, fallback) => (value === undefined ? fallback : Number(value));

// ---- shared helpers ------------------------------------------------------

/** A body the studio wrote is JSON; anything else is reported with the text that came. */
function readJson(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what}: la respuesta no es JSON (${text.slice(0, 200)})`);
  }
}

function readJsonFile(file, what) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${what}: no pude leer ${file} (${error.message})`);
  }
}

function parseUrl(value, what) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${what}: no es una URL (${value})`);
  }
}

/** The repo's own modules: the studio under test, and the bridge the studio serves. */
async function loadRepo(repo) {
  const server = await import(pathToFileURL(join(repo, "studio", "server.ts")).href);
  const bridge = await import(pathToFileURL(join(repo, "integrations", "pi", "bridge.ts")).href);
  return { startStudio: server.startStudio, readPlan: bridge.readPlan, listTopics: bridge.listTopics };
}

/** A minimal Server-Sent-Events client: the studio's own event stream, parsed by hand. */
function subscribe(url, onEvent, onError) {
  const controller = new AbortController();
  const deliver = (frame) => {
    let event = "message";
    const data = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    if (!data.length) return;
    try {
      onEvent(event, JSON.parse(data.join("\n")));
    } catch {
      // A frame the studio wrote is JSON; anything else is not ours to read.
    }
  };
  (async () => {
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { accept: "text/event-stream" } });
      if (!res.ok || !res.body) throw new Error(`events: HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let at = buffer.indexOf("\n\n");
        while (at >= 0) {
          deliver(buffer.slice(0, at));
          buffer = buffer.slice(at + 2);
          at = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) onError?.(error);
    }
  })();
  return () => controller.abort();
}

/** The studio's HTTP surface: every route behind the token, every POST from its own origin. */
function studioClient(port) {
  const origin = `http://127.0.0.1:${port}`;
  const base = `${origin}/${TOKEN}/`;
  const host = `127.0.0.1:${port}`;
  const get = async (path) => {
    const res = await fetch(base + path, { headers: { host } });
    const text = await res.text();
    if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${text.slice(0, 400)}`);
    return text ? readJson(text, `GET ${path}`) : {};
  };
  const post = async (path, body) => {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    const parsed = text ? readJson(text, `POST ${path}`) : {};
    if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${parsed.error ?? text.slice(0, 400)}`);
    return parsed;
  };
  return { origin, base, get, post };
}

/** One process, as it ended: the tools' own exit codes are the measurement. */
const run = (command, args, options = {}) =>
  new Promise((done) => {
    execFile(command, args, { maxBuffer: 8 * 1024 * 1024, encoding: "utf8", ...options }, (error, stdout, stderr) => {
      let code = 0;
      if (error) code = typeof error.code === "number" ? error.code : -1;
      done({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), timedOut: Boolean(error?.killed) });
    });
  });

// ---- the scratch studio --------------------------------------------------

/** The throwaway vault: the tutor's real instructions, its own state, nothing of the learner's. */
function prepareRoot(scratch, repo) {
  const root = join(scratch, "root");
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, "rapidos"), { recursive: true });
  const agents = join(root, "AGENTS.md");
  if (!existsSync(agents)) symlinkSync(join(repo, "deploy", "vps", "learnings", "AGENTS.md"), agents);
  writeFileSync(join(root, "tutor.json"), `${JSON.stringify({ version: 1, agente: AGENTE, modelo: MODELO, pensamiento: "" }, null, 2)}\n`);
  return root;
}

/** Every file of a topic with its size and mtime: one string that changes when the tutor writes. */
function snapshot(dir) {
  const lines = [];
  const walk = (at) => {
    let entries;
    try {
      entries = readdirSync(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      try {
        const info = statSync(path);
        lines.push(`${path.slice(dir.length)}:${info.size}:${Math.round(info.mtimeMs)}`);
      } catch {
        // A file the tutor is rewriting is not a state to compare.
      }
    }
  };
  walk(dir);
  return lines.join("\n");
}

/** Every file of a copied topic, relative: what the tutor really wrote (rich page, quiz, parts). */
function fileList(dir) {
  const files = [];
  const walk = (at) => {
    let entries;
    try {
      entries = readdirSync(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(path.slice(dir.length + 1));
    }
  };
  walk(dir);
  return files;
}

/**
 * The correction rounds, counted from the studio's own log: every gate frame that did not
 * pass is one more prompt the studio sent into the same turn.
 */
function correctionsInLog(file) {
  if (!existsSync(file)) return 0;
  let rounds = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.kind === "gate" && record.data?.passing === false) rounds += 1;
  }
  return rounds;
}

/** How a turn ended, in the studio's own words: the error it raised, if it raised one. */
function turnOutcome(events) {
  const messages = events.filter((item) => item.event === "error").map((item) => String(item.data?.message ?? ""));
  if (messages.some((message) => message.includes("Se agotaron"))) return "se agotaron las correcciones";
  if (messages.some((message) => message.includes("eligió el método"))) return "el tutor eligió el método";
  return messages.length ? "error" : "termina";
}

/**
 * The studio's page-timing reports for the topic's turns: one per generation that wrote a part,
 * each listing its model calls by reason. A correction is a call that is not the learner's turn.
 * The reports are kept beside the results, so the count can be read again.
 */
function timingsOf(dir, since, keep) {
  const summary = { reports: 0, modelCalls: 0, turns: 0, engineCorrections: 0, partCorrections: 0, corrections: 0 };
  if (!existsSync(dir)) return summary;
  for (const name of readdirSync(dir).filter((item) => item.endsWith(".json")).sort()) {
    const report = readJsonFile(join(dir, name), "reporte de tiempos");
    if (Date.parse(report.startedAt) < Date.parse(since)) continue;
    summary.reports += 1;
    mkdirSync(keep, { recursive: true });
    cpSync(join(dir, name), join(keep, name));
    for (const call of report.calls ?? []) {
      summary.modelCalls += 1;
      if (call.reason === "engine-correction") summary.engineCorrections += 1;
      else if (call.reason === "part-correction") summary.partCorrections += 1;
      else summary.turns += 1;
    }
  }
  summary.corrections = summary.engineCorrections + summary.partCorrections;
  return summary;
}

/** The register numbers of one part's note, from the studio's own measure tool (tools/register). */
async function registerOf(repo, note) {
  const result = await run(process.execPath, [join(repo, "tools", "register", "measure.mjs"), "--text", note, "--json"], { cwd: repo, timeout: 300_000 });
  if (result.code !== 0) return { error: result.stderr.trim().slice(-400) };
  let measured;
  try {
    measured = JSON.parse(result.stdout);
  } catch {
    return { error: "measure.mjs no devolvió JSON" };
  }
  return {
    words: measured.words,
    wordsPerSentence: measured.wordsPerSentence?.mean ?? null,
    explainedWeighted: measured.explainedWeighted ?? null,
    boldTermsPer1000: measured.boldTermsPer1000 ?? null,
    contrastPer1000: measured.contrastPer1000 ?? null,
  };
}

/** The commit the repo is at: a deploy can move it between two topics, so each topic records it. */
async function headOf(repo) {
  const result = await run("git", ["-C", repo, "rev-parse", "--short", "HEAD"]);
  return result.code === 0 ? result.stdout.trim() : null;
}

/** The real vault is only read: this is the proof the bench never wrote in it. */
async function vaultState(vault) {
  if (!vault) return null;
  // No optional locks: a status that cannot refresh the index of the real vault.
  const status = await run("git", ["--no-optional-locks", "-C", vault, "status", "--porcelain"]);
  return status.code === 0 ? status.stdout.trim() : null;
}

// ---- the learner ---------------------------------------------------------

/**
 * The diagnosis answered the way the page answers it: the reader's own submit route, with
 * the answers file it writes and the reasoning the tutor quotes as evidence. The option is
 * the quiz's own key, so the learner is a competent one and the tutor is not asked to
 * re-teach what was already known.
 */
function diagnosisAnswers(quiz) {
  const answers = {};
  const reasoning = {};
  for (const question of quiz.questions ?? []) {
    if (!question || typeof question.id !== "string" || typeof question.options !== "object" || question.options === null) continue;
    const keys = Object.keys(question.options);
    if (!keys.length) continue;
    const keyed = typeof question.answer === "string" && question.answer in question.options;
    const chosen = keyed ? question.answer : keys[0];
    const text = String(question.options[chosen] ?? "").trim();
    const said = text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : `la opción ${chosen}`;
    answers[question.id] = chosen;
    reasoning[question.id] = { razonamiento: `Elijo ${chosen} porque ${said}`, confianza: "seguro" };
  }
  return { answers, reasoning };
}

/**
 * The page's own submit route on the study-view bridge, with the origin it allows. The view
 * URL is `<origin>/<token>/<topic>/<part>`; the route is `<origin>/<token>/submit`.
 */
async function submitToBridge(viewUrl, payload) {
  const url = parseUrl(viewUrl, "vista HTML");
  const token = url.pathname.split("/").filter(Boolean)[0] ?? "";
  const res = await fetch(`${url.origin}/${token}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url.origin },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  const parsed = text ? readJson(text, `submit ${payload.kind}`) : {};
  if (!res.ok) throw new Error(`submit ${payload.kind}: ${res.status} ${parsed.error ?? text.slice(0, 300)}`);
  return parsed;
}

/** The part's own note, named the way the reader names it: `explicaciones/Parte N - <slug>.md`. */
function partNote(root, topicId, plan, partId) {
  const index = (plan?.parts ?? []).findIndex((part) => part.id === partId);
  if (index < 0) return null;
  const dir = join(root, topicId, "explicaciones");
  const exact = join(dir, `Parte ${index + 1} - ${plan.parts[index].slug}.md`);
  if (existsSync(exact)) return exact;
  if (!existsSync(dir)) return null;
  const suffix = ` - ${plan.parts[index].slug}.md`;
  const found = readdirSync(dir).find((name) => name.startsWith("Parte ") && name.endsWith(suffix));
  return found ? join(dir, found) : null;
}

/** What the part draws: the pieces it carries and the actors their payloads declare. */
function visualsOf(note) {
  const text = readFileSync(note, "utf8");
  const pieces = {};
  for (const tag of PIECES) {
    const count = (text.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
    if (count) pieces[tag] = count;
  }
  const actors = new Set();
  // The shape of each figure, not just its presence: two boxes and one arrow is a shape,
  // and five topics drawn with the same shape is the defect the gates cannot see.
  const shapes = [];
  const count = (value) => (Array.isArray(value) ? value.length : 0);
  const sceneShape = (scene) => ({
    boxes: count(scene?.boxes),
    // Arrows: the older `arrows` list, or the reader's paths with `arrow` set (the 53700d1 scenes).
    arrows: count(scene?.arrows) + count((scene?.paths ?? []).filter((path) => path?.arrow)),
    paths: count(scene?.paths),
    icons: count(scene?.icons),
    labels: count(scene?.labels),
    actors: count(scene?.actors),
    props: count(scene?.props),
    marks: count(scene?.marks),
    moves: count(scene?.moves),
  });
  const payloads = text.matchAll(/<script type="application\/json">([\s\S]*?)<\/script>/g);
  for (const [, body] of payloads) {
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      continue;
    }
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    const drawn = [data?.scene, data?.stage?.scene, ...steps.map((step) => step?.stage?.scene)];
    for (const scene of drawn) {
      if (!scene || typeof scene !== "object") continue;
      const shape = sceneShape(scene);
      shapes.push(shape);
      const ink = [...(Array.isArray(scene.actors) ? scene.actors : []), ...(Array.isArray(scene.boxes) ? scene.boxes : [])];
      for (const actor of ink) {
        // The reader's actors name themselves with `tag` (or `id`); `label` is the older name.
        const label = String(actor?.label ?? actor?.tag ?? actor?.id ?? "").trim();
        if (label) actors.add(label);
      }
    }
  }
  // The signature is what a reader sees at a glance: how many boxes, arrows and actors.
  const signatures = shapes.map((shape) => `cajas ${shape.boxes} · flechas ${shape.arrows} · actores ${shape.actors} · piezas ${shape.props} · movimientos ${shape.moves}`);
  return { pieces, actors: [...actors], shapes, signatures };
}

/** The four gates, each on its own, in the repo's own Node. */
async function runGates(repo, note) {
  const results = {};
  for (const tool of GATES) {
    const started = Date.now();
    const result = await run(process.execPath, [join(repo, "tools", tool), note], { cwd: repo, timeout: 300_000 });
    results[tool.replace(/\.mjs$/, "")] = {
      code: result.code,
      seconds: Math.round((Date.now() - started) / 1000),
      timedOut: result.timedOut,
      output: `${result.stdout}\n${result.stderr}`.trim().slice(-4000),
    };
  }
  const failing = Object.keys(results).filter((tool) => results[tool].code !== 0);
  return { tools: results, verdict: failing.length ? "fail" : "pass", failing };
}

// ---- run -----------------------------------------------------------------

async function commandRun(args) {
  const repo = resolve(args.repo ?? REPO_DEFAULT);
  const scratch = resolve(args.scratch ?? "/tmp/bench246/scratch");
  const out = resolve(args.out ?? "/tmp/bench246/out");
  const port = num(args.port, 4799);
  const turnTimeout = num(args["turn-timeout"], 45 * 60) * 1000;
  const maxTurns = num(args["max-turns"], 8);
  const vault = args.vault ? resolve(args.vault) : undefined;
  const wanted = args.topics.length ? TOPICS.filter((topic) => args.topics.includes(topic.id)) : TOPICS;
  mkdirSync(out, { recursive: true });
  mkdirSync(scratch, { recursive: true });
  const root = prepareRoot(scratch, repo);
  const { startStudio, readPlan, listTopics } = await loadRepo(repo);

  const stateFile = join(out, "results.json");
  // The studio writes one timing report per generation beside opened.json: the bench reads them there.
  const timingsDir = join(scratch, "state", "page-timings");
  const results = existsSync(stateFile) ? readJsonFile(stateFile, "resultados anteriores") : { topics: [] };
  results.repo = repo;
  results.scratch = scratch;
  results.port = port;
  results.startedAt = results.startedAt ?? new Date().toISOString();

  const vaultBefore = await vaultState(vault);
  const studio = await startStudio({
    root,
    port,
    token: TOKEN,
    openedFile: join(scratch, "state", "opened.json"),
    chatsFile: join(scratch, "state", "chats.json"),
    offlineCacheDir: join(scratch, "cache"),
  });
  console.error(`bench: studio en ${studio.url} · raíz ${root}`);

  // Every event the studio emits and every line it logs, in one file per topic: this is
  // the log the correction rounds are counted from.
  let logFile = null;
  const log = (kind, data) => {
    if (!logFile) return;
    try {
      writeFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), kind, data })}\n`, { flag: "a" });
    } catch {
      // A log that cannot be written must not take the turn with it.
    }
  };
  const stderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    const text = String(chunk);
    if (text.startsWith("estudio:")) log("studio", text.trim());
    return stderrWrite(chunk, ...rest);
  };

  const events = [];
  let busy = false;
  let alive = true;
  /** How many times the studio said a turn was running: a POST returns before its state frame. */
  let busySeq = 0;
  const unsubscribe = subscribe(
    `${studio.url}events`,
    (event, data) => {
      log(event, data);
      events.push({ at: Date.now(), event, data });
      if (event === "state") {
        busy = Boolean(data?.busy);
        alive = Boolean(data?.alive);
        if (busy) busySeq += 1;
      }
    },
    (error) => console.error(`bench: el flujo de eventos se cortó · ${error.message}`),
  );

  const client = studioClient(studio.port);
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  const waitIdle = async (timeout) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (!busy) return true;
      if (!alive) return false;
      await pause(1000);
    }
    return false;
  };
  /** The turn the POST just started: the studio's state frame may still be on its way. */
  const waitStarted = async (before, timeout) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (busy || busySeq > before) return true;
      await pause(250);
    }
    return false;
  };
  const takeEvents = () => events.splice(0, events.length);

  try {
    for (const topic of wanted) {
      const measured = results.topics.find((entry) => entry.id === topic.id && entry.done);
      if (measured && args["skip-done"] !== "false") {
        console.error(`bench: ${topic.id} ya está medido`);
        continue;
      }
      const entry = { id: topic.id, request: topic.request, startedAt: new Date().toISOString(), turns: [], gateEvents: [], errors: [], parts: [], head: { start: await headOf(repo), end: null } };
      results.topics = results.topics.filter((item) => item.id !== topic.id).concat(entry);
      logFile = join(out, `${topic.id}-studio.log`);
      writeFileSync(logFile, "");
      takeEvents();
      console.error(`bench: ${topic.id} · pidiendo «${topic.request}»`);

      // A turn the previous topic left in flight would refuse this one: wait it out first.
      if (!(await waitIdle(turnTimeout))) console.error(`bench: ${topic.id} · el turno anterior no terminó`);
      const before = new Set(listTopics(root).map((item) => item.id));
      let action = "aprender";
      let repeats = 0;
      let failures = 0;
      let lastSnapshot = "";
      let topicId = null;
      let turns = 0;
      try {
        while (turns < maxTurns) {
          // One action per turn, the way the page does it. A refusal is a finding, never a
          // reason to lose the topic: it is logged and the next turn nudges the tutor.
          try {
            if (!topicId && action !== "aprender") action = "aprender";
            if (action === "aprender") {
              await client.post("api/aprender", { text: topic.request, modo: "universitario" });
            } else if (action === "metodo") {
              await client.post("api/metodo", { tema: topicId, metodo: "pareto" });
            } else if (action === "diagnostico") {
              const view = await client.get(`api/view?topic=${encodeURIComponent(topicId)}&part=quiz`);
              const quiz = readJsonFile(join(root, topicId, "quiz.json"), "quiz");
              const { answers, reasoning } = diagnosisAnswers(quiz);
              const submitted = await submitToBridge(view.url, { kind: "diagnosis", topic: topicId, answers, reasoning });
              entry.diagnosis = { answers, score: submitted.score ?? null, saved: submitted.saved ?? null };
            } else if (action === "parte1") {
              const plan = readPlan(join(root, topicId));
              const first = plan?.parts?.[0];
              const title = plan?.topic || topicId;
              const text = `Escribe la Parte 1 «${first?.title ?? "Parte 1"}» de ${title} (carpeta ${topicId}): con sus visuales, sus ejemplos y su mini-quiz.`;
              await client.post("prompt", { text, tema: topicId });
            } else if (action === "seguir") {
              const plan = readPlan(join(root, topicId));
              await client.post("prompt", { text: `Sigamos con ${plan?.topic || topicId} (carpeta ${topicId}).`, tema: topicId });
            }
          } catch (error) {
            const message = String(error.message ?? error);
            entry.errors.push(`${action}: ${message}`);
            console.error(`bench: ${topic.id} · ${action} rechazado · ${message}`);
            // A turn still in flight is not a finding: the studio refuses by design. Wait it out
            // and ask again, the same way a person would press the button once more.
            if (message.includes("409") && message.includes("trabajando")) {
              failures += 1;
              if (failures > 3) {
                entry.stuck = "el estudio siguió ocupado";
                break;
              }
              await waitIdle(turnTimeout);
              continue;
            }
            failures += 1;
            if (failures > 3) {
              entry.stuck = `el estudio rechazó ${failures} acciones`;
              break;
            }
            action = topicId ? "seguir" : "aprender";
            continue;
          }
          const startedAt = Date.now();
          const turned = await waitStarted(busySeq, 90_000);
          const settled = turned ? await waitIdle(turnTimeout) : await waitIdle(5000);
          const turnEvents = takeEvents();
          turns += 1;
          const gate = turnEvents.filter((item) => item.event === "gate").map((item) => item.data);
          const turn = {
            n: turns,
            action,
            seconds: Math.round((Date.now() - startedAt) / 1000),
            settled,
            tools: turnEvents.filter((item) => item.event === "tool" && item.data?.phase === "start").map((item) => String(item.data?.name ?? "")),
            assistant: turnEvents.filter((item) => item.event === "assistant_end").map((item) => String(item.data?.text ?? "")).join("\n").slice(-2000),
            gate: gate.at(-1) ?? null,
            outcome: turnOutcome(turnEvents),
          };
          entry.turns.push(turn);
          for (const verdict of gate) entry.gateEvents.push(verdict);
          for (const item of turnEvents.filter((event) => event.event === "error")) entry.errors.push(String(item.data?.message ?? ""));
          for (const item of turnEvents.filter((event) => event.event === "notice")) entry.errors.push(`aviso: ${String(item.data?.message ?? "")}`);
          let engineStage = "motor sin informe";
          if (turn.engine) engineStage = `${turn.engine.status ?? "?"} en ${turn.engine.stage ?? "?"}`;
          let said = "sin gate";
          if (turn.gate) said = turn.gate.passing ? "PASA" : "FALLA";
          console.error(`bench: ${topic.id} · turno ${turns} (${action}) ${turn.seconds}s · motor ${engineStage} · gate ${said}`);
          if (!settled) {
            entry.stuck = "el turno no terminó";
            break;
          }

          // Which topic the tutor bound, and what it left on disk.
          if (!topicId) {
            const created = listTopics(root).map((item) => item.id).filter((id) => !before.has(id));
            const newest = created.sort((a, b) => statSync(join(root, b)).mtimeMs - statSync(join(root, a)).mtimeMs);
            topicId = newest[0] ?? null;
          }
          entry.topic = topicId;
          if (!topicId) {
            repeats += 1;
            entry.stuck = "el tutor no creó la carpeta del tema";
            if (repeats > 1) break;
            action = "aprender";
            continue;
          }
          const library = await client.get("api/library");
          const current = library.topics.find((item) => item.id === topicId) ?? {};
          entry.library = current;
          entry.title = current.title ?? topicId;
          turn.engine = { status: current.status ?? null, stage: current.stage ?? null, nextStage: current.nextStage ?? null, part: current.part ?? null, method: current.method ?? null };
          const plan = readPlan(join(root, topicId));
          const note = partNote(root, topicId, plan, plan?.parts?.[0]?.id ?? "p1");
          if (note) {
            entry.done = true;
            break;
          }
          const now = snapshot(join(root, topicId));
          if (now === lastSnapshot) repeats += 1;
          else repeats = 0;
          lastSnapshot = now;
          if (repeats >= 3) {
            entry.stuck = "el tutor no avanzó en tres turnos";
            break;
          }
          const hasQuiz = existsSync(join(root, topicId, "quiz.json"));
          const answered = existsSync(join(root, topicId, "quiz.answers.json"));
          // The page asks for the method when the next stage is method, so the bench answers it then.
          const stage = String(current.nextStage || current.stage || "");
          if (hasQuiz && !answered) action = "diagnostico";
          else if (stage === "method" && !current.method) action = "metodo";
          else if (stage === "planning" || stage === "explanation" || stage === "") action = "parte1";
          else action = "seguir";
        }
      } catch (error) {
        entry.errors.push(String(error.message ?? error));
        console.error(`bench: ${topic.id} · ${error.message}`);
      }

      // The measurement: the four gates on every part the turn wrote, and the copy of the
      // topic that the reader renders locally for the screenshots.
      if (topicId) {
        const plan = readPlan(join(root, topicId));
        const parts = plan?.parts ?? [];
        const written = parts.map((part) => ({ part, note: partNote(root, topicId, plan, part.id) })).filter((item) => item.note);
        for (const { part, note } of written) {
          const gates = await runGates(repo, note);
          const register = await registerOf(repo, note);
          entry.parts.push({ id: part.id, title: part.title, note: note.slice(root.length + 1), gates, register, ...visualsOf(note) });
          const failing = gates.failing.length ? ` (${gates.failing.join(", ")})` : "";
          console.error(`bench: ${topic.id} · ${part.id} gates ${gates.verdict}${failing}`);
        }
        const copy = join(out, topic.id, "vault", topicId);
        mkdirSync(dirname(copy), { recursive: true });
        cpSync(join(root, topicId), copy, { recursive: true });
        entry.copy = copy;
        entry.files = fileList(copy);
      }
      // Corrections the turn sent, from the studio's timing reports: every correction is a model call
      // of its own reason, part checks included. The log's failing gate frames are kept beside them:
      // the last frame of a spent budget is not a correction, the stop it leads to is.
      entry.timings = timingsOf(timingsDir, entry.startedAt, join(out, `${topic.id}-timings`));
      entry.correctionRounds = entry.timings.corrections;
      entry.gateFailures = correctionsInLog(logFile);
      entry.head.end = await headOf(repo);
      entry.finishedAt = new Date().toISOString();
      writeFileSync(stateFile, `${JSON.stringify(results, null, 2)}\n`);
      writeFileSync(join(out, "report.md"), renderReport(results));
      const verdicts = entry.parts.map((part) => part.gates.verdict).join("/") || "-";
      const stuck = entry.stuck ? ` · ATASCADO: ${entry.stuck}` : "";
      console.error(`bench: ${topic.id}: ${entry.parts.length} parte(s) · gates ${verdicts} · ${entry.correctionRounds} corrección(es) · ${entry.turns.length} turno(s)${stuck}`);
    }
    results.vault = { path: vault ?? null, before: vaultBefore, after: await vaultState(vault) };
    results.finishedAt = new Date().toISOString();
    writeFileSync(stateFile, `${JSON.stringify(results, null, 2)}\n`);
    writeFileSync(join(out, "report.md"), renderReport(results));
    console.error(`bench: resultados en ${stateFile}`);
  } finally {
    unsubscribe();
    process.stderr.write = stderrWrite;
    await studio.close();
  }
}

// ---- gates ---------------------------------------------------------------

async function commandGates(args) {
  const repo = resolve(args.repo ?? REPO_DEFAULT);
  const out = resolve(args.out ?? "/tmp/bench246/out");
  const results = readJsonFile(join(out, "results.json"), "resultados");
  for (const topic of results.topics) {
    if (!topic.copy) continue;
    for (const part of topic.parts) {
      const relative = part.note.split("/").slice(1).join("/");
      const note = join(topic.copy, relative);
      if (!existsSync(note)) continue;
      part.gates = await runGates(repo, note);
      part.register = await registerOf(repo, note);
      Object.assign(part, visualsOf(note));
      console.error(`${topic.id} · ${part.id} ${part.gates.verdict}`);
    }
  }
  writeFileSync(join(out, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(join(out, "report.md"), renderReport(results));
}

// ---- shots ---------------------------------------------------------------

/** One capture per piece the page draws (each lk-story, scene, quiz...), black × wide like the page. */
async function capturePieces(page, dir, prefix) {
  const captures = [];
  const pieces = await page.$$(PIECES.join(", "));
  for (const [index, piece] of pieces.entries()) {
    const tag = await piece.evaluate((node) => node.tagName.toLowerCase());
    const file = join(dir, `${prefix}-${tag}-${index + 1}-black-wide.png`);
    try {
      await piece.scrollIntoViewIfNeeded({ timeout: 5000 });
      await piece.screenshot({ path: file, timeout: 15_000 });
      captures.push({ tag, file });
    } catch (error) {
      captures.push({ tag, error: String(error.message ?? error).split("\n")[0] });
    }
  }
  return captures;
}

/**
 * The reader, rendering the copies: the same bridge the studio serves, over a vault made
 * of the copied topics, screenshotted black × wide (the two reading modes the learner
 * reads on a monitor).
 */
async function commandShots(args) {
  const repo = resolve(args.repo ?? REPO_DEFAULT);
  const out = resolve(args.out ?? "/tmp/bench246/out");
  const shots = resolve(args.shots ?? "/tmp/bench-shots");
  mkdirSync(shots, { recursive: true });
  const { registerBridge } = await import(pathToFileURL(join(repo, "integrations", "pi", "bridge.ts")).href);
  let playwright;
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright", "/home/ale/.npm-global/lib/node_modules/playwright/index.mjs"].filter(Boolean);
  for (const id of candidates) {
    try {
      playwright = await import(id);
      break;
    } catch {
      // The next candidate is the one this machine has.
    }
  }
  if (!playwright) throw new Error("playwright is not installed: set PLAYWRIGHT_MODULE");

  const results = readJsonFile(join(out, "results.json"), "resultados");
  const vault = join(shots, "vault");
  mkdirSync(vault, { recursive: true });
  const tools = new Map();
  const handlers = new Map();
  registerBridge(
    {
      on(event, handler) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return () => {};
      },
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      sendUserMessage() {
        // The screenshots read pages; nothing is delivered to a tutor.
      },
    },
    { root: vault },
  );
  const view = async (params) => (await tools.get("learning_view").execute("shot", params, undefined, undefined, { cwd: vault })).structuredContent;

  const browser = await playwright.chromium.launch();
  try {
    for (const topic of results.topics) {
      if (!topic.copy) continue;
      const topicId = topic.copy.split("/").pop();
      cpSync(topic.copy, join(vault, topicId), { recursive: true });
      for (const part of topic.parts) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
        try {
          const found = await view({ topic: topicId, part: part.id });
          const local = parseUrl(found.localBase ?? found.base, "vista local");
          const address = new URL(String(found.url).slice(String(found.base).length), local).href;
          const themed = `${address}${address.includes("?") ? "&" : "?"}theme=black`;
          await page.goto(themed, { waitUntil: "load" });
          const toggle = page.locator(".reading-toggle");
          if (await toggle.isVisible()) await toggle.click();
          await page.waitForFunction(() => document.body.classList.contains("wide"), null, { timeout: 10_000 }).catch(() => {});
          // The figures draw themselves once the fonts land; a page captured before that is empty paper.
          await page.waitForTimeout(1500);
          // What the capture really shows, so the images can be judged without guessing: the paper
          // it was drawn on, the ink it carries and the words on the page.
          const drawn = await page.evaluate(() => ({
            theme: document.documentElement.dataset.theme ?? "",
            wide: document.body.classList.contains("wide"),
            title: document.title,
            heading: document.querySelector("h1")?.textContent?.trim() ?? "",
            svgs: document.querySelectorAll("svg").length,
            decks: document.querySelectorAll("lk-scene, lk-story, lk-walkthrough, lk-cards, lk-memory, lk-tables, lk-venn").length,
            questions: document.querySelectorAll("lk-quiz, .lk-quiz, fieldset").length,
            chars: document.body.innerText.trim().length,
            height: Math.round(document.documentElement.scrollHeight),
          }));
          const file = join(shots, `${topicId}-${part.id}-black-wide.png`);
          await page.screenshot({ path: file, fullPage: true });
          part.screenshot = file;
          part.shot = drawn;
          part.pieceShots = await capturePieces(page, shots, `${topicId}-${part.id}`);
          const captured = part.pieceShots.filter((item) => item.file).length;
          console.error(`${topicId} · ${part.id} → ${file} · ${captured}/${part.pieceShots.length} piezas · ${JSON.stringify(drawn)}`);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
    for (const handler of handlers.get("session_shutdown") ?? []) await handler({}, {});
  }
  writeFileSync(join(out, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(join(out, "report.md"), renderReport(results));
}

// ---- report --------------------------------------------------------------

/** The table the issue asks for: one row per topic, and the defects the numbers show. */
function renderReport(results) {
  const lines = [
    "# Bench del tutor en temas sin ejemplo (issue #246)",
    "",
    `- Repo: \`${results.repo}\``,
    `- Raíz de prueba: \`${results.scratch}\``,
    `- Runtime: ${AGENTE} · ${MODELO} (el de producción)`,
    `- Empezó: ${results.startedAt ?? "-"} · terminó: ${results.finishedAt ?? "-"}`,
    "",
    "| Tema | Carpeta | Partes | Gates | Correcciones | Turnos | Piezas | Actores | Capturas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const topic of results.topics) {
    const gates = topic.parts.map((part) => `${part.id}: ${part.gates.verdict}${part.gates.failing.length ? ` (${part.gates.failing.join(", ")})` : ""}`).join("; ") || "-";
    const pieces = [...new Set(topic.parts.flatMap((part) => Object.keys(part.pieces ?? {})))].join(", ") || "-";
    const actors = [...new Set(topic.parts.flatMap((part) => part.actors ?? []))].slice(0, 12).join(", ") || "-";
    const shots = topic.parts.map((part) => part.screenshot).filter(Boolean).join("<br>") || "-";
    lines.push(`| ${topic.request} | ${topic.topic ?? "-"} | ${topic.parts.length} | ${gates} | ${topic.correctionRounds ?? 0} | ${topic.turns?.length ?? 0} | ${pieces} | ${actors} | ${shots} |`);
  }
  // The shape of every figure: the gates measure geometry, not whether the drawing is the
  // thing being taught. Five topics drawn with the same two boxes is the pattern to see.
  lines.push("", "## Forma de las figuras", "");
  const everySignature = [];
  for (const topic of results.topics) {
    for (const part of topic.parts) {
      const signatures = part.signatures ?? [];
      everySignature.push(...signatures);
      lines.push(`- ${topic.request} · ${part.id}: ${signatures.length ? signatures.join(" | ") : "sin figuras"}`);
    }
  }
  const repeated = everySignature.length > 1 && new Set(everySignature).size === 1;
  if (repeated) lines.push("", `**Todas las figuras comparten la misma forma**: ${everySignature[0]}.`);
  // The register the studio's own measure tool gives each part (tools/register/measure.mjs).
  const pct = (value) => (typeof value === "number" ? `${Math.round(value * 100)}%` : "-");
  const num = (value, digits) => (typeof value === "number" ? value.toFixed(digits) : "-");
  lines.push("", "## Registro (tools/register/measure.mjs)", "", "| Tema | Parte | palabras/frase | términos explicados (uso) | negritas/1000 | contrastes/1000 |", "| --- | --- | --- | --- | --- | --- |");
  for (const topic of results.topics) {
    for (const part of topic.parts) {
      const register = part.register ?? {};
      lines.push(`| ${topic.request} | ${part.id} | ${num(register.wordsPerSentence, 1)} | ${pct(register.explainedWeighted)} | ${num(register.boldTermsPer1000, 1)} | ${num(register.contrastPer1000, 2)} |`);
    }
  }
  lines.push("", "## Lo que dijo el motor en cada turno", "");
  for (const topic of results.topics) {
    lines.push(`### ${topic.request}`, "");
    for (const turn of topic.turns ?? []) {
      let engine = "motor sin informe";
      if (turn.engine) {
        const next = turn.engine.nextStage && turn.engine.nextStage !== turn.engine.stage ? ` → ${turn.engine.nextStage}` : "";
        engine = `${turn.engine.status ?? "?"} en ${turn.engine.stage ?? "?"}${next}`;
      }
      let gate = "sin gate";
      if (turn.gate) gate = turn.gate.passing ? "PASA" : `FALLA (${(turn.gate.fails ?? []).join(", ") || "-"})`;
      lines.push(`- turno ${turn.n} (${turn.action}, ${turn.seconds}s): motor ${engine}; gate ${gate}; desenlace: ${turn.outcome ?? "-"}; herramientas: ${[...new Set(turn.tools)].join(", ") || "-"}`);
    }
    for (const error of topic.errors ?? []) lines.push(`- aviso/error: ${error}`);
    if (topic.stuck) lines.push(`- **atascado**: ${topic.stuck}`);
    lines.push("");
  }
  if (results.vault?.path) {
    const same = results.vault.before === results.vault.after;
    lines.push("## El vault real no se tocó", "", `- \`git -C ${results.vault.path} status --porcelain\` antes y después: ${same ? "idéntico" : "CAMBIÓ"}`, "");
  }
  return lines.join("\n");
}

// ---- main ----------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
if (args.command === "run") await commandRun(args);
else if (args.command === "shots") await commandShots(args);
else if (args.command === "gates") await commandGates(args);
else {
  console.error("uso: bench.mjs run|shots|gates [--repo --scratch --out --port --shots --topic --max-turns --turn-timeout --vault]");
  process.exit(2);
}
