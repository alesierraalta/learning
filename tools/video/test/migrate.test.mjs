import test from "node:test";
import assert from "node:assert/strict";
import { draft, draftScene } from "../migrate.mjs";
import { validate } from "../lib/spec.mjs";

const OLD = {
  part: "parte1",
  title: "Parte 1",
  topic: "fundamentos",
  voice: "es-ES-AlvaroNeural",
  rate: "-4%",
  sections: [
    {
      kicker: "Sección 1",
      heading: "Qué es",
      beats: [
        { title: "Uno", narration: "La política decide qué hacer en cada casilla, y el valor estima cuánto conviene cada una de ellas.", scene: "formula", bullets: ["Política: decide", "Valor: estima"] },
        { title: "Dos", narration: "El modelo, en cambio, predice lo que va a pasar si el robot elige una acción.", scene: "table", bullets: [] },
      ],
    },
  ],
};

test("a draft keeps the narration word for word and draws the bullets", () => {
  const out = draft(OLD);
  const [one, two] = out.sections[0].beats;
  assert.equal(one.narration, OLD.sections[0].beats[0].narration);
  assert.equal(two.narration, OLD.sections[0].beats[1].narration);
  assert.deepEqual(one.visual.scene.panels[0].lines, ["Política: decide", "Valor: estima"]);
  assert.equal(one.migratedFrom.scene, "formula");
});

test("the draft validates, so it can be rendered as it is", () => {
  assert.deepEqual(validate(draft(OLD)), []);
});

test("a beat with no bullets still gets a drawing instead of an empty figure", () => {
  const scene = draftScene({ scene: "table", bullets: [] });
  assert.equal(scene.panels, undefined);
  assert.equal(scene.labels[0].text, "table");
});

test("a spec that is already an engine spec is refused, not merged", () => {
  const engine = { section: OLD.sections };
  engine.sections = OLD.sections.map((s) => ({ ...s, beats: s.beats.map((b) => ({ ...b, visual: { scene: { viewBox: "0 0 10 10", labels: [] } } })) }));
  assert.throws(() => draft(engine), /already an engine spec/);
  const half = { sections: [{ beats: [{ narration: "una narración suficientemente larga para ser un beat", visual: { scene: {} } }, { narration: "otra narración igual de larga que la primera, para el segundo beat" }] }] };
  assert.throws(() => draft(half), /half converted: 1 of 2/);
});

test("a beat with no narration is refused: the voice is not invented", () => {
  const broken = { sections: [{ beats: [{ title: "x", narration: "   ", bullets: ["a"] }] }] };
  assert.throws(() => draft(broken), /has no narration/);
});
