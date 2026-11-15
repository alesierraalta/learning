import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_GATE_TOOL = join(REPO_ROOT, "tools", "explain-check.mjs");
const LOCAL_IMPORT = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s*)?["']([^'"]+)["']|\bimport\s*\(\s*["']([^'"]+)["']\s*\)/g;
const EXTENSIONS = [".mjs", ".js", ".cjs", ".json", ".ts"];

type Store = Map<string, boolean>;
export type GateVerdictOptions = {
  gateToolPath?: string;
  gateVerdictsFile?: string;
  root?: string;
};

const inFlight = new Map<string, Promise<boolean>>();
let storeWriteQueue: Promise<unknown> = Promise.resolve();

export function gateVerdictsFile(root: string): string {
  return join(resolve(root), ".learning-cache", "gate-verdicts.json");
}

async function importedFile(source: string, specifier: string): Promise<string | undefined> {
  if (!specifier.startsWith(".")) return;
  const target = resolve(dirname(source), specifier);
  const candidates = extname(target) ? [target] : [target, ...EXTENSIONS.map((extension) => `${target}${extension}`), ...EXTENSIONS.map((extension) => join(target, `index${extension}`))];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Missing import candidates are skipped; the runtime reports an unresolved import when checked.
    }
  }
  return;
}

async function gateHash(entry: string): Promise<string> {
  const modules = new Map<string, Buffer>();
  const visit = async (file: string): Promise<void> => {
    const path = resolve(file);
    if (modules.has(path)) return;
    const bytes = await readFile(path);
    modules.set(path, bytes);
    for (const match of bytes.toString("utf8").matchAll(LOCAL_IMPORT)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      const dependency = await importedFile(path, specifier);
      if (dependency) await visit(dependency);
    }
  };
  await visit(entry);
  const hash = createHash("sha256");
  for (const [file, bytes] of [...modules.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(relative(REPO_ROOT, file));
    hash.update("\0");
    hash.update(bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function verdictKey(file: string, gateToolPath: string): Promise<string> {
  const [page, gate] = await Promise.all([readFile(file), gateHash(gateToolPath)]);
  return `${createHash("sha256").update(page).digest("hex")}:${gate}`;
}

async function readStore(file: string): Promise<Store> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    const record = parsed as { version?: unknown; verdicts?: unknown };
    if (record.version !== 1 || !record.verdicts || typeof record.verdicts !== "object" || Array.isArray(record.verdicts)) return new Map();
    return new Map(Object.entries(record.verdicts).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
  } catch {
    return new Map();
  }
}

function storePath(options: GateVerdictOptions): string | undefined {
  return options.gateVerdictsFile ?? (options.root ? gateVerdictsFile(options.root) : undefined);
}

async function saveVerdict(file: string, key: string, serves: boolean): Promise<void> {
  const write = storeWriteQueue.then(async () => {
    const verdicts = await readStore(file);
    verdicts.set(key, serves);
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: 1, verdicts: Object.fromEntries(verdicts) })}\n`);
    await rename(temporary, file);
  });
  storeWriteQueue = write.catch(() => {});
  await write.catch(() => {});
}

function parseServes(output: string): boolean | undefined {
  try {
    const serves = (JSON.parse(output) as { serves?: unknown }).serves;
    return typeof serves === "boolean" ? serves : undefined;
  } catch {
    return;
  }
}

function runGate(file: string, gateToolPath: string): Promise<boolean | undefined> {
  return new Promise((resolveResult) => {
    try {
      execFile(
        process.execPath,
        [gateToolPath, file, "--json"],
        { cwd: REPO_ROOT, timeout: 180_000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
        (_error, stdout) => resolveResult(parseServes(String(stdout ?? ""))),
      );
    } catch {
      resolveResult(undefined);
    }
  });
}

export async function recordGateVerdict(file: string, output: string, options: GateVerdictOptions = {}): Promise<boolean | undefined> {
  const serves = parseServes(output);
  if (serves === undefined) return;
  try {
    const key = await verdictKey(file, options.gateToolPath ?? DEFAULT_GATE_TOOL);
    const store = storePath(options);
    if (store) await saveVerdict(store, key, serves);
    return serves;
  } catch {
    return;
  }
}

export async function getGateVerdict(file: string, options: GateVerdictOptions = {}): Promise<boolean> {
  const store = storePath(options);
  const tool = options.gateToolPath ?? DEFAULT_GATE_TOOL;
  let key: string;
  try {
    key = await verdictKey(file, tool);
  } catch {
    return false;
  }
  if (store) {
    const verdicts = await readStore(store);
    if (verdicts.has(key)) return verdicts.get(key)!;
  }
  const runKey = `${store ?? ""}\0${key}`;
  let pending = inFlight.get(runKey);
  if (!pending) {
    pending = (async () => {
      const serves = await runGate(file, tool);
      if (serves !== undefined && store) await saveVerdict(store, key, serves);
      return serves === true;
    })();
    inFlight.set(runKey, pending);
    void pending.then(() => inFlight.delete(runKey), () => inFlight.delete(runKey));
  }
  return pending;
}

async function richPartPages(root: string): Promise<string[]> {
  const pages: string[] = [];
  let topics;
  try {
    topics = await readdir(root, { withFileTypes: true });
  } catch {
    return pages;
  }
  for (const topic of topics) {
    if (!topic.isDirectory()) continue;
    const explanations = join(root, topic.name, "explicaciones");
    let entries;
    try {
      entries = await readdir(explanations, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && /^Parte \d+ - .+\.html$/i.test(entry.name)) pages.push(join(explanations, entry.name));
    }
  }
  return pages.sort();
}

export async function warmGateVerdicts(root: string, options: GateVerdictOptions = {}): Promise<void> {
  const pages = await richPartPages(root);
  for (const page of pages) await getGateVerdict(page, { ...options, root });
}
