// The gate's contract: a beat may only say what its own frames draw. These are
// the RED cases — each one is a narration the old engine shipped against a
// visual that never answered it.
import test from "node:test";
import assert from "node:assert/strict";
import { LEXICON, promisesOf, drawnBy, audit, formatViolation } from "../lib/promises.mjs";

const specOf = (beats) => ({ part: "Parte T", title: "Prueba", topic: "x", sections: [{ kicker: "k", heading: "h", beats }] });
const beatOf = (title, narration, visual) => ({ title, narration, visual });
const deckOf = (title, steps) => [{ title, viewBox: "0 0 360 290", steps: steps.map((scene) => ({ title: "", text: "", scene })) }];

const boxes = (n) => Array.from({ length: n }, (_, i) => ({ x: i * 40, y: 20, w: 36, h: 30, label: `c${i}` }));
const arrows = (n) =>
  Array.from({ length: n }, (_, i) => ({ x1: i * 40 + 10, y1: 60, x2: i * 40 + 10, y2: 100 }));
const grid = (cols, rows) => ({ x: 10, y: 10, cols, rows, width: 240, rowH: 24 });

test("the lexicon is the fixed table the gate promises", () => {
  assert.deepEqual(LEXICON.map((entry) => entry.id), [
    "arrow", "arrow-per-cell", "cell", "table", "numeral", "bar", "equation",
  ]);
});

test("promises keep the spoken phrase verbatim and fold a bound arrow phrase into one claim", () => {
  const promises = promisesOf("Todas las flechas de arriba apuntan a la derecha");
  assert.deepEqual(promises.map((p) => p.id), ["arrow-per-cell"]);
  assert.equal(promises[0].phrase, "Todas las flechas");
});

test("a frame that says 'todas las flechas' but draws one arrow is a violation naming the phrase", () => {
  const decks = deckOf("Campo", [{ boxes: boxes(4), arrows: arrows(1) }]);
  const spec = specOf([
    beatOf("T0 a T3", "Mira la política inicial: en la fila de arriba todas las flechas apuntan a la derecha.", { deck: "Campo", steps: [0] }),
  ]);
  const violations = audit(spec, decks);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].phrase, "todas las flechas");
  assert.equal(violations[0].beat, 0);
  assert.match(violations[0].missing, /arrow for each remaining cell/);
  assert.match(formatViolation(violations[0]), /^section 0 · beat "T0 a T3" · says "todas las flechas" · draws nothing that answers it/);
});

test("a narration that says 'tabla' over boxes only is a violation", () => {
  const decks = deckOf("Cajas", [{ boxes: boxes(6) }]);
  const spec = specOf([beatOf("La tabla", "La tabla de decisión ordena los estados y sus recompensas.", { deck: "Cajas", steps: [0] })]);
  const violations = audit(spec, decks);
  assert.equal(violations.length, 1);
  assert.match(violations[0].missing, /grid drawn with column headers/);
});

test("a narration that says 'número' over a word-only label is a violation", () => {
  const spec = specOf([
    beatOf("El número", "Cada número dice cuánto vale ese estado dentro del almacén.", {
      scenes: [{ scene: { labels: [{ x: 20, y: 30, text: "paso" }] } }],
    }),
  ]);
  const violations = audit(spec, []);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].phrase, "número");
  assert.match(violations[0].missing, /contains a digit/);
});

test("a subject noun over a chart is the world the beat talks about, not a promise", () => {
  // Deliberate boundary: the gate checks the visual vocabulary (arrows, cells,
  // tables, numbers), not every noun. A beat may say "el robot" while showing
  // the value chart without owing a picture of a robot.
  const spec = specOf([
    beatOf("El modelo no siempre está", "El robot recibe un estado y la recompensa del paso.", {
      scenes: [{ scene: { labels: [{ x: 1, y: 2, text: "paso" }] } }],
    }),
  ]);
  assert.deepEqual(audit(spec, []), []);
});

test("a beat whose frame draws what it says passes", () => {
  const spec = specOf([
    beatOf("Todo dibujado", "Mira la tabla: una flecha por casilla, cada número en su celda y la puerta a la derecha.", {
      scenes: [{
        scene: {
          grids: [grid(["casilla", "valor"], [["puerta", "0,0"], ["robot", "1,0"]])],
          arrows: arrows(4),
          policy: [0, 1, 2, 3].map((i) => ({ x: 16 + i * 40, y: 40, w: 36, h: 30, dir: "up" })),
          walls: [],
          exits: [],
        },
      }],
    }),
  ]);
  const drawn = drawnBy(spec.sections[0].beats[0], []);
  assert.ok(drawn.union.tables >= 1);
  assert.ok(drawn.union.hasDigit);
  assert.deepEqual(audit(spec, []), []);
});

test("audit reports every violation, not just the first", () => {
  const spec = specOf([
    beatOf("Sin tabla", "La tabla de decisión ordena los estados y sus recompensas.", {
      scenes: [{ scene: { boxes: boxes(3) } }],
    }),
    beatOf("Sin número", "Cada número dice cuánto vale ese estado dentro del almacén.", {
      scenes: [{ scene: { labels: [{ x: 1, y: 2, text: "paso" }] } }],
    }),
  ]);
  const violations = audit(spec, []);
  assert.equal(violations.length, 2);
  assert.deepEqual(violations.map((v) => v.phrase), ["tabla", "número"]);
  assert.deepEqual(violations.map((v) => v.beat), [0, 1]);
});

test("a policy field answers 'one arrow per cell' even when the cells are tiles", () => {
  // The warehouse is drawn as boxes; the policy is a field of arrows inside
  // them. One movement arrow beside twelve tiles is not that picture.
  const cellsOf = (dirs) => dirs.map((dir, i) => ({ x: 16 + (i % 4) * 88, y: 40 + Math.floor(i / 4) * 94, w: 56, h: 50, dir }));
  const field = (dirs) => ({ boxes: boxes(12), policy: cellsOf(dirs) });
  const spec = (scene) => specOf([
    beatOf("T0 a T3", "Mira la política inicial: en la fila de arriba todas las flechas apuntan a la derecha.", {
      scenes: [{ scene }],
    }),
  ]);
  const declared = { walls: [], exits: [] };
  const full = field(Array(12).fill("up"));
  Object.assign(full, declared);
  assert.deepEqual(audit(spec(full), []), []);
  const partial = audit(spec(field(["right", "right", "right", "up", "up", "up"])), []);
  assert.equal(partial.length, 1);
  assert.match(partial[0].missing, /arrow for each remaining cell/);
});

test("a scene key the gate cannot read is surfaced, never silently passed", () => {
  const spec = specOf([
    beatOf("Primitiva nueva", "La política dibuja una flecha por casilla en todo el campo.", {
      scenes: [{ scene: {
        boxes: boxes(4),
        policy: [0, 1, 2, 3].map((i) => ({ x: 16 + i * 40, y: 40, w: 36, h: 30, dir: "up" })),
        walls: [],
        exits: [],
        heatmap: { cells: [0, 1, 2, 3] },
      } }],
    }),
  ]);
  const violations = audit(spec, []);
  assert.equal(violations.length, 1);
  assert.match(violations[0].missing, /cannot read.*"heatmap"/);
});
