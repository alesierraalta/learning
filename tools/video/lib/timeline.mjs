// Pure planning: what the stage shows, and when. No DOM, no I/O, no clock.
// Every state change is anchored to the narration, so the drawing moves when
// the voice says it.

export const LEAD = 0.15; // silence before a beat's speech
export const TAIL = 0.35; // silence after it
export const FIRST_STATE = 0.10; // first state of a beat, seconds into speech
export const STATE_MARGIN = 0.90; // keep the last state on screen before the beat ends

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export function beatTag(section, beat) {
  return `s${String(section + 1).padStart(2, "0")}b${String(beat).padStart(2, "0")}`;
}

export function checkNarration(narration, words) {
  const spoken = narration.trim().split(/\s+/).map(norm);
  const recorded = words.map((w) => norm(w.w));
  if (spoken.length !== recorded.length || spoken.some((w, i) => w !== recorded[i])) {
    throw new Error(`narration does not match the audio's word boundaries (${spoken.length} words spoken, ${recorded.length} recorded); re-synthesise the narration`);
  }
}

// "una flecha por casilla" -> time of the first word of that phrase.
export function wordAnchor(narration, words, phrase) {
  const wanted = norm(phrase).split(" ");
  const spoken = narration.split(/\s+/).map((w) => norm(w));
  if (spoken.length !== words.length) {
    throw new Error(`narration has ${spoken.length} words but the audio has ${words.length} boundaries; re-synthesise "${narration.slice(0, 40)}…"`);
  }
  for (let i = 0; i + wanted.length <= spoken.length; i++) {
    if (wanted.every((w, k) => spoken[i + k] === w)) return words[i].t;
  }
  throw new Error(`anchor "${phrase}" does not appear in the narration`);
}

// Resolve a beat's states to absolute times inside the part.
export function resolveStates({ states, anchors, narration, words, speechStart, speechDur, start }) {
  if (states.length === 0) throw new Error("a visual needs at least one state");
  // The first state is drawn as the beat opens, not a moment later: a beat that
  // waited for the voice left the figure blank at every cut.
  const from = Number.isFinite(start) ? start : speechStart + FIRST_STATE;
  const last = speechStart + Math.max(FIRST_STATE + 0.2, speechDur - STATE_MARGIN);
  if (anchors && anchors.length && anchors.length !== states.length) {
    throw new Error(`visual has ${states.length} states but ${anchors.length} anchors`);
  }
  const span = Math.max(0, last - from);
  return states.map((state, i) => {
    let at;
    if (!anchors || !anchors.length) {
      at = states.length === 1 ? from : from + (span * i) / (states.length - 1);
    } else {
      const anchor = anchors[i];
      if (typeof anchor === "number") {
        if (!(anchor >= 0 && anchor <= 1)) throw new Error(`anchor ${anchor} must be between 0 and 1`);
        at = from + span * anchor;
      } else if (typeof anchor === "string") {
        at = speechStart + wordAnchor(narration, words, anchor);
      } else {
        throw new Error(`anchor must be a word phrase or a 0..1 fraction, got ${JSON.stringify(anchor)}`);
      }
    }
    // The beat opens on its first drawing. Only the later states wait for a
    // spoken phrase, so a cut never leaves the figure empty.
    if (i === 0 && Number.isFinite(start)) return { ...state, t: Math.min(start, last) };
    return { ...state, t: Math.min(last, Math.max(from, at)) };
  });
}

// SRT cues from TTS word boundaries: at most two lines, at most ~44 characters
// a line, and each cue starts no earlier than the previous one ended.
export function cues(words, offset, { maxChars = 44, maxSeconds = 6 } = {}) {
  const out = [];
  let line = [];
  let start = null;
  let end = null;
  const flush = () => {
    if (!line.length) return;
    const text = group(line, maxChars).join("\n");
    const s = start + offset;
    const e = Math.max(s + 0.9, end + offset);
    if (out.length && s < out[out.length - 1][1]) out[out.length - 1][1] = s;
    out.push([s, e, text]);
    line = [];
    start = null;
    end = null;
  };
  for (const w of words) {
    if (!w.w.trim()) continue;
    if (start === null) start = w.t;
    const next = [...line, w.w.trim()].join(" ");
    if (line.length >= 2 && (next.length > maxChars * 2 || w.t + w.d - start > maxSeconds)) {
      flush();
      start = w.t;
    }
    line.push(w.w.trim());
    end = w.t + w.d;
  }
  flush();
  return out;
}

function group(words, maxChars) {
  const lines = ["", ""];
  let n = 0;
  for (const w of words) {
    const target = lines[n].length + w.length + (lines[n] ? 1 : 0);
    if (target > maxChars && n === 0) n = 1;
    lines[n] = lines[n] ? `${lines[n]} ${w}` : w;
  }
  return lines.filter(Boolean);
}

// The drawn extent of a scene, so a beat can fill the frame instead of sitting
// in the middle of an oversized viewBox. Zoom is capped: a crop that jumps too
// far between beats reads as a cut, not as a camera move.
export function contentBox(states, viewBox, { pad = 10, maxZoom = 1.5 } = {}) {
  const vb = viewBox.split(/\s+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) return viewBox;
  let b = null;
  const add = (x1, y1, x2, y2) => {
    b = b ? [Math.min(b[0], x1), Math.min(b[1], y1), Math.max(b[2], x2), Math.max(b[3], y2)] : [x1, y1, x2, y2];
  };
  const text = (x, y, size, length, anchor = "middle") => {
    const w = (size || 18) * 0.52 * String(length).length;
    const x1 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
    add(x1, y - (size || 18), x1 + w, y + (size || 18) * 0.3);
  };
  for (const state of states) {
    const s = state.scene || {};
    for (const box of [...(s.boxes || []), ...(s.panels || []), ...(s.dashed || []), ...(s.bars || [])]) {
      add(box.x, box.y, box.x + (box.w || box.width || 0), box.y + (box.h || box.height || 0));
    }
    for (const g of s.grids || []) {
      const header = g.header === false ? 0 : 1;
      add(g.x, g.y, g.x + (g.width || 560), g.y + (g.rowH || 48) * ((g.rows || []).length + header));
    }
    for (const sh of s.sheets || []) add(sh.x, sh.y, sh.x + (sh.w || sh.width || 0), sh.y + (sh.h || sh.height || 0));
    for (const a of [...(s.arrows || []), ...(s.lines || []), ...(s.curves || [])]) {
      add(Math.min(a.x1, a.x2) - 6, Math.min(a.y1, a.y2) - 6, Math.max(a.x1, a.x2) + 6, Math.max(a.y1, a.y2) + 6);
      if (a.label) text((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2 - 12, a.labelSize || 15, a.label);
    }
    for (const l of s.labels || []) text(l.x, l.y, l.size || 18, l.text, l.anchor);
    for (const f of s.formulas || []) text(f.x, f.y, f.size || 34, f.text, f.anchor);
    for (const n of s.nodes || []) add(n.cx - (n.r || 30), n.cy - (n.r || 30), n.cx + (n.r || 30), n.cy + (n.r || 30));
    for (const bd of s.badges || []) add(bd.cx - 24, bd.cy - 24, bd.cx + 24, bd.cy + 24);
    if (s.paths || s.gears || s.packets) return viewBox;
  }
  if (!b) return viewBox;
  const [vx, vy, vw, vh] = vb;
  const w = Math.min(vw, Math.max(b[2] - b[0] + pad * 2, vw / maxZoom));
  const h = Math.min(vh, Math.max(b[3] - b[1] + pad * 2, vh / maxZoom));
  const cx = (b[0] + b[2]) / 2;
  const cy = (b[1] + b[3]) / 2;
  const x = Math.min(Math.max(cx - w / 2, vx), vx + vw - w);
  const y = Math.min(Math.max(cy - h / 2, vy), vy + vh - h);
  return [x, y, w, h].map((n) => Math.round(n * 10) / 10).join(" ");
}

// The whole part: sections -> beats -> states, with absolute times.
export function buildTimeline(spec, beats, decks) {
  const out = [];
  let t = 0;
  spec.sections.forEach((section, si) => {
    const sectionStart = t;
    section.beats.forEach((beat, bi) => {
      const tag = beatTag(si, bi);
      const audio = beats.get(tag);
      if (!audio) throw new Error(`no audio for ${tag} "${beat.title}"`);
      checkNarration(beat.narration, audio.words);
      const start = t;
      const speechStart = start + LEAD;
      const speechDur = audio.dur;
      const end = speechStart + speechDur + TAIL;
      const { states, deck, viewBox } = visuals(beat, decks);
      const timed = resolveStates({
        states,
        anchors: beat.visual.anchors,
        narration: beat.narration,
        words: audio.words,
        speechStart,
        speechDur,
        start,
      });
      out.push({
        tag,
        section: si,
        beat: bi,
        kicker: section.kicker,
        heading: section.heading,
        title: beat.title,
        narration: beat.narration,
        deck,
        viewBox: contentBox(timed, viewBox),
        start,
        speechStart,
        speechDur,
        end,
        states: timed,
      });
      t = end;
    });
    out[out.length - 1].sectionEnd = t;
    out[out.length - 1].sectionStart = sectionStart;
  });
  const total = t;
  const cueList = [];
  for (const beat of out) {
    const audio = beats.get(beat.tag);
    cueList.push(...cues(audio.words, beat.speechStart));
  }
  return { beats: out, cues: cueList, total };
}

function visuals(beat, decks) {
  const v = beat.visual || {};
  if (v.deck) {
    const deck = decks.find((d) => d.title === v.deck);
    if (!deck) throw new Error(`deck "${v.deck}" is not in the note`);
    const steps = v.steps && v.steps.length ? v.steps : deck.steps.map((_, i) => i);
    const picked = steps.map((i) => {
      const step = deck.steps[i];
      if (!step) throw new Error(`beat "${beat.title}" picks deck step ${i} but deck "${deck.title}" has ${deck.steps.length} steps`);
      return step;
    });
    return {
      deck: deck.title,
      viewBox: deck.viewBox,
      states: picked.map((s) => ({ scene: s.scene, text: s.text || "", title: s.title || "" })),
    };
  }
  const scenes = v.scenes || (v.scene ? [v.scene] : []);
  if (!scenes.length) throw new Error(`beat "${beat.title}" has no visual`);
  return {
    deck: null,
    viewBox: v.viewBox || "0 0 360 290",
    states: scenes.map((s) => (s.scene ? s : { scene: s, text: v.text || "", title: "" })),
  };
}
