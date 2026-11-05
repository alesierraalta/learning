// The craft gate: the part of a frame a viewer can read, measured instead of
// argued about. These are the numbers, kept apart from the browser that fills
// them in, so the rules can be tested without a single pixel.
//
// Provenance: the thresholds are the ones HyperFrames publishes and enforces in
// its own `check` (type floor 2.6% of the frame's short side, WCAG AA contrast,
// a three-second still that reads as a hole rather than a deliberate hold). We
// keep our own stage and take its arithmetic, not its architecture.

export const FLOOR_RATIO = 0.026; // share of the short side a reader needs
export const DEAD_SECONDS = 3; // a still this long is a hole, not a hold
export const LARGE_PX = 24; // WCAG "large text", and only that
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

const NAMED = { white: "#ffffff", black: "#000000", transparent: "rgba(0, 0, 0, 0)" };

export function typeFloor(height) {
  return Math.round(Number(height) * FLOOR_RATIO);
}

// "#rgb", "#rrggbb", "#rrggbbaa", "rgb(...)", "rgba(...)", and the two names a
// flat palette needs. Anything else is a typo worth failing on.
export function parseColor(css) {
  const text = String(css).trim().toLowerCase();
  const value = NAMED[text] || text;
  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1];
    const at = (i, w) => parseInt(w === 1 ? h[i] + h[i] : h.slice(i * w, i * w + w), 16);
    if (h.length === 3 || h.length === 4) return { r: at(0, 1), g: at(1, 1), b: at(2, 1), a: h.length === 4 ? at(3, 1) / 255 : 1 };
    if (h.length === 6 || h.length === 8) return { r: at(0, 2), g: at(1, 2), b: at(2, 2), a: h.length === 8 ? at(3, 2) / 255 : 1 };
  }
  const fn = value.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    // A percentage means the same thing in every slot: a share of one. Only the
    // colour channels scale to 255; an alpha read that way would be 127.5 for
    // half a colour and turn a ghost into a perfectly readable line.
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map((part, at) => {
      const value = parseFloat(part);
      if (!part.endsWith("%")) return value;
      return at > 2 ? value / 100 : (value / 100) * 255;
    });
    // An alpha outside 0..1 is clamped, as CSS clamps it; interpolating past
    // either end would put the channel arithmetic outside the gamut.
    if (parts.length >= 3) return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? Math.min(1, Math.max(0, parts[3])) : 1 };
  }
  throw new Error(`colour "${css}" is not one this gate can read`);
}

// A colour with alpha is not a colour: it is a colour over something.
export function composite(fg, bg) {
  const top = typeof fg === "string" ? parseColor(fg) : fg;
  const under = typeof bg === "string" ? parseColor(bg) : bg;
  const a = top.a;
  return {
    r: top.r * a + under.r * (1 - a),
    g: top.g * a + under.g * (1 - a),
    b: top.b * a + under.b * (1 - a),
    a: 1,
  };
}

function channel(v) {
  const s = Math.min(255, Math.max(0, v)) / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(color) {
  const c = typeof color === "string" ? parseColor(color) : color;
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function contrastRatio(fg, bg) {
  const under = typeof bg === "string" ? parseColor(bg) : bg;
  const top = composite(fg, under);
  const a = luminance(top);
  const b = luminance(under);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG also relaxes body text to 3:1 when it is bold and at least 18.66 px.
// A 19 px bold label in a 1080p film is not large to the phone it is watched on,
// so this gate keeps the single 24 px line: stricter than WCAG, never looser.
export function isLarge(px) {
  return Number(px) >= LARGE_PX;
}

export function requiredRatio(px) {
  return isLarge(px) ? AA_LARGE : AA_NORMAL;
}

// One piece of text, one verdict. `texture` is the waiver: a kicker, a counter,
// a brand plate — text that is part of the frame's surface rather than a
// sentence a viewer is meant to read. A waiver never silences a real failure,
// it only downgrades the floor it would otherwise break.
export function assessText({ text, px, weight = 400, color, background, texture = false, frameHeight = 1080, where, time }) {
  if (!String(text || "").trim()) return [];
  const size = Number(px);
  const floor = typeFloor(frameHeight);
  const out = [];
  const need = requiredRatio(size);
  const ratio = contrastRatio(color, background);
  // A word drawn at a third of its ink is a ghost of a later state, not a line
  // the viewer is asked to read now: the ratio is reported, the severity is a
  // question for the author.
  const alpha = parseColor(color).a;
  if (ratio < need) {
    out.push({
      code: "contrast_aa_failure",
      severity: alpha < 0.5 ? "warning" : "error",
      message: `contrast is ${ratio.toFixed(2)}:1; WCAG AA needs ${need}:1${alpha < 0.5 ? ` at alpha ${alpha.toFixed(2)} — the ghost of a later state` : ""}`,
      text: String(text),
      px: size,
      weight: Number(weight),
      ratio: Number(ratio.toFixed(2)),
      required: need,
      color,
      background,
      where,
      time,
    });
  }
  if (size < floor) {
    out.push({
      code: "text_below_floor",
      severity: texture ? "waived" : "warning",
      message: `${size} px is under the ${floor} px floor (${(FLOOR_RATIO * 100).toFixed(1)}% of the short side)${texture ? " — waived as texture" : ""}`,
      text: String(text),
      px: size,
      floor,
      where,
      time,
    });
  }
  return out;
}

// A hold the author meant is not a hole the viewer falls into. The gate reports
// the stretch either way; only a declared hold is allowed to pass as waived.
// A figure that holds still while the voice explains is not a hole: the film is
// moving. The question is the silence, so the gate asks how long nothing moves
// *and* nothing is said.
export function silenceSpans(window, speech = []) {
  const out = [];
  let cursor = window.from;
  const talk = speech.map((s) => ({ start: s.start, end: s.end })).sort((a, b) => a.start - b.start);
  for (const span of talk) {
    if (span.end <= cursor) continue;
    if (span.start >= window.to) break;
    if (span.start > cursor) {
      const to = Math.min(span.start, window.to);
      out.push({ from: cursor, to, seconds: Number((to - cursor).toFixed(3)) });
    }
    cursor = Math.max(cursor, span.end);
    if (cursor >= window.to) break;
  }
  if (cursor < window.to) out.push({ from: cursor, to: window.to, seconds: Number((window.to - cursor).toFixed(3)) });
  return out;
}

export function longestSilence(window, speech = []) {
  let best = null;
  for (const span of silenceSpans(window, speech)) if (!best || span.seconds > best.seconds) best = span;
  return best;
}

export function deadStretches(samples, minSeconds = DEAD_SECONDS) {
  const out = [];
  let run = null;
  for (const s of samples) {
    if (run && s.hash === run.hash) {
      run.to = s.t;
      continue;
    }
    if (run) push(run);
    run = { hash: s.hash, from: s.t, to: s.t };
  }
  if (run) push(run);
  return out;

  function push(r) {
    const seconds = Number((r.to - r.from).toFixed(3));
    if (seconds >= minSeconds) out.push({ from: r.from, to: r.to, seconds });
  }
}

export function summarize(findings) {
  const out = { error: 0, warning: 0, waived: 0 };
  for (const f of findings) if (f.severity in out) out[f.severity] += 1;
  return out;
}

// The same element offends at every instant it is on screen; a gate reports a
// defect once, at the first instant it appears, and counts the rest.
export function dedupe(findings) {
  const seen = new Map();
  for (const finding of findings) {
    const key = [finding.code, String(finding.where || "").replace(/@[\d.]+s/g, ""), finding.text || finding.message].join("|");
    const prior = seen.get(key);
    if (!prior) {
      seen.set(key, { ...finding, count: 1 });
      continue;
    }
    prior.count += 1;
    prior.time = Math.min(prior.time ?? Infinity, finding.time ?? Infinity);
  }
  return [...seen.values()];
}
