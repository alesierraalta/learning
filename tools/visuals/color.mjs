// Fills are mixed against the paper, never layered with alpha over an unknown
// background: the same figure has to survive a white page and a black one.
const HEX = /^#[0-9a-f]{6}$/i;

function channels(hex) {
  if (!HEX.test(hex)) throw new Error(`not a hex colour: ${hex}`);
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
}

const hex = (rgb) => `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

export function mix(tone, paper, alpha) {
  const a = Number(alpha);
  if (!Number.isFinite(a) || a < 0 || a > 1) throw new Error(`alpha out of range: ${alpha}`);
  const [tr, tg, tb] = channels(tone);
  const [pr, pg, pb] = channels(paper);
  return hex([tr * a + pr * (1 - a), tg * a + pg * (1 - a), tb * a + pb * (1 - a)]);
}

export function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
