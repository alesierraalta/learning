// ¿Cuánto cumple una explicación a la primera? Medirlo, no suponerlo.
//
// `explain-check` dice si una parte cumple; esto lo corre sobre un corpus entero y
// resume lo que importa para mejorar el estándar: cuántas pasan sin tocar nada,
// qué regla falla más y cuál es el primer fallo de cada parte. Con `--record`
// deja una línea por corrida, para comparar entre sesiones y entre autores.
//
// Uso:
//   node tools/explain-bench.mjs <archivo|carpeta...> [--json] [--record <archivo>]
//   node tools/explain-bench.mjs --from-git <ref> <ruta...>     (mide una versión anterior)
// Sale 0 siempre: es una medición, no una puerta.

import { mkdtempSync, readdirSync, statSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const recordAt = argv.includes('--record') ? argv[argv.indexOf('--record') + 1] : null;
const gitAt = argv.includes('--from-git') ? argv[argv.indexOf('--from-git') + 1] : null;
const paths = argv.filter((a, i) => !a.startsWith('--') && a !== recordAt && a !== gitAt);

if (!paths.length) {
  console.error('uso: node tools/explain-bench.mjs <archivo|carpeta...> [--json] [--record f] [--from-git ref]');
  process.exit(2);
}

function collect(p) {
  const st = statSync(p);
  if (st.isFile()) return [p];
  return readdirSync(p).filter((f) => f.endsWith('.md')).map((f) => join(p, f));
}

let files = [];
let ref = null;
if (gitAt) {
  ref = execFileSync('git', ['rev-parse', '--short', gitAt], { encoding: 'utf8' }).trim();
  const dir = mkdtempSync(join(tmpdir(), 'bench-git-'));
  for (const p of paths) {
    const out = join(dir, basename(p));
    try {
      writeFileSync(out, execFileSync('git', ['show', `${gitAt}:${p}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
      files.push(out);
    } catch { console.error(`aviso: ${p} no existe en ${gitAt}`); }
  }
} else {
  files = paths.flatMap(collect);
}

const results = [];
for (const file of files) {
  const r = spawnSync(process.execPath, [join(TOOLS, 'explain-check.mjs'), file, '--json'], { encoding: 'utf8' });
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { results.push({ file, ok: false, first: 'no se pudo medir', rows: [] }); continue; }
  const failing = parsed.rows.filter((row) => !row.ok);
  results.push({ file, ok: parsed.ok, first: failing[0]?.rule || '', rows: parsed.rows, failing });
}

const total = results.length;
const passed = results.filter((r) => r.ok).length;
const ruleHits = {};
for (const r of results) for (const f of r.failing) ruleHits[f.rule] = (ruleHits[f.rule] || 0) + 1;
const rate = total ? Math.round((passed / total) * 100) : 0;

if (asJson) {
  console.log(JSON.stringify({ ref, total, passed, rate, rules: ruleHits, results: results.map(({ file, ok, first }) => ({ file: basename(file), ok, first })) }, null, 1));
} else {
  for (const r of results) console.log(`${r.ok ? 'PASA ' : 'FALLA'} ${basename(r.file).padEnd(52)} ${r.ok ? '' : `← ${r.first}`}`);
  console.log(`\na la primera: ${passed}/${total} (${rate} %)${ref ? ` · versión ${ref}` : ''}`);
  if (Object.keys(ruleHits).length) {
    console.log('reglas que fallan:');
    for (const [rule, n] of Object.entries(ruleHits).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(2)} × ${rule}`);
  }
}

if (recordAt) {
  appendFileSync(recordAt, JSON.stringify({ at: new Date().toISOString(), ref, total, passed, rate, rules: ruleHits }) + '\n');
  console.log(`registrado en ${recordAt}`);
}
