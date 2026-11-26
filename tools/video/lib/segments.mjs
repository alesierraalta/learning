// The film, cut into the units the cache keeps: one segment per beat, on frame
// boundaries. Each segment is captured and encoded on its own — same encoder, same
// parameters — so a render can keep the segments that did not change and pay only
// for the one that did; the pieces are joined with `stream copy`, and the audio is
// encoded once for the whole window and muxed at the end, so no sample is
// re-encoded at a cut.
//
// What makes reuse safe is the key, and the key is the picture: everything the
// drawing and the encoder read goes in, and nothing about where the segment sits
// comes out. In goes the slice of the spec the segment covers, the narration words
// that fall inside it, the bytes of the audio under it, fps, size, encoder
// parameters, the hash of the code that draws a frame, the beat's own clock
// relative to the window's frame grid, and the part's progress bar — which is
// drawn from where the instant is in the part and is therefore the one thing in a
// frame that is not the beat's own content. A beat that moves to another instant
// draws another bar, so it does not share its entry: serving it would be a wrong
// picture, and a wrong picture is worse than a missed cache entry.
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

// Bumping this invalidates every entry on disk: it says what the key means, not
// what is in it.
export const SEGMENT_VERSION = 1;

// The stage ramps an entering primitive in from the instant it paints it, over
// DRAW seconds and staggered by STAGGER in drawing order (`paint()` in
// src/page/stage.js). Both numbers are copied here on purpose: that file is part
// of the drawing hash, so a change to either one invalidates every entry before
// this copy can disagree with it.
const DRAW = 0.55;
const STAGGER = 0.07;

// A segment that is a video is never this small, so a file this small is a failed
// write wearing a cache name.
const MIN_ENTRY = 1024;

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const round = (n, digits = 6) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
const frac = (n) => round(n - Math.floor(n));
const frames = (seconds, fps) => round(seconds * fps);

// The film's window as segments: consecutive frames drawn on the same beat. A
// segment always starts and ends on a frame boundary, because the frames are what
// the encoder is given.
export function planSegments(plan, { from, to, fps }) {
  const total = Math.round((to - from) * fps);
  const out = [];
  let current = null;
  for (let k = 0; k < total; k++) {
    const at = from + k / fps;
    const beat = beatAt(plan.beats, at);
    if (!current || current.beat !== beat) {
      current = { beat, tag: beat.tag, first: k, start: at, frames: 0 };
      out.push(current);
    }
    current.frames += 1;
  }
  return out;
}

// The beat on screen at an instant, by the same rule the stage uses (pick()).
function beatAt(beats, t) {
  for (let i = 0; i < beats.length; i++) if (t < beats[i].end) return beats[i];
  return beats[beats.length - 1];
}

// The identity of a segment: the name its bytes are filed under, and the material
// it was made from so a test can say *why* two segments disagree.
export function segmentIdentity({ plan, segment, beats, drawing, fps, size, encoder }) {
  const beat = segment.beat;
  const audio = beats.get(beat.tag);
  if (!audio) throw new Error(`no audio for ${beat.tag}, so the segment cannot be keyed on the bytes under it`);
  const last = segment.start + (segment.frames - 1) / fps;
  const origin = Number(plan.origin) || 0;
  const material = {
    version: SEGMENT_VERSION,
    drawing,
    encoder,
    fps,
    size,
    audio: sha256(readFileSync(audio.mp3)),
    frames: segment.frames,
    words: spokenIn(audio.words, beat, segment, fps),
    // The brand line is drawn from the part, not from the beat: `plan.part ·
    // plan.title` is in every frame (boot() in src/page/stage.js).
    part: `${plan.part || ""} · ${plan.title || ""}`,
    beat: {
      kicker: beat.kicker || "",
      heading: beat.heading || "",
      title: beat.title,
      narration: beat.narration,
      deck: beat.deck || "",
      viewBox: beat.viewBox,
      hold: beat.hold === true,
      // Where the segment starts inside the beat, and where the beat's clock sits
      // on the window's frame grid. Both move the entrance ramp and the cross-fade
      // by a fraction of a frame, so both are part of the picture.
      offset: frames(segment.start - beat.start, fps),
      phase: frac((beat.start - origin) * fps),
      bar: [round(barAt(plan, segment.start), 4), round(barAt(plan, last), 4)],
      states: beat.states.map((state) => ({
        at: frames(state.t - beat.start, fps),
        title: state.title || "",
        text: state.text || "",
        scene: state.scene || {},
      })),
      ramp: rampOf(beat, segment, plan, fps),
    },
  };
  return { key: sha256(JSON.stringify(material)), material };
}

// The words whose instant falls inside the segment: the narration the frames are
// drawn against. A re-recording moves them, so it moves the key.
function spokenIn(words, beat, segment, fps) {
  const end = segment.start + segment.frames / fps;
  return words
    .filter((word) => {
      const at = beat.speechStart + word.t;
      return at >= segment.start - 1e-9 && at < end - 1e-9;
    })
    .map((word) => ({ at: frames(beat.speechStart + word.t - beat.start, fps), d: round(word.d), w: word.w }));
}

// The part's progress at an instant, as the stage draws it: `covered / plan.total`
// (`frame()` in src/page/stage.js). The only quantity in a frame that is not the
// beat's own content.
function barAt(plan, t) {
  let covered = 0;
  let before = 0;
  for (const beat of plan.beats) {
    if (t >= beat.start) covered = Math.min(t, beat.end) - beat.start + before;
    before += beat.end - beat.start;
  }
  const share = plan.total > 0 ? covered / plan.total : 0;
  return Math.min(Math.max(share, 0), 1) * 100;
}

// Whether the entrance ramp is saturated over this segment. `paint()` ramps from
// the absolute instant it is painting at — including the instant the state that is
// leaving is repainted at — so a frame inside the opening ramp depends on where in
// the film it is, not only on the beat's own clock. Past the ramp every primitive
// is fully drawn and the picture is the beat's content alone, which is what keeps
// a beat's key free of its position in the film; inside it the segment carries its
// absolute instants, because the pictures really do differ there.
function rampOf(beat, segment, plan, fps) {
  const last = segment.start + (segment.frames - 1) / fps;
  const origin = Number(plan.origin) || 0;
  const painted = [segment.start];
  for (const state of beat.states) {
    if (state.t > last + 1e-9) continue;
    painted.push(frozenAt(state.t, origin, fps));
  }
  const prims = beat.states.reduce((n, state) => n + primsOf(state.scene), 0);
  const saturated = Math.min(...painted) >= DRAW + Math.max(0, prims - 1) * STAGGER;
  return saturated ? null : { beatStart: round(beat.start), origin: round(origin) };
}

// One primitive per item of every list a scene has: `sceneMarkup()` pushes exactly
// one group per item, so this bounds the stagger rank without rebuilding the layer.
function primsOf(scene) {
  if (!scene) return 0;
  return Object.values(scene).reduce((n, value) => n + (Array.isArray(value) ? value.length : 0), 0);
}

// The instant the state that is leaving is repainted at, exactly as the stage
// quantizes it (`frozenAt()` in src/page/stage.js).
function frozenAt(t, origin, fps) {
  return origin + Math.floor((t - origin) * fps - 1e-6) / fps;
}

// The cache: entries are named by their key, so there is no index to get out of
// step and no metadata to trust.
export function segmentCache(dir) {
  let serial = 0;
  const file = (key) => join(dir, `${key}.mp4`);
  return {
    dir,
    file,
    hit(key) {
      try {
        return statSync(file(key)).size > MIN_ENTRY;
      } catch {
        return false;
      }
    },
    // The temporary carries the pid and a serial: two renders racing on the same
    // key never share one, so neither can publish half of the other's segment.
    temporary(key) {
      serial += 1;
      return join(dir, `${key}.${process.pid}.${serial}.part`);
    },
    // Whole or not at all. The bytes are on the disk before the rename publishes
    // them, so an interrupted render leaves a `.part` nobody reads and never an
    // entry a later render would serve.
    async commit(key, temporary) {
      const handle = await open(temporary, "r");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, file(key));
      await syncDirectory(dir);
    },
    async discard(temporary) {
      await unlink(temporary).catch(() => {});
    },
  };
}

async function syncDirectory(dir) {
  let handle = null;
  try {
    handle = await open(dir, "r");
    await handle.sync();
  } catch {
    // Not every filesystem lets a directory be fsynced; the rename stays atomic.
  } finally {
    await handle?.close().catch(() => {});
  }
}
