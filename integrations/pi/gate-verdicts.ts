import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import { access, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveContained } from "./paths.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_GATE_TOOL = join(REPO_ROOT, "tools", "explain-check.mjs");
const LOCAL_IMPORT = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s*)?["']([^'"]+)["']|\bimport\s*\(\s*["']([^'"]+)["']\s*\)/g;
const EXTENSIONS = [".mjs", ".js", ".cjs", ".json", ".ts"];

type Store = Map<string, boolean>;
type StoreLocation = { root: string; file: string };
type GateExecution = { serves: boolean; cacheable: boolean };
export type GateVerdictOptions = {
  gateToolPath?: string;
  gateVerdictsFile?: string;
  gateNodePath?: string;
  gateTimeoutMs?: number;
  pageBytes?: Buffer;
  root?: string;
};

const inFlight = new Map<string, Promise<boolean>>();
const warnedStores = new Set<string>();
let storeWriteQueue: Promise<unknown> = Promise.resolve();

export function gateVerdictsFile(root: string): string {
  const contained = resolveContained(root, root);
  return join(contained.ok ? contained.rootReal : resolve(root), ".learning-cache", "gate-verdicts.json");
}

function unavailableStore(file: string, reason: string): void {
  const key = resolve(file);
  if (warnedStores.has(key)) return;
  warnedStores.add(key);
  process.stderr.write(`gate-verdicts: cache unavailable for ${key}: ${reason}\n`);
}

function storeLocation(options: GateVerdictOptions): StoreLocation | undefined {
  const file = options.gateVerdictsFile ?? (options.root ? gateVerdictsFile(options.root) : undefined);
  if (!file) return;
  const root = options.root ?? (basename(resolve(file)) === "gate-verdicts.json" && basename(dirname(resolve(file))) === ".learning-cache"
    ? dirname(dirname(resolve(file)))
    : undefined);
  if (!root) {
    unavailableStore(file, "missing root");
    return;
  }
  const contained = resolveContained(root, root);
  if (!contained.ok) {
    unavailableStore(file, contained.reason);
    return;
  }
  return { root: contained.rootReal, file: resolve(file) };
}

function safeStoreFile(root: string, file: string): string | undefined {
  const rootCheck = resolveContained(root, root);
  if (!rootCheck.ok) {
    unavailableStore(file, rootCheck.reason);
    return;
  }
  const expectedDir = join(rootCheck.rootReal, ".learning-cache");
  const expectedFile = join(expectedDir, "gate-verdicts.json");
  const resolvedFile = resolve(file);
  const relativeFile = relative(rootCheck.rootReal, resolvedFile);
  if (relativeFile === ".." || relativeFile.startsWith(`..${sep}`) || isAbsolute(relativeFile)) {
    unavailableStore(file, "store escapes the vault root");
    return;
  }
  if (resolvedFile !== expectedFile) {
    unavailableStore(file, "store path is not the vault cache file");
    return;
  }
  let directory;
  try {
    directory = lstatSync(expectedDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return expectedFile;
    unavailableStore(file, "cache directory is unreadable");
    return;
  }
  if (directory.isSymbolicLink() || !directory.isDirectory()) {
    unavailableStore(file, "cache directory is not a real directory");
    return;
  }
  const containedDirectory = resolveContained(rootCheck.rootReal, expectedDir);
  if (!containedDirectory.ok) {
    unavailableStore(file, containedDirectory.reason);
    return;
  }
  const target = join(containedDirectory.targetReal, "gate-verdicts.json");
  let store;
  try {
    store = lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return target;
    unavailableStore(file, "cache file is unreadable");
    return;
  }
  if (store.isSymbolicLink() || !store.isFile()) {
    unavailableStore(file, "cache file is not a regular file");
    return;
  }
  const containedStore = resolveContained(rootCheck.rootReal, target);
  if (!containedStore.ok) {
    unavailableStore(file, containedStore.reason);
    return;
  }
  return containedStore.targetReal;
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

async function verdictKey(file: string, gateToolPath: string, pageBytes?: Buffer): Promise<string> {
  const [page, gate] = await Promise.all([pageBytes ?? readFile(file), gateHash(gateToolPath)]);
  return `${createHash("sha256").update(page).digest("hex")}:${gate}`;
}

async function readStore(root: string, file: string): Promise<Store> {
  const safeFile = safeStoreFile(root, file);
  if (!safeFile) return new Map();
  try {
    const parsed: unknown = JSON.parse(await readFile(safeFile, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    const record = parsed as { version?: unknown; verdicts?: unknown };
    if (record.version !== 1 || !record.verdicts || typeof record.verdicts !== "object" || Array.isArray(record.verdicts)) return new Map();
    return new Map(Object.entries(record.verdicts).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
  } catch {
    return new Map();
  }
}

async function saveVerdict(root: string, file: string, key: string, serves: boolean): Promise<void> {
  const write = storeWriteQueue.then(async () => {
    let safeFile = safeStoreFile(root, file);
    if (!safeFile) return;
    const verdicts = await readStore(root, safeFile);
    await mkdir(dirname(safeFile), { recursive: true });
    safeFile = safeStoreFile(root, safeFile);
    if (!safeFile) return;
    verdicts.set(key, serves);
    const temporary = `${safeFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: 1, verdicts: Object.fromEntries(verdicts) })}\n`);
    const finalFile = safeStoreFile(root, safeFile);
    if (!finalFile) {
      await unlink(temporary).catch(() => {});
      return;
    }
    await rename(temporary, finalFile);
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

async function runGate(file: string, gateToolPath: string, options: GateVerdictOptions): Promise<GateExecution> {
  let snapshot: string | undefined;
  try {
    let input = file;
    if (options.pageBytes !== undefined) {
      const extension = extname(file) || ".html";
      snapshot = join(dirname(file), `.${basename(file, extension)}.${process.pid}.${randomUUID()}${extension}`);
      await writeFile(snapshot, options.pageBytes, { flag: "wx" });
      input = snapshot;
    }
    return await new Promise((resolveResult) => {
      try {
        execFile(
          options.gateNodePath ?? process.execPath,
          [gateToolPath, input, "--json"],
          { cwd: REPO_ROOT, timeout: options.gateTimeoutMs ?? 180_000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
          (error, stdout) => {
            const failure = error as { code?: string | number; killed?: boolean; signal?: NodeJS.Signals | null } | null;
            const code = failure === null ? 0 : typeof failure.code === "number" ? failure.code : undefined;
            const validExit = failure === null || (!failure.killed && !failure.signal && code === 1);
            const serves = parseServes(String(stdout ?? ""));
            resolveResult({ serves: validExit && serves === true, cacheable: validExit && serves !== undefined });
          },
        );
      } catch {
        resolveResult({ serves: false, cacheable: false });
      }
    });
  } catch {
    return { serves: false, cacheable: false };
  } finally {
    if (snapshot) await unlink(snapshot).catch(() => {});
  }
}

export async function recordGateVerdict(file: string, output: string, options: GateVerdictOptions = {}): Promise<boolean | undefined> {
  const serves = parseServes(output);
  if (serves === undefined) return;
  const location = storeLocation(options);
  if (!location) return;
  try {
    const key = await verdictKey(file, options.gateToolPath ?? DEFAULT_GATE_TOOL);
    await saveVerdict(location.root, location.file, key, serves);
    return serves;
  } catch {
    return;
  }
}

export async function getGateVerdict(file: string, options: GateVerdictOptions = {}): Promise<boolean> {
  const location = storeLocation(options);
  const tool = options.gateToolPath ?? DEFAULT_GATE_TOOL;
  let key: string;
  try {
    key = await verdictKey(file, tool, options.pageBytes);
  } catch {
    return false;
  }
  if (location) {
    const verdicts = await readStore(location.root, location.file);
    if (verdicts.has(key)) return verdicts.get(key)!;
  }
  const store = location?.file;
  const runKey = `${store ?? ""}\0${options.gateNodePath ?? process.execPath}\0${key}`;
  let pending = inFlight.get(runKey);
  if (!pending) {
    pending = (async () => {
      const result = await runGate(file, tool, options);
      if (result.cacheable && location) await saveVerdict(location.root, location.file, key, result.serves);
      return result.serves;
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
