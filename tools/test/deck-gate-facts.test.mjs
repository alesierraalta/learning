// La puerta de los recorridos mide los datos de un paso y la tarjeta de cierre (#301) a 390 px: una
// tabla o una tarjeta que se sale de la pantalla es un hallazgo (`hechos-desbordados` o
// `resumen-desbordado`). Un recorrido con datos bien dibujados no tiene ninguno.
//
// Uso: node --test tools/test/deck-gate-facts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const GATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'deck-gate.mjs');
const dir = mkdtempSync(join(tmpdir(), 'deck-hechos-'));

/** Playwright tal como lo resuelve `deck-gate`: el módulo global, no el del repo. */
const globalPlaywright = () => {
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    createRequire(`${root}/`)('playwright');
    return true;
  } catch {
    return false;
  }
};
const skip = globalPlaywright() ? false : 'playwright is not installed globally';

const BOXES = [
  { x: 60, y: 120, w: 200, h: 110, label: 'Cuenta 10' },
  { x: 560, y: 120, w: 200, h: 110, label: 'Cuenta 20' },
];
const ARROW = { x1: 270, y1: 175, x2: 550, y2: 175, label: 'envía' };
const STEPS = [
  { title: 'Antes', text: 'La cuenta 10 tiene 1000.', facts: [['saldo', '1000'], ['moneda', 'EUR']] },
  { title: 'El débito', text: 'Se restan 200 de la cuenta 10.', facts: [['saldo', '800'], ['cambio', '-200']] },
  { title: 'El commit', text: 'El saldo 800 se graba en disco.' },
].map((step) => ({ ...step, scene: { boxes: BOXES, arrows: [ARROW] } }));
const SUMMARY = { title: 'Resultado', text: 'La cuenta 10 queda en 800.', metrics: [['saldo final', '800'], ['filas tocadas', '1']] };

// Una nota con un recorrido. `style` va delante del recorrido, como lo escribe el autor.
const nota = (name, spec, style = '') => {
  const file = join(dir, name);
  writeFileSync(file, `# Débito\n\n${style}<lk-walkthrough>\n<script type="application/json">${JSON.stringify(spec)}</script>\n</lk-walkthrough>\n`);
  return file;
};

// La puerta sobre una nota: sus hallazgos por tipo, sin repetir. Con una sola nota la puerta
// imprime su informe JSON y, después, `GATE FAILED`: el informe termina en su última llave.
const gate = (file) => {
  const run = spawnSync(process.execPath, [GATE, file], { encoding: 'utf8' });
  let report;
  try {
    report = JSON.parse(run.stdout.slice(0, run.stdout.lastIndexOf('}') + 1));
  } catch {
    throw new Error(`deck-gate no devolvió un informe: ${run.stdout}${run.stderr}`);
  }
  return [...new Set(report.bad.map((item) => item.kind))];
};

test('un recorrido con datos y tarjeta de cierre bien dibujados no tiene hallazgos de datos', { skip }, () => {
  const kinds = gate(nota('datos-bien.md', { title: 'Débito', viewBox: '0 0 900 320', steps: STEPS, summary: SUMMARY }));
  assert.deepEqual(kinds.filter((kind) => /desbordado/.test(kind)), [], 'un dato bien dibujado se marca como desbordado');
});

// La tabla y la tarjeta se miden con su propio `white-space`: esta nota fuerza las etiquetas
// largas a una sola línea, como lo haría un cambio de estilo que las deja salir de la pantalla. Una
// clave de cincuenta caracteres sin espacios no cabe en 390 px y la puerta tiene que decirlo.
test('una tabla o una tarjeta que se sale de la pantalla del teléfono es un hallazgo de la puerta', { skip }, () => {
  const long = 'tiempo_medio_de_respuesta_por_consulta_en_milisegundos_del_servidor';
  const style = '<style>.lk-facts th, .lk-facts td { white-space: nowrap; }</style>\n\n';
  const steps = STEPS.map((step, i) => (i === 0 ? { ...step, facts: [[long, '1200']] } : step));
  const kinds = gate(nota('datos-desbordados.md', { title: 'Débito', viewBox: '0 0 900 320', steps, summary: { title: 'Cierre', metrics: [[long, '800']] } }, style));
  assert.ok(kinds.includes('hechos-desbordados'), `la tabla de datos sale de la pantalla y la puerta no lo dice: ${kinds}`);
  assert.ok(kinds.includes('resumen-desbordado'), `la tarjeta de cierre sale de la pantalla y la puerta no lo dice: ${kinds}`);
});
