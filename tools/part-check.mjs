// Una sola puerta para una parte: todas las mediciones que manda la skill, juntas y con la regla,
// el elemento y el arreglo de cada hallazgo (#372/T2a). Las cinco puertas del estudio se corren
// con su agregador (`studio/checks.ts`), no con una copia de sus reglas; aquí solo se añaden
// part-lint, la medida del registro, el barrido de ASCII de la skill y la presentación.
//
// Uso: node tools/part-check.mjs <nota.md> [--json]
// Sale 0 solo si todas pasan; 1 si hay hallazgos; 2 si alguna medición no pudo correr.
// PART_CHECK_TOOLS_DIR permite aislar las herramientas en las pruebas.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PART_TOOLS, parsedFindingsOf, runPartChecks } from '../studio/checks.ts';
import { HINTS } from './explain-check/hints.mjs';
import { REGLAS } from './explain-check/reglas.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
/** El mismo barrido que la skill hace con grep antes de entregar la nota. */
const ASCII = /[┌┐└┘├┤┬┴┼│╔╗╚╝║█▓▒░]|─+[►▶▸]|-{2,}>|={2,}>|-{2,}\[/;
const HINTS_BY_RULE = { ...HINTS, ...Object.fromEntries(REGLAS.filter((r) => r.hint).map((r) => [r.id, r.hint])) };
const FIX = /\b(dibuja|pon|mueve|quita|escribe|parte|reduce|acorta|ordena|reparte|nombra|sube|baja|separa|declara|cambia)\b[^.!]*[.!]?/i;

const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
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

  // El registro mide, no dicta: su fila viaja con el informe, pero no cuenta como hallazgo.
  const measured = await runNode([join(toolsDir, 'register', 'measure.mjs'), '--text', file, '--json']);
  let register = null;
  if (measured.code === 0) {
    try { register = JSON.parse(measured.stdout); } catch { register = null; }
  }
  if (measured.code !== 0 || register === null) failures.push(failureOf('register/measure.mjs', file, measured));
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
    }
  }
  // En --json el informe va a stdout y las medidas fallidas, aparte, a stderr: el machine output
  // sigue siendo un solo JSON y el tutor ve igual por qué una puerta no pudo medir.
  for (const failure of report.failures) console.error(`medición fallida (no es un hallazgo): ${failure}`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
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
