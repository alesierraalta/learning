// A working copy that is behind its base documents a contract the base has already
// replaced: the author reads the old docs, reaches for the old component and pays for
// a redesign. Measured on #406: 96 s and thirteen lint problems on a checkout 409
// commits behind, against 17 s for the same figure on main.
//
// This tool answers one question before any figure work starts: is this checkout the
// contract the base is writing today? It reads text and git only: no browser, no writes.
//
//   node tools/branch-fresh.mjs [--base <ref>|--base=<ref>] [--json]
//
// Exit 0 fresh, 1 stale (behind the base, or missing surface the base has), 2 cannot tell.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const KIT = 'integrations/pi/kit/kit.js';
const FALLBACK_BASE = 'origin/main';

// Both quote styles: the kit writes `define('lk-callout')`, and a component spelled
// `define("lk-figure")` is the same declaration to every browser that runs it.
const LITERAL = /define\(\s*(['"])(lk-[a-z-]+)\1/g;

// A declaration whose name is a template, `define(`lk-${kind}`)`.
const TEMPLATE = /define\(\s*`([^`]*)`/g;
const SLOT = /\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g;

// The loop header that binds such a template: `for (const [kind, …] of [[…], […]])`.
const PIECE_LOOP = /for\s*\(\s*const\s*\[([^\]]*)\]\s+of\s*(\[[\s\S]*?\])\s*\)\s*\{/g;

// The repository, not the directory the command was typed in. Reading the kit and
// `tools/` relative to the cwd measured whatever tree the shell happened to stand in:
// from `tools/` the kit was not found and all sixteen components were declared
// missing, a gap this checkout does not have. `--show-toplevel` is the root git
// itself reports, so every read below happens in the tree that was measured.
let ROOT = '';

// git run from that root, once it is known: `-C` keeps every later read on the same
// tree as the first one, whatever directory the caller typed the command in.
const git = (args) => execFileSync('git', [...(ROOT ? ['-C', ROOT] : []), ...args], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
}).trim();

const fromRoot = (path) => join(ROOT || process.cwd(), path);

// The pieces the kit declares in a loop, as `kind -> the values that column takes`.
const loops = (text) => {
  const columns = new Map();
  for (const [, names, pairs] of text.matchAll(PIECE_LOOP)) {
    const bound = names.split(',').map(name => name.trim());
    const tuples = [...pairs.matchAll(/\[([^[\]]*)\]/g)]
      .map(tuple => [...tuple[1].matchAll(/(['"])([^'"]*)\1/g)].map(literal => literal[2]));
    for (const [column, name] of bound.entries()) {
      const values = tuples.map(tuple => tuple[column]).filter(value => value !== undefined);
      columns.set(name, [...(columns.get(name) ?? []), ...values]);
    }
  }
  return columns;
};

// The kit does not declare the explorer pieces one by one: it declares them in a
// loop, `define(`lk-${kind}`)` over a list of `[kind, label]` pairs
// (integrations/pi/kit/kit.js:3280), and lk-venn lives in that list. A regex cannot
// see through a template, so the names are read the only way text allows: from the
// `for (const [kind, …] of [...])` header that binds the variable. This is a text
// reading, not a JavaScript parse, and it is bounded to that one shape — a piece
// declared from a variable bound anywhere else stays invisible rather than being
// guessed, because an invented name is the one answer this tool must not give. The
// expansion stops at 32 names for the same reason: past that it is a data table and
// not a list of declarations, and a truncated family reads as a gap that is not there.
const expand = (template, columns) => {
  const names = [...new Set([...template.matchAll(SLOT)].map(slot => slot[1]))];
  if (!names.length) return [template];
  if (names.some(name => !columns.has(name))) return [];
  let expanded = [template];
  for (const name of names) {
    // No regex is built from the name: the shared slot pattern is asked to fill only
    // the interpolations bound to this variable, and leaves the rest as written.
    const fill = (text, value) => text.replace(SLOT, (slot, bound) => (bound === name ? value : slot));
    expanded = expanded.flatMap(text => columns.get(name).map(value => fill(text, value)));
    if (expanded.length > 32) return [];
  }
  return expanded;
};

// The components a kit source declares, so the gap can be named instead of counted.
export const components = (source) => {
  const text = String(source ?? '');
  const columns = loops(text);
  const named = [
    ...[...text.matchAll(LITERAL)].map(declared => declared[2]),
    ...[...text.matchAll(TEMPLATE)].flatMap(declared => expand(declared[1], columns))
  ];
  // One name, once: a piece declared literal and again in a loop is one component.
  return [...new Set(named.filter(name => /^lk-[a-z-]+$/.test(name)))].sort();
};

// Base surface the checkout under test does not have. Direction matters: files this
// branch adds are not a gap, only what the base publishes and this copy lacks.
export const missingFrom = (local, base) => base.filter(item => !local.includes(item)).sort();

export function evaluate({ behind, ahead, base, localComponents, baseComponents, localTools, baseTools }) {
  const missingComponents = missingFrom(localComponents, baseComponents);
  const missingTools = missingFrom(localTools, baseTools);
  return {
    fresh: behind === 0 && missingComponents.length === 0 && missingTools.length === 0,
    behind,
    ahead,
    base,
    missingComponents,
    missingTools
  };
}

const resolves = (ref) => {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
};

const topLevel = () => {
  try {
    return git(['rev-parse', '--show-toplevel']) || process.cwd();
  } catch {
    // A bare repository has no work tree to read: measure from where we stand.
    return process.cwd();
  }
};

const configuredBase = () => {
  try {
    return git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']).replace(/^refs\/remotes\//, '');
  } catch {
    return FALLBACK_BASE;
  }
};

// `--base <ref>` and `--base=<ref>` are the same request. Reading only the space form
// dropped the joined one in silence: the tool then answered about the configured base,
// so a ref nobody had fetched came back as «fresh». Both forms arrive here, and an
// unknown ref from either one ends at exit 2.
const baseRef = (args) => {
  const joined = args.find(arg => arg.startsWith('--base='));
  if (joined) return joined.slice('--base='.length);
  const at = args.indexOf('--base');
  return at === -1 ? configuredBase() : args[at + 1];
};

const shallow = () => {
  try {
    return git(['rev-parse', '--is-shallow-repository']) === 'true';
  } catch {
    return false;
  }
};

const sharesHistory = (base) => {
  try {
    return git(['merge-base', 'HEAD', base]) !== '';
  } catch {
    return false;
  }
};

// How much this branch owns cannot be read from `rev-list` alone in a shallow clone:
// the graft hides the shared history, so `rev-list base..HEAD` counts the base's own
// commit as work done here and a checkout that is only behind reads «ahead 1». Two
// facts git can still answer without the missing history set the bound: `merge-base
// --is-ancestor HEAD base` proves that nothing here is new, and a shallow clone whose
// two tips share no merge base at all is in a state where a commit counted as ahead
// may be the base's own past. In that state the count cannot be attributed, so it is
// reported as 0 — the one number the graft cannot inflate — and the verdict keeps
// resting on `behind`, which is measured and not inferred. The limit is stated
// because it is real: an author who commits in that same disconnected state also
// reads 0. Everything else keeps the count it has always reported.
const aheadOf = (base) => {
  try {
    git(['merge-base', '--is-ancestor', 'HEAD', base]);
    return 0;
  } catch {
    if (shallow() && !sharesHistory(base)) return 0;
    return Number(git(['rev-list', '--count', `${base}..HEAD`]));
  }
};

const localComponents = () => {
  try {
    return components(readFileSync(fromRoot(KIT), 'utf8'));
  } catch {
    return [];
  }
};

const baseComponents = (base) => {
  try {
    return components(git(['show', `${base}:${KIT}`]));
  } catch {
    return [];
  }
};

const localTools = () => (existsSync(fromRoot('tools'))
  ? readdirSync(fromRoot('tools')).filter(name => name.endsWith('.mjs')).map(name => `tools/${name}`)
  : []);

const baseTools = (base) => {
  try {
    return git(['ls-tree', '--name-only', base, 'tools/']).split('\n').filter(name => name.endsWith('.mjs'));
  } catch {
    return [];
  }
};

function runCli(args) {
  const asJson = args.includes('--json');
  const base = baseRef(args);

  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    console.error('branch-fresh: not inside a git repository');
    return 2;
  }
  ROOT = topLevel();

  if (!base) {
    console.error('branch-fresh: --base needs a ref, for example --base origin/main');
    return 2;
  }
  if (!resolves(base)) {
    console.error(`branch-fresh: unknown base ref ${base}; run git fetch, or pass --base <ref>`);
    return 2;
  }
  // An unborn HEAD is not behind anything: there is no commit to compare, so the
  // honest answer is «cannot tell». Counting refs from a branch with no commit threw
  // out of git as a node stack trace, and the caller read the 1 as «stale».
  if (!resolves('HEAD')) {
    console.error(`branch-fresh: HEAD has no commit yet, so there is nothing to compare with ${base}`);
    return 2;
  }

  const report = evaluate({
    behind: Number(git(['rev-list', '--count', `HEAD..${base}`])),
    ahead: aheadOf(base),
    base,
    localComponents: localComponents(),
    baseComponents: baseComponents(base),
    localTools: localTools(),
    baseTools: baseTools(base)
  });

  if (asJson) {
    console.log(JSON.stringify(report));
    return report.fresh ? 0 : 1;
  }
  if (report.fresh) {
    console.log(`branch-fresh: fresh (base ${base})`);
    return 0;
  }
  console.log(`branch-fresh: behind ${report.behind}, ahead ${report.ahead} (base ${base})`);
  const gaps = [...report.missingComponents, ...report.missingTools];
  if (gaps.length) console.log(`branch-fresh: missing here: ${gaps.join(', ')}`);
  console.log(`branch-fresh: cut a worktree from ${base} before authoring, or run git fetch && git merge ${base}`);
  return 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) process.exit(runCli(process.argv.slice(2)));
