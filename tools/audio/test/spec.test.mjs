import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { MINUTE_WINDOW, STYLES, readSpec, resolveVoices, validate } from "../lib/spec.mjs";
import { conversation, tempDir, text } from "./fixtures.mjs";

const problemsOf = (spec) => validate(spec).join("\n");
const some = (spec, fragment) => assert.match(problemsOf(spec), new RegExp(fragment));

function formal(overrides = {}) {
  return {
    part: "p1",
    title: "Un agente que aprende",
    topic: "rl",
    style: "formal",
    chapters: [
      { title: "La idea", segments: [{ speaker: "A", text: text(130, "forma") }] },
      { title: "El límite", segments: [{ speaker: "A", text: text(120, "formb") }] },
    ],
    ...overrides,
  };
}

test("accepts a two-voice part and a one-voice explanation", () => {
  assert.deepEqual(validate(conversation()), []);
  assert.deepEqual(validate(formal()), []);
  assert.deepEqual(STYLES, ["debate", "entrevista", "charla", "formal"]);
  assert.deepEqual(MINUTE_WINDOW, [12, 28]);
});

test("names the missing top-level keys instead of failing later", () => {
  for (const key of ["part", "title", "topic"]) {
    const spec = conversation();
    delete spec[key];
    some(spec, `missing "${key}"`);
  }
});

test("a style outside the four is rejected", () => {
  some(conversation({ style: "podcast" }), "style must be one of debate, entrevista, charla, formal");
});

test("a length that is not a part's audio is rejected", () => {
  some(conversation({ minutes: 5 }), "minutes must be an integer between 8 and 35");
  some(conversation({ minutes: 20.5 }), "minutes must be an integer between 8 and 35");
});

test("a spec without chapters stops before segment checks", () => {
  some(conversation({ chapters: [] }), "missing chapters");
});

test("the declared speakers must match the style", () => {
  some(conversation({ voices: { A: "Alvaro" } }), "debate is a conversation: declare two speakers");
  some(formal({ voices: { A: "Alvaro", B: "Elvira" } }), "formal is one voice explaining");
});

test("a segment cannot use an undeclared speaker", () => {
  const spec = conversation();
  spec.chapters[0].segments[1].speaker = "C";
  some(spec, 'uses undeclared speaker "C"');
});

test("two consecutive turns by the same speaker are a merged turn", () => {
  const spec = conversation();
  spec.chapters[0].segments.splice(1, 1);
  some(spec, 'repeats speaker "A"');
});

test("a chapter of a conversation needs both voices", () => {
  const spec = conversation();
  spec.chapters[1].segments = spec.chapters[1].segments.filter((_, i) => i % 2 === 0);
  some(spec, "has one voice: a conversation needs both");
});

test("turn length is bounded in both directions", () => {
  const short = conversation();
  short.chapters[0].segments[0].text = text(5, "short");
  some(short, "is too short to be a turn");

  const long = conversation();
  long.chapters[0].segments[0].text = text(131, "long");
  some(long, "is 131 words; split it into turns");
});

test("a spec that is a summary, not a part, is rejected", () => {
  const tiny = {
    part: "p1",
    title: "Corto",
    topic: "rl",
    style: "formal",
    chapters: [{ title: "Solo", segments: [{ speaker: "A", text: text(120, "tiny") }] }],
  };
  some(tiny, "only 120 words: a part's audio is not a summary");
});

test("readSpec reports the file and every problem it found", () => {
  const dir = tempDir();
  const broken = join(dir, "broken.json");
  writeFileSync(broken, "{ not json");
  assert.throws(() => readSpec(broken), /is not a valid spec JSON/);

  const bad = join(dir, "bad.json");
  writeFileSync(bad, JSON.stringify({ part: "p1", style: "nope", chapters: [] }));
  assert.throws(() => readSpec(bad), /missing "title"[\s\S]*missing "topic"[\s\S]*style must be one of/);

  const good = join(dir, "good.json");
  writeFileSync(good, JSON.stringify(conversation()));
  assert.equal(readSpec(good).title, "Agentes que actúan");
});

test("each style resolves its own voices, and an explicit map overrides it", () => {
  assert.deepEqual(resolveVoices({ style: "debate" }), {
    A: { name: "Alvaro", voice: "es-ES-AlvaroNeural" },
    B: { name: "Elvira", voice: "es-ES-ElviraNeural" },
  });
  assert.equal(resolveVoices({ style: "entrevista" }).A.name, "Elvira");
  assert.equal(resolveVoices({ style: "formal" }).B, undefined);
  assert.equal(resolveVoices({ style: "charla", voices: { A: "Elvira", B: "Alvaro" } }).A.voice, "es-ES-ElviraNeural");
});

test("a conversation does not repeat a speaker across a chapter boundary", () => {
  const words = (n) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(" ");
  const turns = (first, count) =>
    Array.from({ length: count }, (_, i) => ({ speaker: i % 2 ? "B" : first, text: words(60) }));
  // Chapter one closes on A and chapter two opens on A: two turns by the same voice,
  // which is what the rule forbids, and the chapter mark is only a marker.
  const spec = {
    part: "p1",
    title: "Prueba",
    topic: "rl",
    style: "debate",
    chapters: [
      { title: "Primero", segments: turns("A", 7) },
      { title: "Segundo", segments: turns("A", 7) },
    ],
  };
  const problems = validate(spec);
  assert.ok(
    problems.some((problem) => /repeats speaker/.test(problem)),
    `expected a repeated-speaker problem, got ${JSON.stringify(problems)}`,
  );
});
