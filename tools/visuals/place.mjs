// An arrow's label is placed by rule, not by hand: the first candidate that
// clears every box in the band wins.
const OVER = 4;

const overlaps = (spot, rect) =>
  spot.x < rect.x + rect.w + OVER &&
  spot.x + spot.w > rect.x - OVER &&
  spot.y < rect.y + rect.h + OVER &&
  spot.y + spot.h > rect.y - OVER;

const rectsOf = (arrows) => (Array.isArray(arrows) ? arrows : []).filter((a) => a && Number.isFinite(a.x));

function width(text, size) {
  return String(text).length * size * 0.52;
}

export function placeLabel(rects, arrow, size = 18) {
  const boxes = rectsOf(rects);
  const text = String(arrow.label ?? "");
  const w = width(text, size);
  const h = size * 1.2;
  const midX = (arrow.x1 + arrow.x2) / 2;
  const midY = (arrow.y1 + arrow.y2) / 2;
  const horizontal = Math.abs(arrow.x2 - arrow.x1) >= Math.abs(arrow.y2 - arrow.y1);

  const candidates = horizontal
    ? [
        { x: midX - w / 2, y: Math.min(arrow.y1, arrow.y2) - h - OVER, anchor: "middle" },
        { x: midX - w / 2, y: Math.max(arrow.y1, arrow.y2) + OVER, anchor: "middle" },
        { x: arrow.x1 - w - OVER, y: midY - h / 2, anchor: "end" },
        { x: arrow.x2 + OVER, y: midY - h / 2, anchor: "start" },
      ]
    : [
        { x: Math.min(arrow.x1, arrow.x2) - w - OVER, y: midY - h / 2, anchor: "end" },
        { x: Math.max(arrow.x1, arrow.x2) + OVER, y: midY - h / 2, anchor: "start" },
        { x: midX - w / 2, y: Math.min(arrow.y1, arrow.y2) - h - OVER, anchor: "middle" },
        { x: midX - w / 2, y: Math.max(arrow.y1, arrow.y2) + OVER, anchor: "middle" },
      ];

  for (const spot of candidates) {
    const box = { x: spot.x, y: spot.y, w, h };
    if (!boxes.some((rect) => overlaps(box, rect))) return spot;
  }
  return candidates[0];
}
