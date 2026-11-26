// What a segment's cache key is made of. The key is the identity of the bytes:
// anything the drawing or the encoder reads is in it, and nothing about where
// the segment sits is — a key that carried a beat's tag or its index would call
// two different pictures the same file, and a key that carried the whole part
// would call the same picture two. The one thing the picture reads that is not
// the beat's own — the progress bar, drawn as `covered / plan.total` — is in the
// key too, which is why a beat that moves to another instant of the part does not
// share its entry. The last test in this file pins that, so the limit is a
// measured statement rather than a surprise.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planSegments, segmentIdentity } from "../lib/segments.mjs";

const FPS = 30;
const DRAWING = "a".repeat(64);
const ENCODER = { codec: "libx264", preset: "medium", crf: 20, pix_fmt: "yuv420p" };
const SIZE = { width: 1920, height: 1080 };
const DIR = mkdtempSync(join(tmpdir(), "video-key-"));
const MP3 = join(DIR, "beat.mp3");
const MP3_OTHER = join(DIR, "other.mp3");
writeFileSync(MP3, "the bytes of one recording");
writeFileSync(MP3_OTHER, "the bytes of another recording");
const WORDS = [{ t: 0, d: 0.1, w: "una" }, { t: 0.2, d: 0.1, w: "narración" }];

const scene = (label, extra = {}) => ({ boxes: [{ x: 60, y: 60, w: 70, h: 40, label }], ...extra });

// A part of plain beats, so a key can be asked about one of them without a
// browser, an encoder or a frame.
function partOf(scenes, { length = 1, origin = 0, titles } = {}) {
  const beats = scenes.map((s, i) => ({
    tag: `s01b0${i}`,
    kicker: "Sección 1", heading: "Uno",
    title: titles ? titles[i] : `Beat ${i}`,
    narration: "una narración",
    deck: "", hold: false, viewBox: "0 0 360 290",
    start: i * length, speechStart: i * length + 0.15, speechDur: 0.5, end: (i + 1) * length,
    states: [{ t: i * length + 0.1, scene: s, text: "uno", title: "" }],
  }));
  return { part: "Parte T", title: "Claves", total: scenes.length * length, beats, cues: [], origin };
}

function identity(plan, tag, { words = WORDS, mp3 = MP3, drawing = DRAWING, encoder = ENCODER, fps = FPS, size = SIZE } = {}) {
  const segments = planSegments(plan, { from: 0, to: plan.total, fps });
  const segment = segments.find((s) => s.tag === tag);
  assert.ok(segment, `the window has no segment for ${tag}, only ${segments.map((s) => s.tag).join(", ")}`);
  const beats = new Map(plan.beats.map((b) => [b.tag, { mp3, dur: 0.5, words }]));
  return segmentIdentity({ plan, segment, beats, drawing, fps, size, encoder });
}

test("two beats that draw different things never share a key", () => {
  const plan = partOf([scene("uno"), scene("dos")]);
  assert.notEqual(identity(plan, "s01b00").key, identity(plan, "s01b01").key, "two different drawings share a cache entry, so one of them would be served as the other");
});

test("a beat keeps its key when another beat of the part changes", () => {
  const before = partOf([scene("uno"), scene("dos")]);
  const after = partOf([scene("uno"), scene("dos", { labels: [{ x: 10, y: 10, text: "nuevo" }] })]);
  assert.equal(
    identity(before, "s01b00").key,
    identity(after, "s01b00").key,
    "editing the second beat invalidated the first one, so a render would capture frames nobody changed",
  );
  assert.notEqual(identity(before, "s01b01").key, identity(after, "s01b01").key, "the beat that changed kept its key");
});

test("a beat keeps its key when the beats before it are replaced", () => {
  // Two parts of the same length whose second beat is the same one: nothing that
  // beat draws depends on what came before it, so nothing it is filed under may.
  const one = partOf([scene("otro"), scene("uno")]);
  const two = partOf([scene("tercero"), scene("uno")]);
  assert.equal(
    identity(one, "s01b01").key,
    identity(two, "s01b01").key,
    "the same beat in two parts of the same length is two cache entries, so the key carries the rest of the part instead of the segment",
  );
});

test("a beat moved to another instant of the part does not keep its key, and the progress bar is why", () => {
  // `frame(t)` draws the part's progress as `covered / plan.total`, so the same
  // scene at 1 s and at 3 s of a 4 s part is a different picture: a bar that wide
  // is not a bar that narrow. Serving one for the other would be a wrong frame,
  // which is worse than a missed cache entry. Both positions are past the opening
  // entrance ramp, so the bar is the only thing that moved.
  const atStart = partOf([scene("uno"), scene("dos"), scene("tres"), scene("cuatro")], { titles: ["Uno", "Dos", "Tres", "Cuatro"] });
  const atEnd = partOf([scene("uno"), scene("tres"), scene("cuatro"), scene("dos")], { titles: ["Uno", "Tres", "Cuatro", "Dos"] });
  const moved = identity(atStart, "s01b01");
  const after = identity(atEnd, "s01b03");
  assert.notEqual(moved.key, after.key, "a beat served from a different instant would draw the wrong progress bar");
  assert.notDeepEqual(moved.material.beat.bar, after.material.beat.bar, "the progress bar is not what the key noticed, so something else is making every moved beat a miss");
  const withoutBar = ({ material }) => ({ ...material, beat: { ...material.beat, bar: null } });
  assert.deepEqual(withoutBar(moved), withoutBar(after), "moving a beat changed more of the key than the progress bar, so a moved scene is more expensive than it has to be");
});

test("every input the picture and the encoder read is in the key", () => {
  const plan = partOf([scene("uno"), scene("dos")]);
  const base = identity(plan, "s01b00");
  const changes = {
    "the source that draws the frame": { drawing: "b".repeat(64) },
    "the frame rate": { fps: 24 },
    "the resolution": { size: { width: 1280, height: 720 } },
    "the encoder's preset": { encoder: { ...ENCODER, preset: "slow" } },
    "the encoder's crf": { encoder: { ...ENCODER, crf: 21 } },
    "the audio bytes under the segment": { mp3: MP3_OTHER },
    "the words the narration falls on": { words: [{ t: 0, d: 0.1, w: "otra" }, { t: 0.2, d: 0.1, w: "narración" }] },
  };
  for (const [what, options] of Object.entries(changes)) {
    assert.notEqual(identity(plan, "s01b00", options).key, base.key, `${what} changed and the cache would still serve the old segment`);
  }
  const other = partOf([scene("uno", { labels: [{ x: 10, y: 10, text: "nuevo" }] })]);
  assert.notEqual(identity(other, "s01b00").key, base.key, "a new scene kept the key of the old one");
  // The brand line in the corner is `plan.part · plan.title`, drawn into every
  // frame from the part rather than from the beat.
  const renamed = partOf([scene("uno"), scene("dos")]);
  renamed.title = "Otro título";
  assert.notEqual(identity(renamed, "s01b00").key, base.key, "the part was renamed and its brand line would be served from the cache");
});

test("a window that cuts a beat in the middle is not the whole beat's segment", () => {
  const plan = partOf([scene("uno"), scene("dos")]);
  const whole = planSegments(plan, { from: 0, to: plan.total, fps: FPS });
  const cut = planSegments(plan, { from: 0.5, to: 2, fps: FPS });
  assert.deepEqual(cut.map((s) => s.frames).reduce((a, b) => a + b, 0), 45, `a 1.5 s window at 30 fps is 45 frames, got ${cut.map((s) => s.frames).join(" + ")}`);
  const beats = new Map(plan.beats.map((b) => [b.tag, { mp3: MP3, dur: 0.5, words: WORDS }]));
  const key = (segment) => segmentIdentity({ plan: { ...plan, origin: 0.5 }, segment, beats, drawing: DRAWING, fps: FPS, size: SIZE, encoder: ENCODER }).key;
  assert.equal(cut[0].tag, "s01b00", "the first frame of the window still belongs to the first beat");
  assert.notEqual(key(cut[0]), key(whole[0]), "the first frames of a beat and the middle of it are the same segment, so a window would be served frames it never asked for");
  assert.equal(cut[cut.length - 1].tag, "s01b01");
  // The window starts inside the first beat, so the second one arrives whole: the
  // same beat is the same segment, and a window that cuts the part in half keeps
  // the entries of every beat it does not touch.
  assert.equal(key(cut[1]), key(whole[1]), "a beat the window covers from its first frame to its last is filed under two names");
});
