/**
 * Code-exercise judge: runs a learner's program against stdin/stdout tests in
 * a throwaway container, the way online judges grade, so any language works
 * the same. A language is one entry of runners.json (image, source file name,
 * optional compile command, run command); adding one needs no code change.
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
import { tmpdir } from "node:os";
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

export interface Runner {
  image: string;
  file: string;
  compile?: string;
  run: string;
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
}

export class CodeRunError extends Error {}
/** The image was never pulled or named wrongly; the caller offers `learning code setup`. */
export class ImageMissingError extends CodeRunError {}
/** Docker itself is down or unreachable; retrying after starting the daemon can help. */
export class DockerDaemonError extends CodeRunError {}

/** Classifies a failed `docker image inspect`: connection refusal means the daemon is down, everything else means the image is missing. */
export const imageFailure = (code: number | null, stderr: string): "daemon" | "missing" =>
  code !== 0 && /(cannot connect|failed to connect)/i.test(stderr) ? "daemon" : "missing";

/** The judge work tree lives on shared-memory tmpfs when available (RAM-bounded, wiped on reboot) and falls back to the default temp dir. */
export function workRoot(): string {
  return existsSync("/dev/shm") ? "/dev/shm" : tmpdir();
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function loadRunners(file = RUNNERS_FILE): Record<string, Runner> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new CodeRunError(`${file}: ${(err as Error).message}`);
  }
  if (!isRecord(raw)) throw new CodeRunError(`${file} must be an object of languages`);
  const runners: Record<string, Runner> = {};
  for (const [lang, entry] of Object.entries(raw)) {
    const where = `${file}: ${lang}`;
    if (!/^[\w+-]+$/.test(lang)) throw new CodeRunError(`${where}: language names are letters, digits, _ + -`);
    if (!isRecord(entry)) throw new CodeRunError(`${where} must be an object`);
    const { image, file: source, compile, run } = entry;
    if (typeof image !== "string" || !/^[\w./:@-]+$/.test(image)) throw new CodeRunError(`${where}.image must be a docker image name`);
    if (typeof source !== "string" || !/^[\w-]+\.[\w]+$/.test(source)) throw new CodeRunError(`${where}.file must be a plain file name`);
    if (compile !== undefined && (typeof compile !== "string" || compile.trim() === "")) throw new CodeRunError(`${where}.compile must be a command`);
    if (typeof run !== "string" || run.trim() === "") throw new CodeRunError(`${where}.run must be a command`);
    runners[lang] = { image, file: source, run, ...(compile ? { compile } : {}) };
  }
  return runners;
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
  return { titulo, enunciado, lenguaje, plantilla, ...(parte ? { parte } : {}), limite_segundos: limit as number, tests };
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

function judgeScript(count: number, limit: number, compiled: boolean): string {
  const lines = ["cd /work", `ulimit -f ${FILE_BLOCKS}`, "J=/work/.judge"];
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
  /** Docker CLI binary (tests). */
  dockerBin?: string;
}

/** Runs one attempt; attempts are serialized so the machine never runs two judges at once. */
export function runCode(options: RunOptions): Promise<RunResult> {
  const next = queue.then(() => runOnce(options));
  queue = next.catch(() => undefined);
  return next;
}

async function runOnce({ runner, code, tests, limitSeconds, dockerBin = "docker" }: RunOptions): Promise<RunResult> {
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
    writeFileSync(join(work, runner.file), code);
    writeFileSync(join(judge, "run.sh"), `${runner.run}\n`);
    if (runner.compile) writeFileSync(join(judge, "compile.sh"), `${runner.compile}\n`);
    tests.forEach((t, i) => writeFileSync(join(judge, "in", String(i)), t.entrada));
    writeFileSync(join(judge, "judge.sh"), judgeScript(tests.length, limit, runner.compile !== undefined));

    const name = `learning-code-${randomBytes(6).toString("hex")}`;
    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    const deadline = (COMPILE_SECONDS + tests.length * (limit + 2) + 30) * 1000;
    const ran = await docker(
      dockerBin,
      [
        "run", "--rm", "--name", name, "--pull", "never",
        "--network", "none", "--memory", "512m", "--memory-swap", "512m", "--cpus", "1", "--pids-limit", "256",
        "--read-only", "--tmpfs", "/tmp:rw,exec,size=64m", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--user", `${uid}:${gid}`, "-e", "HOME=/tmp", "-v", `${work}:/work`, "-w", "/work",
        runner.image, "sh", "/work/.judge/judge.sh",
      ],
      deadline,
      name,
    );

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
