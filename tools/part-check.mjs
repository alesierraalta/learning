// Una sola puerta para una parte: todas las mediciones que manda la skill, juntas y con la regla,
// el elemento y el arreglo de cada hallazgo (#372/T2a). Las cinco puertas del estudio se corren
// con su agregador (`studio/checks.ts`), no con una copia de sus reglas; aquí solo se añaden
// part-lint, la medida del registro, el barrido de ASCII de la skill y la presentación.
//
// Uso: node tools/part-check.mjs <nota.md> [--json]
//       node tools/part-check.mjs --rules [--compact]
// Sale 0 solo si todas pasan; 1 si hay hallazgos; 2 si alguna medición no pudo correr.
// PART_CHECK_TOOLS_DIR permite aislar las herramientas en las pruebas.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PART_TOOLS, parsedFindingsOf, runPartChecks } from '../studio/checks.ts';
import { HINTS } from './explain-check/hints.mjs';
import { REGLAS } from './explain-check/reglas.mjs';
import { REGLAS_DE_REGISTRO, REQUISITOS_DE_REGISTRO } from './register/hallazgos.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
/** El mismo barrido que la skill hace con grep antes de entregar la nota. */
const ASCII = /[┌┐└┘├┤┬┴┼│╔╗╚╝║█▓▒░]|─+[►▶▸]|-{2,}>|={2,}>|-{2,}\[/;
const HINTS_BY_RULE = { ...HINTS, ...Object.fromEntries(REGLAS.filter((r) => r.hint).map((r) => [r.id, r.hint])) };
const FIX = /\b(dibuja|pon|mueve|quita|escribe|parte|reduce|acorta|ordena|reparte|nombra|sube|baja|separa|declara|cambia)\b[^.!]*[.!]?/i;

const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ */
/* La ficha de reglas (#372/T2d)                                       */
/* ------------------------------------------------------------------ */

const RULES_DIR = join(HERE, 'explain-check', 'rules');
/** T2f: the ids that fired in the first real draft, most frequent first. This only reorders the
 * sheet: no rule is added, removed or weakened, and no gate threshold or verdict is touched. */
const FREQUENT_RULE_IDS = JSON.parse(readFileSync(join(HERE, 'part-check-frequent.json'), 'utf8'));
const FREQUENT_RANK = new Map(FREQUENT_RULE_IDS.map((id, index) => [id, index]));
const FREQUENT_HEADING = 'Most frequent first-draft findings';
const clip = (text, max = 132) => {
  const clean = oneLine(text).replace(/\|/g, '/');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

/**
 * Lo que exige una regla de explain-check sale del comentario de su propio archivo: no hay una
 * segunda lista que mantener. Si el archivo no lo dice, su propia corrección describe el requisito.
 */
function requirementOf(id, fallback) {
  let source = '';
  try { source = readFileSync(join(RULES_DIR, `${id}.mjs`), 'utf8'); } catch { return clip(fallback); }
  const code = source.search(/^(?:export default|const |function |let )/m);
  const head = code < 0 ? source : source.slice(0, code);
  const comment = head.split('\n').filter((line) => /^\s*\/\//.test(line))
    .map((line) => line.replace(/^\s*\/\/\s?/, '')).join(' ');
  const text = oneLine(comment)
    .replace(/^\d+[a-z]?(?:\s*\([^)]*\))?[.:]?\s*/, '')
    .replace(/^#\d+\s*/, '');
  return clip(text || fallback);
}

let sheet;
/** Una fila por regla que part-check puede reportar: id, requisito y arreglo, sin listas paralelas. */
export function ruleSheet() {
  if (sheet) return sheet;
  const rows = [];
  const seen = new Set();
  const add = (id, requirement) => {
    if (seen.has(id) || !HINTS[id]) return;
    seen.add(id);
    rows.push({ id, requirement: clip(requirement), hint: oneLine(HINTS[id]) });
  };
  for (const rule of REGLAS) add(rule.id, requirementOf(rule.id, rule.hint));
  for (const id of REGLAS_DE_REGISTRO) add(id, REQUISITOS_DE_REGISTRO[id] ?? HINTS[id]);
  // Las reglas del kit viven en sus puertas; su definición pública aquí es la corrección.
  for (const id of Object.keys(HINTS)) add(id, HINTS[id]);
  // Stable sort: the frequent ids lead in the checked-in order, every other rule keeps its place.
  const rank = (id) => FREQUENT_RANK.get(id) ?? FREQUENT_RULE_IDS.length;
  sheet = rows.sort((a, b) => rank(a.id) - rank(b.id));
  return rows;
}

/** La misma ficha en texto, para el prompt del estudio (`--compact`: id + requisito). */
export function ruleSheetText({ compact = false } = {}) {
  const rows = ruleSheet();
  const line = (row) => compact ? `${row.id} | ${row.requirement}` : `${row.id} | ${row.requirement} | ${row.hint}`;
  const frequent = rows.filter((row) => FREQUENT_RANK.has(row.id));
  const other = rows.filter((row) => !FREQUENT_RANK.has(row.id));
  return [
    `RULE SHEET · ${rows.length} reglas · ${compact ? 'id | requisito' : 'id | requisito | arreglo'} · generada de las reglas`,
    `${FREQUENT_HEADING}:`,
    ...frequent.map(line),
    'Otras reglas de primera entrega:',
    ...other.map(line),
  ].join('\n');
}

/** La corrección vive en la definición de la regla; si una regla del kit no la trae, se lee del hallazgo. */
function hintOf(rule, message) {
  const text = HINTS_BY_RULE[rule] ?? message.match(FIX)?.[0] ?? `sigue la regla «${rule}»: ${message}`;
  return oneLine(text).slice(0, 240);
}

const runNode = (args) => new Promise((done) => {
  execFile(process.execPath, args, {
    cwd: REPO, timeout: 180_000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8',
  }, (error, stdout, stderr) => done({
    code: error && typeof error.code === 'number' ? error.code : error ? -1 : 0,
    stdout: String(stdout ?? ''),
    stderr: String(stderr ?? ''),
    error: error?.killed ? 'agotó el tiempo' : typeof error?.code === 'string' ? error.code : '',
  }));
});

const gateName = (tool) => tool.replace(/\.mjs$/, '');
const failureOf = (tool, file, run) => {
  const reason = oneLine(run.stderr.split('\n').find((line) => line.trim()) ?? run.error);
  return `${tool} no pudo medir ${basename(file)} (salida ${run.code})${reason ? `: ${reason}` : ''}`;
};

const finding = (gate, rule, where, message, raw) => ({
  gate, rule, where: oneLine(where) || 'nota', message: oneLine(message), hint: hintOf(rule, message), raw,
});

/**
 * Corre todas las puertas de una nota y devuelve los hallazgos, agrupados por puerta, y los fallos
 * de medición aparte. No decide nada sobre la nota: el veredicto de cada puerta es el que ya dieron
 * sus herramientas.
 */
export async function partCheck(file, options = {}) {
  const toolsDir = options.toolsDir ?? process.env.PART_CHECK_TOOLS_DIR ?? HERE;
  const checked = await runPartChecks([file], { toolsDir });
  const failures = [...(checked.failures ?? [])];
  const groups = [];
  const byTool = new Map((checked.tools ?? []).filter((found) => found.file === file).map((found) => [found.tool, found]));

  for (const tool of PART_TOOLS) {
    const gate = gateName(tool);
    const found = byTool.get(tool);
    const rows = found ? parsedFindingsOf(tool, found.output) : [];
    groups.push({ gate, findings: rows.map((row) => finding(gate, row.rule, row.where, row.message || row.raw, row.raw)) });
  }

  // part-lint mide la prosa; su línea de hallazgo es la misma que imprime cuando se corre sola.
  const lint = await runNode([join(toolsDir, 'part-lint.mjs'), file]);
  const lintRows = lint.stdout.split('\n').map((line) => line.trim()).filter((line) => /^PASA\b/.test(line));
  const lintFindings = lintRows.map((line) => {
    const measured = line.match(/^PASA\s+(\d+)\s+palabras\s+\(tope\s+(\d+)\)/);
    return finding('part-lint', 'tamaño', basename(file), measured ? `${measured[1]} palabras de prosa (tope ${measured[2]})` : line, line);
  });
  if (lint.code !== 0 && !lintFindings.length) failures.push(failureOf('part-lint.mjs', file, lint));
  groups.push({ gate: 'part-lint', findings: lintFindings });

  // El registro mide, no dicta: sus hallazgos viajan con el informe, pero no cuentan como hallazgos
  // de puerta. Ahora nombran el término y la línea de su primera aparición (#372/T2d).
  const measured = await runNode([join(toolsDir, 'register', 'measure.mjs'), '--text', file, '--json']);
  let register = null;
  if (measured.code === 0) {
    try { register = JSON.parse(measured.stdout); } catch { register = null; }
  }
  if (measured.code !== 0 || register === null) failures.push(failureOf('register/measure.mjs', file, measured));
  const unexplained = Array.isArray(register?.unexplained) ? register.unexplained : [];
  const registerFindings = unexplained.map((term) => ({
    rule: 'termino-sin-explicar',
    where: term.line ? `línea ${term.line}` : oneLine(term.sentence) || 'nota',
    message: `«${oneLine(term.term)}» no se explica en palabras llanas donde aparece`,
    hint: hintOf('termino-sin-explicar', term.sentence),
  }));
  if (register) register = { ...register, findings: registerFindings };
  groups.push({ gate: 'register', findings: [] });

  // El barrido de la skill: una línea de ASCII o de flecha de texto es una escena que falta.
  let text = '';
  try { text = await readFile(file, 'utf8'); } catch (error) { failures.push(`ascii no pudo medir ${basename(file)}: ${error.message}`); }
  const asciiFindings = text.split('\n').flatMap((line, i) => ASCII.test(line)
    ? [finding('ascii', 'ascii', `línea ${i + 1}`, oneLine(line) || '(carácter de dibujo)', line.trim())]
    : []);
  groups.push({ gate: 'ascii', findings: asciiFindings });

  const findings = groups.flatMap((group) => group.findings);
  return {
    file,
    ok: findings.length === 0 && failures.length === 0,
    count: findings.length,
    groups,
    findings,
    failures,
    register,
  };
}

function print(report, asJson) {
  if (asJson) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${basename(report.file)}: ${report.count} hallazgo(s) en ${report.groups.filter((g) => g.findings.length).length} puerta(s)`);
    for (const group of report.groups) {
      if (!group.findings.length) continue;
      console.log(`\n[${group.gate}]`);
      for (const found of group.findings) {
        console.log(`  ${found.rule} · ${found.where} · ${found.message}`);
        console.log(`    arreglo: ${found.hint}`);
      }
    }
    if (!report.count) console.log('sin hallazgos: todas las puertas pasan');
    if (report.register) {
      const m = report.register;
      console.log(`\n[register] sin veredicto · ${m.words ?? '?'} palabras · ${m.wordsPerSentence?.mean?.toFixed?.(1) ?? '?'} palabras/frase · ${m.unexplained?.length ?? 0} término(s) sin explicar`);
      for (const found of m.findings) console.log(`  ${found.rule} · ${found.where} · ${found.message}\n    arreglo: ${found.hint}`);
    }
  }
  // En --json el informe va a stdout y las medidas fallidas, aparte, a stderr: el machine output
  // sigue siendo un solo JSON y el tutor ve igual por qué una puerta no pudo medir.
  for (const failure of report.failures) console.error(`medición fallida (no es un hallazgo): ${failure}`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  if (args.includes('--rules')) {
    console.log(ruleSheetText({ compact: args.includes('--compact') }));
  } else {
    const asJson = args.includes('--json');
    const [file, ...extra] = args.filter((arg) => !arg.startsWith('--'));
    if (!file || extra.length) {
      console.error('uso: node tools/part-check.mjs <nota.md> [--json]');
      process.exit(2);
    }
    try {
      const report = await partCheck(file);
      print(report, asJson);
      process.exitCode = report.count ? 1 : report.failures.length ? 2 : 0;
    } catch (error) {
      console.error(`part-check no pudo medir ${basename(file)}: ${error.message}`);
      process.exitCode = 2;
    }
  }
}
