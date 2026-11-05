import assert from "node:assert/strict";
import { test } from "node:test";
import { WORDS_PER_MINUTE } from "../lib/spec.mjs";
import { GAPS, buildTimeline, estimate, timecode, toSrt, turnKey, turnTags } from "../lib/timeline.mjs";
import { conversation } from "./fixtures.mjs";

const line = "uno dos tres cuatro cinco seis";

function small(overrides = {}) {
  return {
    part: "p1",
    title: "Prueba",
    topic: "rl",
    style: "debate",
    chapters: [{ title: "Primero", segments: [{ speaker: "A", text: line }, { speaker: "B", text: line }] }],
    ...overrides,
  };
}

/** A measured turn: `seconds` long, six words at 0.25 s each. */
const measured = (seconds = 2) => ({
  dur: seconds,
  words: Array.from({ length: 6 }, (_, i) => ({ t: i * 0.25, d: 0.25, w: line.split(" ")[i] })),
});

function cache(spec, overrides = {}) {
  const turns = new Map();
  for (const tag of turnTags(spec)) turns.set(tag.key, measured(overrides[tag.key]));
  return turns;
}

test("the key is the voice and the words, so an edit is a new take", () => {
  const voice = "es-ES-AlvaroNeural";
  assert.equal(turnKey(voice, line).length, 16);
  assert.equal(turnKey(voice, line), turnKey(voice, line));
  assert.notEqual(turnKey(voice, line), turnKey(voice, `${line}.`));
  assert.notEqual(turnKey(voice, line), turnKey("es-ES-ElviraNeural", line));
});

test("the estimate is words per minute plus the silence the plan will insert", () => {
  const spec = {
    part: "p1",
    title: "Prueba",
    topic: "rl",
    style: "debate",
    chapters: [
      { title: "Uno", segments: [{ speaker: "A", text: Array.from({ length: 100 }, (_, i) => `w${i}`).join(" ") }, { speaker: "B", text: Array.from({ length: 100 }, (_, i) => `v${i}`).join(" ") }] },
    ],
  };
  const plan = estimate(spec);
  assert.equal(plan.words, 200);
  assert.equal(plan.turns, 2);
  assert.equal(plan.chapters, 1);
  // One chapter opens after the lead silence, so it costs no chapter gap: only the
  // marks between chapters do, which is what buildTimeline inserts.
  assert.equal(plan.gaps, Math.round((GAPS.lead + GAPS.tail + GAPS.turn) * 1000) / 1000);
  assert.ok(Math.abs(plan.seconds - (200 / WORDS_PER_MINUTE) * 60 - plan.gaps) < 0.01);
  assert.equal(plan.target, 20);
  assert.ok(Math.abs(plan.minutes - plan.seconds / 60) < 0.001);
});

test("a real part estimates inside the delivery window", () => {
  const plan = estimate(conversation());
  assert.ok(plan.minutes > 12 && plan.minutes < 28, `estimated ${plan.minutes} min`);
});

test("silences sit between turns and chapters, never inside a turn", () => {
  const spec = small();
  const timeline = buildTimeline(spec, cache(spec));
  const kinds = timeline.events.map((event) => `${event.kind}:${event.dur}`);
  assert.deepEqual(kinds, [`silence:${GAPS.lead}`, "turn:2", `silence:${GAPS.turn}`, "turn:2", `silence:${GAPS.tail}`]);
  assert.equal(timeline.events[0].start, 0);
  assert.equal(timeline.events[1].start, 0.6);
  assert.equal(timeline.events[3].start, 3.05);
  assert.equal(timeline.duration, 5.95);
  assert.deepEqual(timeline.chapters, [{ title: "Primero", start: 0.6, end: 5.05 }]);
});

test("a chapter closes where its last voice stops", () => {
  const spec = small({
    chapters: [
      { title: "Primero", segments: [{ speaker: "A", text: line }, { speaker: "B", text: line }] },
      { title: "Segundo", segments: [{ speaker: "A", text: `${line} siete` }, { speaker: "B", text: `${line} siete` }] },
    ],
  });
  const timeline = buildTimeline(spec, cache(spec));
  const [first, second] = timeline.chapters;
  assert.equal(first.start, 0.6);
  assert.equal(first.end, 5.05);
  assert.equal(second.start, 6.2);
  const gap = timeline.events.find((event) => event.kind === "silence" && event.dur === GAPS.chapter);
  assert.ok(gap, "the chapter gap is in the plan");
  assert.equal(second.end, timeline.duration - GAPS.tail);
});

test("cues keep every word of the turn, in order, inside the turn", () => {
  const spec = small();
  const timeline = buildTimeline(spec, cache(spec));
  assert.equal(timeline.cues.length, 2);
  assert.equal(timeline.cues[0].text, line);
  assert.equal(timeline.cues[0].start, 0.6);
  assert.equal(timeline.cues[0].end, 2.1);
  assert.equal(timeline.cues[1].start, 3.05);
  assert.ok(timeline.cues[1].end <= 3.05 + 2);
  assert.match(timeline.srt, /^1\n00:00:00,600 --> 00:00:02,100\nuno dos tres cuatro cinco seis\n/);
});

test("long turns are cut into readable cues", () => {
  const words = Array.from({ length: 30 }, (_, i) => ({ t: i * 0.4, d: 0.4, w: `w${i}` }));
  const spec = small({ chapters: [{ title: "Uno", segments: [{ speaker: "A", text: line }, { speaker: "B", text: line }] }] });
  const turns = cache(spec);
  for (const [key] of turns) turns.set(key, { dur: 12, words });
  const timeline = buildTimeline(spec, turns);
  assert.equal(timeline.cues.length, 6);
  assert.ok(timeline.cues.every((cue) => cue.text.split(" ").length <= 12));
  assert.ok(timeline.cues.every((cue, i) => i === 0 || cue.start >= timeline.cues[i - 1].end));
});


test("the same spec and the same recordings always plan the same audio", () => {
  const spec = conversation();
  const first = buildTimeline(spec, cache(spec));
  const second = buildTimeline(spec, cache(spec));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  // Every event starts where the previous one ended: the plan has no holes and
  // no overlaps, which is what keeps the chapter marks honest.
  for (let i = 1; i < first.events.length; i += 1) {
    const previous = first.events[i - 1];
    // Float accumulation inside the clock is not a hole: tolerance, not equality.
    assert.ok(
      Math.abs(first.events[i].start - (previous.start + previous.dur)) < 1e-6,
      `event ${i} starts at ${first.events[i].start}, previous ends at ${previous.start + previous.dur}`,
    );
  }
  const last = first.events[first.events.length - 1];
  assert.ok(Math.abs(first.duration - (last.start + last.dur)) < 1e-6);
});

test("a missing recording stops the plan instead of leaving a hole", () => {
  const spec = conversation();
  const turns = cache(spec);
  const [key] = turns.keys();
  turns.delete(key);
  assert.throws(() => buildTimeline(spec, turns), new RegExp(`no recording for turn ${key}`));
});

test("the transcript uses srt timecodes", () => {
  assert.equal(timecode(0), "00:00:00,000");
  assert.equal(timecode(3725.5), "01:02:05,500");
  assert.equal(timecode(59.999), "00:00:59,999");
  assert.equal(toSrt([]), "");
  assert.match(toSrt([{ start: 1, end: 2, text: "hola" }]), /^1\n00:00:01,000 --> 00:00:02,000\nhola\n$/);
});

test("the estimate counts the same silence the render inserts", () => {
  // The dry run is the budget the author trusts before recording a word, and the
  // report compares it with the measured minutes. Both must count the gaps the
  // renderer actually writes, so the plan is the single source for both numbers.
  const spec = conversation();
  const timeline = buildTimeline(spec, cache(spec));
  const silence = timeline.events
    .filter((event) => event.kind === "silence")
    .reduce((total, event) => total + event.dur, 0);
  assert.equal(estimate(spec).gaps, Math.round(silence * 1000) / 1000);
});

test("a boundary that overruns its recording cannot desync the rest", () => {
  const spec = small();
  const turns = cache(spec);
  const first = [...turns.values()][0];
  // edge-tts reports the last word's offset and duration, and a trailing pause can
  // make that duration longer than the take. A cue may not claim that time.
  first.words[first.words.length - 1] = { t: 1.5, d: 8, w: "seis" };
  const timeline = buildTimeline(spec, turns);
  const audio = timeline.events.filter((event) => event.kind === "turn");
  assert.ok(
    timeline.cues[0].end <= audio[0].start + audio[0].dur + 1e-6,
    `the first cue ends at ${timeline.cues[0].end}; its take ends at ${audio[0].start + audio[0].dur}`,
  );
  assert.equal(
    timeline.cues.at(-1).start,
    audio.at(-1).start,
    "the next speaker's first cue starts with their take, not eight seconds late",
  );
});
