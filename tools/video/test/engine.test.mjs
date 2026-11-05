// The engine's contract lives in its pure parts: what plays when, what the
// frame looks like, and where a caption sits. Rendering is exercised by the
// stills and the delivered video; these tests pin the rules behind them.
import test from "node:test";
import assert from "node:assert/strict";
import { extractDecks, deckByTitle } from "../lib/note.mjs";
import { beatTag, wordAnchor, resolveStates, cues, contentBox, buildTimeline } from "../lib/timeline.mjs";
import { validate } from "../lib/spec.mjs";

const deck = (title, steps) => `<lk-walkthrough>\n<script type="application/json">${JSON.stringify({ title, viewBox: "0 0 360 290", steps })}\n</script>\n</lk-walkthrough>`;

test("decks come from the note, with a default viewBox", () => {
  const note = deck("El almacén", [{ title: "A", scene: { boxes: [] } }]) + deck("La política", [{ title: "B", scene: { boxes: [] } }]);
  const decks = extractDecks(note);
  assert.equal(decks.length, 2);
  assert.equal(decks[1].title, "La política");
  assert.equal(decks[0].viewBox, "0 0 360 290");
  assert.throws(() => deckByTitle(decks, "No existe"), /is not in the note/);
});

test("a broken deck fails loudly instead of drawing nothing", () => {
  assert.throws(() => extractDecks('<lk-walkthrough><script type="application/json">{oops</script>'), /not valid JSON/);
  assert.throws(() => extractDecks(deck("Sin pasos", [])), /has no steps/);
});

test("beat tags are stable and sortable", () => {
  assert.equal(beatTag(0, 0), "s01b00");
  assert.equal(beatTag(8, 2), "s09b02");
});

test("a caption phrase is anchored to the word it is spoken on", () => {
  const words = [{ t: 0, d: 0.3, w: "Una" }, { t: 0.3, d: 0.3, w: "flecha" }, { t: 0.6, d: 0.3, w: "por" }, { t: 0.9, d: 0.3, w: "casilla" }];
  assert.equal(wordAnchor("Una flecha por casilla", words, "por casilla"), 0.6);
  assert.equal(wordAnchor("Una flecha por casilla", words, "una flecha"), 0);
});

test("an anchor that was never spoken is an error, not a guess", () => {
  const words = [{ t: 0, d: 0.3, w: "Hola" }];
  assert.throws(() => wordAnchor("Hola", words, "adiós"), /does not appear/);
  assert.throws(() => wordAnchor("Hola que tal", words, "hola"), /re-synthesise/);
});

test("states are clamped inside the spoken window", () => {
  const words = [{ t: 0, d: 1, w: "uno" }, { t: 1, d: 1, w: "dos" }, { t: 2, d: 1, w: "tres" }];
  const states = resolveStates({ states: [{}, {}, {}], anchors: [0, 0.5, 0.99], narration: "uno dos tres", words, speechStart: 10, speechDur: 3 });
  assert.equal(states[0].t, 10.1);
  assert.ok(states[2].t <= 10 + 3 - 0.9 + 0.001, "the last state keeps a margin before the beat ends");
  assert.throws(() => resolveStates({ states: [{}], anchors: [0, 1], narration: "uno dos tres", words, speechStart: 0, speechDur: 3 }), /anchors/);
  assert.throws(() => resolveStates({ states: [{}], anchors: [2], narration: "uno dos tres", words, speechStart: 0, speechDur: 3 }), /between 0 and 1/);
});

test("cues never overlap and keep two readable lines", () => {
  const words = "Hablamos de la política, que decide, y de la recompensa, que paga, y del valor, que estima el futuro".split(" ")
    .map((w, i) => ({ t: i * 0.4, d: 0.35, w }));
  const list = cues(words, 5, { maxChars: 44 });
  assert.ok(list.length > 1);
  for (const [start, end, text] of list) {
    assert.ok(start >= 5, "cues are offset by the speech start");
    assert.ok(end > start);
    assert.ok(text.split("\n").length <= 2);
    for (const line of text.split("\n")) assert.ok(line.length <= 44, `line too long: ${line}`);
  }
  for (let i = 1; i < list.length; i++) assert.ok(list[i][0] >= list[i - 1][0], "cues are ordered");
});

test("the crop follows the drawing but never jumps more than the cap", () => {
  const one = [{ scene: { boxes: [{ x: 100, y: 100, w: 40, h: 40 }] } }];
  const box = contentBox(one, "0 0 360 290").split(" ").map(Number);
  assert.ok(box[2] <= 360 && box[3] <= 290, "a crop stays inside the original viewBox");
  assert.ok(box[2] >= 360 / 1.5 - 0.1, "zoom is capped");
  const full = contentBox([{ scene: { boxes: [{ x: 0, y: 0, w: 360, h: 290 }] } }], "0 0 360 290");
  assert.equal(full, "0 0 360 290");
  assert.equal(contentBox([{ scene: { paths: [{ d: "M 0 0 L 1 1" }] } }], "0 0 360 290"), "0 0 360 290", "raw paths keep the full frame");
});

test("a timeline is contiguous and uses the deck's own numbers", () => {
  const spec = {
    part: "Parte 3", title: "T", topic: "x",
    sections: [{ kicker: "k", heading: "h", beats: [
      { title: "Uno", narration: "una flecha por casilla decide qué hacer en cada estado del almacén", visual: { deck: "El almacén", steps: [1] } },
      { title: "Dos", narration: "una flecha por casilla decide qué hacer en cada estado del almacén", visual: { scenes: [{ scene: { boxes: [{ x: 0, y: 0, w: 10, h: 10 }] } }] } },
    ] }],
  };
  assert.deepEqual(validate(spec), []);
  const decks = extractDecks(deck("El almacén", [{ title: "A", scene: {}, text: "primero" }, { title: "B", scene: {}, text: "segundo" }]));
  const spoken = "una flecha por casilla decide qué hacer en cada estado del almacén";
  const boundaries = spoken.split(" ").map((w, i) => ({ t: i * 0.3, d: 0.28, w }));
  const beats = new Map([["s01b00", { dur: 4, words: boundaries }], ["s01b01", { dur: 4, words: boundaries }]]);
  const plan = buildTimeline(spec, beats, decks);
  assert.equal(plan.beats.length, 2);
  assert.equal(plan.beats[0].states[0].text, "segundo", "the picked step, not the first one");
  assert.equal(plan.beats[0].states.length, 1, "a step subset keeps the chosen count");
  assert.equal(plan.beats[1].start, plan.beats[0].end, "beats do not overlap");
  assert.ok(plan.total > 8);
  assert.ok(plan.cues.every(([s]) => s >= 0));
});

test("a visual without a scene is rejected before rendering", () => {
  const spec = { part: "p", title: "t", topic: "x", sections: [{ heading: "h", beats: [{ title: "Sin dibujo", narration: "esto no tiene ningún dibujo asociado", visual: {} }] }] };
  assert.match(validate(spec).join(), /no visual/);
});

test("a drawing that changes without the voice saying why is refused", () => {
  const spec = {
    part: 1, title: "T", topic: "t",
    sections: [{ heading: "H", beats: [
      { title: "uno", narration: "una flecha por casilla decide que hacer en cada estado", visual: { scenes: [{ scene: {} }, { scene: {} }], anchors: [0, 0.5] } },
    ] }],
  };
  const problems = validate(spec);
  assert.ok(problems.some((p) => /spoken phrase|anchors/.test(p)), problems.join(" | "));
});

test("a drawing that changes on a spoken phrase is accepted", () => {
  const spec = {
    part: 1, title: "T", topic: "t",
    sections: [{ heading: "H", beats: [
      { title: "uno", narration: "una flecha por casilla decide que hacer en cada estado", visual: { scenes: [{ scene: {} }, { scene: {} }], anchors: ["una flecha por casilla", "en cada estado"] } },
    ] }],
  };
  assert.deepEqual(validate(spec), []);
});

test("a deck beat says which steps play, and every step change is spoken", () => {
  const base = { part: 1, title: "T", topic: "t", sections: [{ heading: "H", beats: [
    { title: "uno", narration: "una flecha por casilla decide que hacer en cada estado", visual: { deck: "D" } },
  ] }] };
  assert.ok(validate(base).some((p) => /steps/.test(p)));
  base.sections[0].beats[0].visual = { deck: "D", steps: [0, 1], anchors: [0.2, 0.8] };
  assert.ok(validate(base).some((p) => /spoken phrase|anchors/.test(p)));
  base.sections[0].beats[0].visual = { deck: "D", steps: [0, 1], anchors: ["una flecha por casilla", "en cada estado"] };
  assert.deepEqual(validate(base), []);
});

test("an anchor the narration never says is refused before the render", () => {
  const spec = {
    part: 1, title: "T", topic: "t",
    sections: [{ heading: "H", beats: [
      { title: "uno", narration: "una flecha por casilla decide que hacer en cada estado", visual: { scenes: [{ scene: {} }, { scene: {} }], anchors: ["una flecha por casilla", "al llegar a la puerta"] } },
    ] }],
  };
  const problems = validate(spec);
  assert.ok(problems.some((p) => /never says/.test(p)), problems.join(" | "));
});

test("an anchor that is not text is named for what it is", () => {
  const spec = {
    part: 1, title: "T", topic: "t",
    sections: [{ heading: "H", beats: [
      { title: "uno", narration: "una flecha por casilla decide que hacer en cada estado", visual: { scenes: [{ scene: {} }, { scene: {} }], anchors: [true, 0.5] } },
    ] }],
  };
  const problems = validate(spec);
  assert.ok(problems.some((p) => /not text/.test(p)), problems.join(" | "));
});

test("the first state never lands after the beat's last allowed moment", () => {
  const words = [{ t: 0, d: 0.2, w: "uno" }];
  const [only] = resolveStates({ states: [{}], narration: "uno", words, speechStart: 10, speechDur: 0.1, start: 20 });
  assert.ok(only.t < 20, `first state at ${only.t}`);
});

test("the states of a beat keep the order the narrator says them", () => {
  const narration = "La política elige una acción por casilla y la recompensa";
  const words = narration.split(" ").map((w, i) => ({ t: i * 0.3, d: 0.28, w }));
  assert.throws(
    () => resolveStates({
      states: [{}, {}, {}],
      anchors: ["La recompensa", "casilla", "La política"],
      narration,
      words,
      speechStart: 10,
      speechDur: 3,
      start: 9.85,
    }),
    /out of order/,
  );
});

test("states declared in the order the narrator says them stay ordered", () => {
  const narration = "La política elige una acción por casilla y la recompensa";
  const words = narration.split(" ").map((w, i) => ({ t: i * 0.3, d: 0.28, w }));
  const timed = resolveStates({
    states: [{}, {}, {}],
    anchors: ["La política", "casilla", "La recompensa"],
    narration,
    words,
    speechStart: 10,
    speechDur: 3,
    start: 9.85,
  });
  const times = timed.map((s) => s.t);
  assert.deepEqual(times, [...times].sort((a, b) => a - b), `states play out of order: ${times.map((t) => t.toFixed(2)).join(" ")}`);
});

test("a visual with no state at all is a spec error that names the beat", () => {
  const spec = {
    part: 1, title: "T", topic: "t",
    sections: [{ heading: "H", beats: [
      { title: "uno", narration: "una flecha por casilla decide que hacer en cada estado", visual: { scenes: [] } },
    ] }],
  };
  const problems = validate(spec);
  assert.ok(problems.length > 0, "a visual with no state was accepted and only fails later, without naming the beat");
});
