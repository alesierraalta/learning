/**
 * Code-exercise judge: runs a learner's program against stdin/stdout tests in
 * a throwaway container, the way online judges grade, so any language works
 * the same. A language is one entry of the runner catalogue (image, source file
 * name, optional compile and setup commands, run command); adding one needs no
 * code change. Builtins come from runners.json, a machine overlay can extend or
 * replace them, and a topic overlay can add a language for one topic only.
 *
 * The container has no network, bounded memory/CPU/processes, a read-only
 * root, no capabilities and a non-root user; every test has a time limit and
 * output files are size-limited. Results are read back from the work
 * directory only as regular files that resolve inside it, so a program cannot
 * make the host read anything else through a symlink.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RUNNERS_FILE = join(dirname(fileURLToPath(import.meta.url)), "runners.json");
const MAX_CODE_CHARS = 100_000;
const MAX_TESTS = 50;
const MAX_IO_CHARS = 100_000;
const SHOWN_CHARS = 8000;
/** Grading compares the whole output, so it is read up to the largest expected output in bytes; only the shown copy is clipped. */
const JUDGED_BYTES = MAX_IO_CHARS * 4 + 1;
const COMPILE_SECONDS = 60;
const DEFAULT_LIMIT_SECONDS = 2;
const MAX_LIMIT_SECONDS = 20;
/** Output file limit inside the container, in shell `ulimit -f` blocks. */
const FILE_BLOCKS = 4096;
const KILLED = 137;
/** Docker is only asked while an /api/runners request is open, never while a page is built. */
const STATUS_TTL_MS = 30_000;
const STATUS_TIMEOUT_MS = 2500;
const HOST_IMAGES = new Set(["host", "local", "localhost", "native", "none", "-"]);

export interface Runner {
  image: string;
  file: string;
  /** Images whose own ENTRYPOINT would swallow `sh judge.sh` need this set to `sh`. */
  entrypoint?: string;
  compile?: string;
  /** A shell command run inside the same container, before any learner code or test. */
  setup?: string;
  run: string;
  /** Approximate compressed image size, shown beside a friendly language label. */
  size?: string;
  /** Human name for the install hint, e.g. "Python 3.12"; the language key is the fallback. */
  label?: string;
}
export interface CodeTest {
  nombre: string;
  entrada: string;
  /** Expected stdout; absent for a free run that only shows the output. */
  salida?: string;
  oculto?: boolean;
}
export interface Exercise {
  titulo: string;
  enunciado: string;
  lenguaje: string;
  plantilla: string;
  /** Seed script written next to ejercicio.json, copied to .judge/seed before `setup` runs. */
  setupFile?: string;
  parte?: string;
  limite_segundos: number;
  tests: CodeTest[];
}
export type Estado = "correcto" | "incorrecto" | "error" | "tiempo" | "ejecutado";
export interface TestResult {
  nombre: string;
  oculto: boolean;
  estado: Estado;
  entrada?: string;
  esperado?: string;
  obtenido?: string;
  errores?: string;
  codigo: number | null;
}
export interface RunResult {
  compilacion: { ok: boolean; salida: string };
  resultados: TestResult[];
  aprobados: number;
  total: number;
  /** Set when this machine could not execute the answer: no test ran, so no score is claimed. */
  aviso?: string;
}

/** An honest result for an answer that could not be executed here: nothing was graded. */
export function unavailableRun(aviso: string): RunResult {
  // `total` counts graded tests, not authored ones: 0/2 here would claim a score
  // for tests that never ran (#344).
  return { compilacion: { ok: true, salida: "" }, resultados: [], aprobados: 0, total: 0, aviso };
}

export class CodeRunError extends Error {}
/** The image was never pulled or named wrongly; the caller offers `learning code setup`. */
export class ImageMissingError extends CodeRunError {}
/** Docker itself is down or unreachable; retrying after starting the daemon can help. */
export class DockerDaemonError extends CodeRunError {}

/** Classifies a failed `docker image inspect`: connection refusal means the daemon is down, everything else means the image is missing. */
export const imageFailure = (code: number | null, stderr: string): "daemon" | "missing" =>
  code !== 0 && /(cannot connect|failed to connect)/i.test(stderr) ? "daemon" : "missing";

export interface ImageStatus {
  image: string;
  state: "present" | "missing" | "unknown";
  present: boolean;
  bytes?: number;
  detail?: string;
}

const statusCache = new Map<string, { at: number; value: ImageStatus }>();
const statusFlights = new Map<string, Promise<ImageStatus>>();

function inspectImage(image: string, dockerBin: string, timeoutMs: number): Promise<ImageStatus> {
  return new Promise((resolve) => {
    const child = spawn(dockerBin, ["image", "inspect", image, "--format", "{{.Size}}"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { if (stdout.length < 1000) stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 1000) stderr += chunk.toString("utf8"); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ image, state: "unknown", present: false, detail: `cannot run ${dockerBin}: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const bytes = Number(stdout.trim());
        resolve({ image, state: "present", present: true, ...(Number.isFinite(bytes) && bytes > 0 ? { bytes } : {}) });
      } else if (imageFailure(code, stderr) === "daemon") {
        resolve({ image, state: "unknown", present: false, detail: stderr.trim() || `docker exit ${code}` });
      } else resolve({ image, state: "missing", present: false, detail: stderr.trim() || `docker exit ${code}` });
    });
  });
}

/**
 * A short, cached look at image presence for the quiet runnable list. Repeated pages share one
 * answer for 30 s; concurrent requests share the same in-flight inspect, so a reader never waits on
 * a queue of Docker calls, and a stopped daemon is "unknown", never a page error.
 */
export async function imageStatuses(
  images: string[],
  { dockerBin = "docker", timeoutMs = STATUS_TIMEOUT_MS, ttlMs = STATUS_TTL_MS }: { dockerBin?: string; timeoutMs?: number; ttlMs?: number } = {},
): Promise<Record<string, ImageStatus>> {
  const result: Record<string, ImageStatus> = {};
  await Promise.all([...new Set(images)].map(async (image) => {
    const key = `${dockerBin}|${image}`;
    const cached = statusCache.get(key);
    if (cached && Date.now() - cached.at < ttlMs) { result[image] = cached.value; return; }
    let flight = statusFlights.get(key);
    if (!flight) {
      flight = inspectImage(image, dockerBin, timeoutMs).then((value) => {
        statusCache.set(key, { at: Date.now(), value });
        return value;
      }).finally(() => statusFlights.delete(key));
      statusFlights.set(key, flight);
    }
    result[image] = await flight;
  }));
  return result;
}

export function forgetImageStatus(image: string): void {
  for (const key of statusCache.keys()) if (key.endsWith(`|${image}`)) statusCache.delete(key);
}

export interface RunnerListing {
  language: string;
  label: string;
  image: string;
  file: string;
  size: string;
  state: ImageStatus["state"];
  present: boolean;
  /** Short, copyable install line: the image reference without its pin. */
  pull: string;
  /** The exact pinned reference, shown small when the image is pinned. */
  reference?: string;
  detail?: string;
}

export interface RunnerList {
  languages: RunnerListing[];
  runnable: string[];
  warnings: string[];
  sources: RunnerSource[];
}

function buildRunnerList(catalogue: RunnerCatalogue, statuses: Record<string, ImageStatus>): RunnerList {
  const languages = Object.entries(catalogue.runners).map(([language, runner]) => {
    const state = statuses[runner.image] ?? { image: runner.image, state: "unknown" as const, present: false };
    return {
      language, label: runner.label ?? language, image: runner.image, file: runner.file, size: runner.size ?? "tamaño desconocido",
      state: state.state, present: state.present, pull: `docker pull ${runner.image.split("@")[0]}`,
      ...(runner.image.includes("@") ? { reference: runner.image } : {}),
      ...(state.detail ? { detail: clip(state.detail) } : {}),
    };
  });
  return { languages, runnable: languages.filter((l) => l.present).map((l) => l.language), warnings: catalogue.warnings, sources: catalogue.sources };
}

/** The merged catalogue, annotated with this machine's image state; safe to send to a page or a tool. */
export async function runnerList(catalogue: RunnerCatalogue, options: { dockerBin?: string } = {}): Promise<RunnerList> {
  return buildRunnerList(catalogue, await imageStatuses(Object.values(catalogue.runners).map((r) => r.image), options));
}

/** What a page may show without ever waiting on Docker: the last cached answer, if any. */
export function cachedRunnerList(catalogue: RunnerCatalogue): RunnerList {
  const statuses: Record<string, ImageStatus> = {};
  for (const [key, entry] of statusCache) {
    if (Date.now() - entry.at >= STATUS_TTL_MS) continue;
    const image = key.slice(key.indexOf("|") + 1);
    if (!statuses[image]) statuses[image] = entry.value;
  }
  return buildRunnerList(catalogue, statuses);
}

export interface PullState {
  language: string;
  image: string;
  state: "pulling" | "done" | "failed";
  message: string;
  at: number;
}

const pulls = new Map<string, PullState>();
export const pullState = (language: string): PullState | undefined => pulls.get(language);

/** An explicit learner action: nothing here runs on page load or in the background. */
export function pullRunnerImage(language: string, runner: Runner, dockerBin = "docker"): PullState {
  if (!/^[\w./:@-]+$/.test(runner.image) || HOST_IMAGES.has(runner.image.toLowerCase())) {
    throw new CodeRunError(`${language}: refusing to pull a host command`);
  }
  const current = pulls.get(language);
  if (current?.state === "pulling") return current;
  const state: PullState = { language, image: runner.image, state: "pulling", message: `Descargando ${runner.image}…`, at: Date.now() };
  pulls.set(language, state);
  const child = spawn(dockerBin, ["pull", runner.image], { stdio: ["ignore", "pipe", "pipe"] });
  let last = "";
  const note = (chunk: Buffer) => {
    const lines = (last + chunk.toString("utf8")).split(/\r?\n/).filter(Boolean);
    last = lines.at(-1) ?? "";
  };
  child.stdout.on("data", note);
  child.stderr.on("data", note);
  const finish = (code: number | null, error?: Error) => {
    const done = code === 0;
    const next: PullState = {
      ...state,
      state: done ? "done" : "failed",
      message: done ? `Imagen lista: ${runner.image}` : clip(error?.message || last || `docker salió con ${code}`),
      at: Date.now(),
    };
    pulls.set(language, next);
    if (done) forgetImageStatus(runner.image);
  };
  child.on("error", (error) => finish(null, error));
  child.on("close", (code) => finish(code));
  return state;
}

/** The judge work tree lives on shared-memory tmpfs when available (RAM-bounded, wiped on reboot) and falls back to the default temp dir. */
export function workRoot(): string {
  return existsSync("/dev/shm") ? "/dev/shm" : tmpdir();
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Every command in a runner is executed by `sh` inside the container, never by the host shell. */
function checkCommand(value: unknown, where: string, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") throw new CodeRunError(`${where}.${field} must be a command`);
  if (/^\s*sudo\b/i.test(value) || /\bdocker\s+(run|exec|pull|container|start)\b/i.test(value)) {
    throw new CodeRunError(`${where}.${field} names a host command; a runner may only run inside its image`);
  }
  return value;
}

function runnerEntry(lang: string, entry: unknown, where: string): Runner {
  if (!/^[\w+-]+$/.test(lang)) throw new CodeRunError(`${where}: language names are letters, digits, _ + -`);
  if (!isRecord(entry)) throw new CodeRunError(`${where} must be an object`);
  const { image, file: source, entrypoint, compile, setup, run, size, label } = entry;
  if (typeof image !== "string" || !/^[\w./:@-]+$/.test(image) || HOST_IMAGES.has(image.toLowerCase())) {
    throw new CodeRunError(`${where}.image must be a docker image name; host execution is never allowed`);
  }
  if (typeof source !== "string" || !/^[\w-]+\.[\w]+$/.test(source)) throw new CodeRunError(`${where}.file must be a plain file name`);
  if (entrypoint !== undefined && (typeof entrypoint !== "string" || !/^[\w/.-]+$/.test(entrypoint))) {
    throw new CodeRunError(`${where}.entrypoint must be a simple shell path`);
  }
  const compileCommand = checkCommand(compile, where, "compile");
  const setupCommand = checkCommand(setup, where, "setup");
  if (typeof run !== "string" || run.trim() === "") throw new CodeRunError(`${where}.run must be a command`);
  checkCommand(run, where, "run");
  if (size !== undefined && (typeof size !== "string" || !/^~?\d+(?:\.\d+)?\s*(?:KB|MB|GB)$/i.test(size.trim()))) {
    throw new CodeRunError(`${where}.size must be an approximate size such as "~30 MB"`);
  }
  if (label !== undefined && (typeof label !== "string" || label.trim() === "" || label.length > 80)) {
    throw new CodeRunError(`${where}.label must be a short human name`);
  }
  return {
    image,
    file: source,
    ...(entrypoint ? { entrypoint } : {}),
    run,
    ...(compileCommand ? { compile: compileCommand } : {}),
    ...(setupCommand ? { setup: setupCommand } : {}),
    ...(size ? { size: size.trim() } : {}),
    ...(label ? { label: label.trim() } : {}),
  };
}

function readRunnerFile(file: string): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new CodeRunError(`${file}: ${(err as Error).message}`);
  }
  if (!isRecord(raw)) throw new CodeRunError(`${file} must be an object of languages`);
  return raw;
}

/** The builtin layer stays strict: a broken shipped entry is a deployment error. */
export function loadRunners(file = RUNNERS_FILE): Record<string, Runner> {
  const raw = readRunnerFile(file);
  const runners: Record<string, Runner> = {};
  for (const [lang, entry] of Object.entries(raw)) runners[lang] = runnerEntry(lang, entry, `${file}: ${lang}`);
  return runners;
}

export interface RunnerSource {
  kind: "builtin" | "machine" | "topic";
  file: string;
  languages: string[];
}
export interface RunnerCatalogue {
  runners: Record<string, Runner>;
  /** Human-readable rejections: an overlay never breaks a page, it says what it ignored. */
  warnings: string[];
  sources: RunnerSource[];
}
export interface CatalogueOptions {
  builtinFile?: string;
  machineFile?: string;
  env?: NodeJS.ProcessEnv;
  topicDir?: string;
}

const expandHome = (path: string, env: NodeJS.ProcessEnv) =>
  path === "~" || path.startsWith("~/") ? join(env.HOME || homedir(), path.slice(2)) : path;

function machineRunnerFile(options: CatalogueOptions, env: NodeJS.ProcessEnv): string {
  if (env.LEARNING_RUNNERS?.trim()) return expandHome(env.LEARNING_RUNNERS.trim(), env);
  if (options.machineFile) return options.machineFile;
  return join(env.XDG_CONFIG_HOME?.trim() || join(env.HOME || homedir(), ".config"), "learning", "runners.json");
}

/**
 * Overlay validation is deliberately forgiving: one bad entry is reported and skipped, so a typo in a
 * machine or topic file cannot turn a reader page into an error page. Topic entries may add a language,
 * but never replace an entry an earlier layer already declared: that is the execution contract.
 */
function mergeOverlay(file: string, kind: "machine" | "topic", base: Record<string, Runner>, warnings: string[], sources: RunnerSource[]): Record<string, Runner> {
  let raw: Record<string, unknown>;
  try {
    raw = readRunnerFile(file);
  } catch (err) {
    // An optional layer that does not exist is not a warning: only a bad file is.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return base;
    warnings.push(`${file}: ${(err as Error).message}; ${kind} overlay ignored`);
    return base;
  }
  const runners = { ...base };
  const accepted: string[] = [];
  for (const [lang, entry] of Object.entries(raw)) {
    const where = `${file}: ${lang}`;
    try {
      if (kind === "topic" && Object.hasOwn(base, lang)) {
        throw new CodeRunError(`${lang} is already declared by an earlier layer; a topic may add a language, not change its runner`);
      }
      runners[lang] = runnerEntry(lang, entry, where);
      accepted.push(lang);
    } catch (err) {
      warnings.push(`${where}: ${(err as Error).message}; entry ignored`);
    }
  }
  sources.push({ kind, file, languages: accepted });
  return runners;
}

/** Builtins < machine (~/.config/learning or $LEARNING_RUNNERS) < topic (beside plan.json). */
export function loadCatalogue(options: CatalogueOptions = {}): RunnerCatalogue {
  const env = options.env ?? process.env;
  const builtinFile = options.builtinFile ?? RUNNERS_FILE;
  const builtins = loadRunners(builtinFile);
  const warnings: string[] = [];
  const sources: RunnerSource[] = [{ kind: "builtin", file: builtinFile, languages: Object.keys(builtins) }];
  const machineFile = machineRunnerFile(options, env);
  const machine = mergeOverlay(machineFile, "machine", builtins, warnings, sources);
  const topicFile = options.topicDir ? join(options.topicDir, "runners.json") : undefined;
  const runners = topicFile ? mergeOverlay(topicFile, "topic", machine, warnings, sources) : machine;
  return { runners, warnings, sources };
}

/** Reads and validates `<topic>/codigo/<id>/ejercicio.json`; errors name the file and the field. */
export function readExercise(file: string, runners: Record<string, Runner>): Exercise {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new CodeRunError(`${file}: ${(err as Error).message}`);
  }
  const fail = (detail: string): never => {
    throw new CodeRunError(`${file}: ${detail}`);
  };
  if (!isRecord(raw)) return fail("must be a JSON object");
  const text = (key: string, required: boolean): string | undefined => {
    const value = raw[key];
    if (value === undefined && !required) return undefined;
    if (typeof value !== "string" || (required && value.trim() === "")) return fail(`${key} must be a nonempty string`);
    return value;
  };
  const titulo = text("titulo", true)!;
  const enunciado = text("enunciado", true)!;
  const lenguaje = text("lenguaje", true)!;
  if (!Object.hasOwn(runners, lenguaje)) fail(`unknown lenguaje "${lenguaje}"; known: ${Object.keys(runners).join(", ")}`);
  const plantilla = text("plantilla", false) ?? "";
  const setupFile = text("setupFile", false);
  if (setupFile && !/^[\w-]+\.[\w]+$/.test(setupFile)) fail("setupFile must be a plain file name next to ejercicio.json");
  const parte = text("parte", false);
  const limit = raw.limite_segundos ?? DEFAULT_LIMIT_SECONDS;
  if (typeof limit !== "number" || !(limit > 0 && limit <= MAX_LIMIT_SECONDS)) fail(`limite_segundos must be a number in (0, ${MAX_LIMIT_SECONDS}]`);
  if (!Array.isArray(raw.tests) || raw.tests.length === 0) return fail("needs at least one test");
  if (raw.tests.length > MAX_TESTS) fail(`at most ${MAX_TESTS} tests`);
  const tests = raw.tests.map((t: unknown, i: number): CodeTest => {
    if (!isRecord(t)) return fail(`tests[${i}] must be an object`);
    if (typeof t.nombre !== "string" || t.nombre.trim() === "") fail(`tests[${i}].nombre must be a nonempty string`);
    if (typeof t.entrada !== "string" || t.entrada.length > MAX_IO_CHARS) fail(`tests[${i}].entrada must be a string`);
    if (typeof t.salida !== "string" || t.salida.length > MAX_IO_CHARS) fail(`tests[${i}].salida must be a string`);
    if (t.oculto !== undefined && typeof t.oculto !== "boolean") fail(`tests[${i}].oculto must be true or false`);
    return { nombre: t.nombre as string, entrada: t.entrada as string, salida: t.salida as string, oculto: t.oculto === true };
  });
  return { titulo, enunciado, lenguaje, plantilla, ...(setupFile ? { setupFile } : {}), ...(parte ? { parte } : {}), limite_segundos: limit as number, tests };
}

/** What the page may see: hidden tests keep only their name. */
export function publicExercise(ex: Exercise) {
  return {
    ...ex,
    tests: ex.tests.map((t) => (t.oculto ? { nombre: t.nombre, oculto: true } : { nombre: t.nombre, oculto: false, entrada: t.entrada, salida: t.salida })),
  };
}

/** What the page may see of a run: hidden results keep only name, state and exit code. */
export function forPage(result: RunResult): RunResult {
  return {
    ...result,
    resultados: result.resultados.map((r) => (r.oculto ? { nombre: r.nombre, oculto: true, estado: r.estado, codigo: r.codigo } : r)),
  };
}

const normalize = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");

/** Judge rule: equal after CRLF, trailing spaces per line and trailing blank lines are ignored. */
export const sameOutput = (obtained: string, expected: string) => normalize(obtained) === normalize(expected);

const clip = (text: string) => (text.length > SHOWN_CHARS ? `${text.slice(0, SHOWN_CHARS)}\n… (salida recortada)` : text);

/** A file the program could have replaced is read only when it is a regular file resolving to itself. */
function readJudged(path: string): string | undefined {
  try {
    if (realpathSync(path) !== path || !lstatSync(path).isFile()) return undefined;
    const fd = openSync(path, "r");
    try {
      const buffer = Buffer.alloc(JUDGED_BYTES);
      const read = readSync(fd, buffer, 0, buffer.length, 0);
      return buffer.subarray(0, read).toString("utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

function judgeScript(count: number, limit: number, compiled: boolean, setup: boolean): string {
  const lines = ["cd /work", `ulimit -f ${FILE_BLOCKS}`, "J=/work/.judge"];
  if (setup) {
    lines.push(
      `timeout -s KILL ${COMPILE_SECONDS} sh $J/setup.sh > $J/setup.txt 2>&1`,
      "echo $? > $J/setup.code",
      '[ "$(cat $J/setup.code)" = 0 ] || exit 0',
    );
  }
  if (compiled) {
    lines.push(
      `timeout -s KILL ${COMPILE_SECONDS} sh $J/compile.sh > $J/compile.txt 2>&1`,
      "echo $? > $J/compile.code",
      '[ "$(cat $J/compile.code)" = 0 ] || exit 0',
    );
  }
  lines.push(
    "i=0",
    `while [ $i -lt ${count} ]; do`,
    "  s=$(date +%s)",
    `  timeout -s KILL ${limit} sh $J/run.sh < $J/in/$i > $J/out/$i.out 2> $J/out/$i.err`,
    "  c=$?",
    '  echo "$c $(( $(date +%s) - s ))" > $J/meta/$i',
    "  rm -f $J/in/$i",
    "  i=$((i+1))",
    "done",
  );
  return `${lines.join("\n")}\n`;
}

function docker(bin: string, args: string[], deadlineMs: number, name?: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 4000) stderr += chunk.toString("utf8");
    });
    const timer = setTimeout(() => {
      if (name) spawn(bin, ["kill", name], { stdio: "ignore" });
      child.kill("SIGKILL");
    }, deadlineMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new CodeRunError(`cannot run ${bin}: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

let queue: Promise<unknown> = Promise.resolve();

export interface RunOptions {
  runner: Runner;
  code: string;
  tests: CodeTest[];
  limitSeconds: number;
  /** Contents of the exercise's setupFile, copied to .judge/seed inside the container. */
  setupFileContent?: string;
  /** Docker CLI binary (tests). */
  dockerBin?: string;
}

/** Runs one attempt; attempts are serialized so the machine never runs two judges at once. */
export function runCode(options: RunOptions): Promise<RunResult> {
  const next = queue.then(() => runOnce(options));
  queue = next.catch(() => undefined);
  return next;
}

async function runOnce({ runner, code, tests, limitSeconds, setupFileContent, dockerBin = "docker" }: RunOptions): Promise<RunResult> {
  if (code.length > MAX_CODE_CHARS) throw new CodeRunError(`the code is longer than ${MAX_CODE_CHARS} characters`);
  if (tests.length === 0 || tests.length > MAX_TESTS) throw new CodeRunError(`between 1 and ${MAX_TESTS} tests`);
  const limit = Math.max(1, Math.ceil(Math.min(limitSeconds, MAX_LIMIT_SECONDS)));
  const image = await docker(dockerBin, ["image", "inspect", runner.image], 30_000);
  if (image.code !== 0) {
    if (imageFailure(image.code, image.stderr) === "daemon") {
      throw new DockerDaemonError(`cannot reach the docker daemon; start it and retry (${image.stderr.trim() || `exit ${image.code}`})`);
    }
    throw new ImageMissingError(`the ${runner.image} environment is not installed; run: learning code setup (or docker pull ${runner.image})`);
  }

  const work = realpathSync(mkdtempSync(join(workRoot(), "learning-code-")));
  try {
    const judge = join(work, ".judge");
    for (const dir of ["in", "out", "meta"]) mkdirSync(join(judge, dir), { recursive: true });
    if (setupFileContent !== undefined && !runner.setup) throw new CodeRunError(`the runner for ${runner.file} has no setup command for this exercise's setupFile`);
    writeFileSync(join(work, runner.file), code);
    writeFileSync(join(judge, "run.sh"), `${runner.run}\n`);
    if (runner.compile) writeFileSync(join(judge, "compile.sh"), `${runner.compile}\n`);
    if (runner.setup) {
      writeFileSync(join(judge, "setup.sh"), `${runner.setup}\n`);
      writeFileSync(join(judge, "seed"), setupFileContent ?? "");
    }
    tests.forEach((t, i) => writeFileSync(join(judge, "in", String(i)), t.entrada));
    writeFileSync(join(judge, "judge.sh"), judgeScript(tests.length, limit, runner.compile !== undefined, runner.setup !== undefined));

    const name = `learning-code-${randomBytes(6).toString("hex")}`;
    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    const deadline = (COMPILE_SECONDS * (runner.setup ? 2 : 1) + tests.length * (limit + 2) + 30) * 1000;
    const ran = await docker(
      dockerBin,
      [
        "run", "--rm", "--name", name, "--pull", "never",
        "--network", "none", "--memory", "512m", "--memory-swap", "512m", "--cpus", "1", "--pids-limit", "256",
        "--read-only", "--tmpfs", "/tmp:rw,exec,size=64m", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--user", `${uid}:${gid}`, "-e", "HOME=/tmp", "-v", `${work}:/work`, "-w", "/work",
        ...(runner.entrypoint ? ["--entrypoint", runner.entrypoint, runner.image, "/work/.judge/judge.sh"] : [runner.image, "sh", "/work/.judge/judge.sh"]),
      ],
      deadline,
      name,
    );

    if (runner.setup) {
      const status = readJudged(join(judge, "setup.code"))?.trim();
      if (status === undefined) throw new CodeRunError(`the judge container failed before setup: ${ran.stderr.trim() || `exit ${ran.code}`}`);
      if (status !== "0") {
        const salida = clip(readJudged(join(judge, "setup.txt")) ?? "");
        return {
          compilacion: { ok: true, salida: "" }, resultados: [], aprobados: 0, total: 0,
          aviso: `La preparación del ejercicio falló (salida ${status}): ${salida || "sin detalles"} No se ha corregido nada.`,
        };
      }
    }

    let compilacion = { ok: true, salida: "" };
    if (runner.compile) {
      const status = readJudged(join(judge, "compile.code"))?.trim();
      if (status === undefined) throw new CodeRunError(`the judge container failed: ${ran.stderr.trim() || `exit ${ran.code}`}`);
      compilacion = { ok: status === "0", salida: clip(readJudged(join(judge, "compile.txt")) ?? "") };
      if (!compilacion.ok) return { compilacion, resultados: [], aprobados: 0, total: tests.length };
    }

    // If the judge container itself died (deleted judge directory, OOM, daemon restart),
    // surface that on the tests it silently swallowed instead of a bare "the judge failed".
    const judgeNote = () => {
      const parts = [ran.code !== null && ran.code !== 0 ? `exit ${ran.code}` : "", ran.stderr.trim()].filter(Boolean);
      return parts.length > 0 ? ` (${clip(parts.join("; "))})` : "";
    };
    const resultados = tests.map((t, i): TestResult => {
      const meta = readJudged(join(judge, "meta", String(i)))?.trim().split(/\s+/).map(Number);
      const obtenido = readJudged(join(judge, "out", `${i}.out`)) ?? "";
      const errores = readJudged(join(judge, "out", `${i}.err`)) ?? "";
      const base = { nombre: t.nombre, oculto: t.oculto === true, entrada: t.entrada, ...(t.salida !== undefined ? { esperado: t.salida } : {}) };
      if (!meta || meta.length !== 2 || meta.some(Number.isNaN)) {
        return { ...base, estado: "error", obtenido: clip(obtenido), errores: `el juez no terminó esta prueba${judgeNote()}`, codigo: null };
      }
      const [codigo, seconds] = meta;
      let estado: Estado;
      if (codigo === KILLED && seconds >= limit) estado = "tiempo";
      else if (codigo !== 0) estado = "error";
      else if (t.salida === undefined) estado = "ejecutado";
      else estado = sameOutput(obtenido, t.salida) ? "correcto" : "incorrecto";
      const killedNote = codigo === KILLED && estado === "error" ? "\n(terminado a la fuerza: probablemente se quedó sin memoria)" : "";
      const judgeMissing = !errores && estado === "error" && codigo !== KILLED ? judgeNote() : "";
      return { ...base, estado, obtenido: clip(obtenido), errores: clip(errores) + judgeMissing + killedNote, codigo };
    });
    return { compilacion, resultados, aprobados: resultados.filter((r) => r.estado === "correcto").length, total: tests.length };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
