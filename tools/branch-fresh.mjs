// A working copy that is behind its base documents a contract the base has already
// replaced: the author reads the old docs, reaches for the old component and pays for
// a redesign. Measured on #406: 96 s and thirteen lint problems on a checkout 409
// commits behind, against 17 s for the same figure on main.
//
// This tool answers one question before any figure work starts: is this checkout the
// contract the base is writing today? It reads text and git only: no browser, no writes.
//
//   node tools/branch-fresh.mjs [--base <ref>] [--json]
//
// Exit 0 fresh, 1 stale (behind the base, or missing surface the base has), 2 cannot tell.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const KIT = 'integrations/pi/kit/kit.js';
const COMPONENT = /define\('(lk-[a-z-]+)'/g;
const FALLBACK_BASE = 'origin/main';

// The components a kit source declares, so the gap can be named instead of counted.
export const components = (source) => [...String(source ?? '').matchAll(COMPONENT)].map(m => m[1]).sort();

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

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const resolves = (ref) => {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
};

const configuredBase = () => {
  try {
    return git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']).replace(/^refs\/remotes\//, '');
  } catch {
    return FALLBACK_BASE;
  }
};

const localComponents = () => {
  try {
    return components(readFileSync(KIT, 'utf8'));
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

const localTools = () => (existsSync('tools') ? readdirSync('tools').filter(name => name.endsWith('.mjs')).map(name => `tools/${name}`) : []);

const baseTools = (base) => {
  try {
    return git(['ls-tree', '--name-only', base, 'tools/']).split('\n').filter(name => name.endsWith('.mjs'));
  } catch {
    return [];
  }
};

function runCli(args) {
  const asJson = args.includes('--json');
  const at = args.indexOf('--base');
  const base = at === -1 ? configuredBase() : args[at + 1];

  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    console.error('branch-fresh: not inside a git repository');
    return 2;
  }
  if (!base) {
    console.error('branch-fresh: --base needs a ref, for example --base origin/main');
    return 2;
  }
  if (!resolves(base)) {
    console.error(`branch-fresh: unknown base ref ${base}; run git fetch, or pass --base <ref>`);
    return 2;
  }

  const report = evaluate({
    behind: Number(git(['rev-list', '--count', `HEAD..${base}`])),
    ahead: Number(git(['rev-list', '--count', `${base}..HEAD`])),
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
