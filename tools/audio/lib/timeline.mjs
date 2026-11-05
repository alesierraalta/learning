// Pure planning: turn order, silence between turns, chapter marks and cues.
// No ffmpeg, no clock: the same spec and the same recordings always produce the
// same timeline, which is what makes a render reproducible and testable.
import { createHash } from "node:crypto";
import { RATE, TARGET_MINUTES, WORDS_PER_MINUTE, resolveVoices } from "./spec.mjs";

export const GAPS = { lead: 0.6, turn: 0.45, chapter: 1.15, tail: 0.9 };

/** The cache key of one turn: the voice and the exact words identify the take. */
export function turnKey(voice, text, rate = RATE) {
  return createHash("sha256").update(`${voice}|${rate}|${text}`).digest("hex").slice(0, 16);
}

/** Every turn of the spec, in speaking order, with its voice and cache key. */
export function turnTags(spec) {
  const voices = resolveVoices(spec);
  const tags = [];
  spec.chapters.forEach((chapter, ci) => {
    chapter.segments.forEach((segment, si) => {
      const voice = voices[segment.speaker].voice;
      tags.push({ chapter: ci, index: si, speaker: segment.speaker, voice, key: turnKey(voice, segment.text), text: segment.text });
    });
  });
  return tags;
}

const round = (value) => Math.round(value * 1000) / 1000;

/** What the spec costs in minutes, computed without a single recording. */
export function estimate(spec) {
  const tags = turnTags(spec);
  const chapters = spec.chapters.length;
  const count = tags.reduce((sum, tag) => sum + tag.text.trim().split(/\s+/).filter(Boolean).length, 0);
  // A chapter mark costs one gap, and the render writes it between chapters: the
  // first chapter opens after the lead silence, so n chapters add n - 1 of them.
  const gaps = GAPS.lead + GAPS.tail + Math.max(0, tags.length - chapters) * GAPS.turn + Math.max(0, chapters - 1) * GAPS.chapter;
  const seconds = (count / WORDS_PER_MINUTE) * 60 + gaps;
  return { turns: tags.length, chapters, words: count, gaps: round(gaps), seconds: round(seconds), minutes: round(seconds / 60), target: spec.minutes ?? TARGET_MINUTES };
}

/**
 * Absolute positions for every turn and every silence, the chapter marks, and
 * the transcript cues. `turns` maps a cache key to its measured duration and
 * word boundaries.
 */
export function buildTimeline(spec, turns) {
  const tags = turnTags(spec);
  const events = [];
  const chapters = [];
  const cues = [];
  let clock = 0;

  const silence = (dur) => { events.push({ kind: "silence", start: round(clock), dur: round(dur) }); clock += dur; };
  const turn = (tag, measured) => {
    if (!measured) throw new Error(`no recording for turn ${tag.key} (${tag.voice})`);
    events.push({ kind: "turn", start: round(clock), dur: round(measured.dur), key: tag.key, speaker: tag.speaker, chapter: tag.chapter });
    for (const cue of cuesOf(measured.words, clock, measured.dur)) cues.push({ ...cue, chapter: tag.chapter });
    clock += measured.dur;
  };

  silence(GAPS.lead);

  let current = -1;
  tags.forEach((tag, index) => {
    if (tag.chapter !== current) {
      if (current >= 0) {
        // The mark closes where the last voice of the chapter stops; the gap
        // that follows belongs to the next chapter's opening.
        chapters[chapters.length - 1].end = round(clock);
        silence(GAPS.chapter);
      }
      current = tag.chapter;
      chapters.push({ title: spec.chapters[tag.chapter].title, start: round(clock), end: null });
    }
    turn(tag, turns.get(tag.key));
    const next = tags[index + 1];
    if (next && next.chapter === tag.chapter) silence(GAPS.turn);
  });
  chapters[chapters.length - 1].end = round(clock);
  silence(GAPS.tail);
  const duration = round(clock);

  // A cue never starts before the previous one ends, even when a word boundary
  // lands a few milliseconds early.
  let previousEnd = 0;
  for (const cue of cues) {
    if (cue.start < previousEnd) cue.start = round(previousEnd);
    if (cue.end <= cue.start) cue.end = round(cue.start + 0.6);
    previousEnd = cue.end;
  }
  return { duration, events, chapters, cues, srt: toSrt(cues) };
}

/** Groups a turn's word boundaries into cues of at most 7 s and 12 words. */
function cuesOf(boundaries, offset, dur) {
  const list = (boundaries || []).map((b) => ({ t: Number(b.t), d: Number(b.d), w: String(b.w) }));
  if (!list.length) return [];
  const cues = [];
  let start = 0;
  let count = 0;
  for (let i = 0; i < list.length; i += 1) {
    count += 1;
    const next = list[i + 1];
    const elapsed = (next ? next.t : list[i].t + list[i].d) - list[start].t;
    if (!next || count >= 12 || elapsed >= 7) {
      const text = list.slice(start, i + 1).map((b) => b.w).join(" ").replace(/\s+([,.;:!?])/g, "$1");
      // A boundary can claim more time than the take holds (a trailing pause is
      // often reported as speech). The recording decides: a cue never runs past it.
      const end = Math.min(offset + list[i].t + list[i].d, offset + dur);
      cues.push({ start: round(offset + list[start].t), end: round(Math.max(end, offset + list[start].t)), text });
      start = i + 1;
      count = 0;
    }
  }
  return cues;
}

const pad = (value, width = 2) => String(Math.floor(value)).padStart(width, "0");

export function timecode(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms % 1000).padStart(3, "0")}`;
}

export function toSrt(cues) {
  return cues.map((cue, i) => `${i + 1}\n${timecode(cue.start)} --> ${timecode(cue.end)}\n${cue.text}\n`).join("\n");
}
