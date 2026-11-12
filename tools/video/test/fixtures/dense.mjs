// A part that is dense on purpose, for the tests that care whether a frame
// depends on what was drawn before it. The other fixtures draw one box and one
// state, so every frame of them is the same picture and a state that survives
// the frame it belonged to cannot be seen. Here a beat carries three states,
// almost every primitive kind the stage knows, and the transitions land while
// the elements of the state before them are still drawing themselves.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const WORDS = "cada estado decide que hacer y el valor lo dice".split(" ");
export const SECONDS = 2;
export const ANCHORS = ["cada", "que", "el valor"];

const box = (x, y, label, tone) => ({ x, y, w: 64, h: 44, label, tone });

// `shared` appears in every state, so it is never entering and its attributes
// must come from paint, never from construction.
const shared = { panels: [{ x: 16, y: 16, w: 150, h: 84, title: "Panel", lines: ["uno", "dos"] }] };

export const SCENES = [
  {
    text: "el estado uno",
    title: "Uno",
    scene: {
      ...shared,
      boxes: [box(196, 40, "A", "blue"), box(276, 40, "B", "green")],
      dashed: [{ x: 16, y: 116, w: 148, h: 62, label: "borrador" }],
      nodes: [{ cx: 60, cy: 224, label: "n1", tone: "amber" }, { cx: 132, cy: 224, label: "n2", tone: "red" }],
      arrows: [
        { x1: 212, y1: 62, x2: 276, y2: 62, label: "va", tone: "blue" },
        { x1: 232, y1: 92, x2: 232, y2: 130, label: "baja", tone: "green" },
      ],
      lines: [{ x1: 40, y1: 112, x2: 140, y2: 116, tone: "slate" }],
      curves: [{ x1: 60, y1: 200, x2: 132, y2: 200, tone: "amber", dashed: true }],
      badges: [{ cx: 176, cy: 64, n: 1 }, { cx: 176, cy: 100, n: 2 }],
      labels: [{ x: 90, y: 250, text: "abajo" }, { x: 300, y: 210, text: "derecha", anchor: "start" }],
      formulas: [{ x: 240, y: 170, text: "r = v + 1", size: 28 }],
      bars: [{ x: 190, y: 200, w: 150, h: 70, items: [{ label: "a", value: 3, tone: "blue" }, { label: "b", value: 5, tone: "green" }] }],
      sheets: [{ x: 196, y: 12, w: 60, h: 20, title: "ficha", lines: 1 }],
    },
  },
  {
    text: "el estado dos",
    title: "Dos",
    scene: {
      ...shared,
      boxes: [box(196, 40, "A", "blue"), box(276, 40, "B", "green"), box(276, 96, "C", "amber")],
      dashed: [{ x: 16, y: 116, w: 148, h: 62, label: "borrador" }],
      nodes: [{ cx: 60, cy: 224, label: "n1", tone: "amber" }, { cx: 132, cy: 224, label: "n2", tone: "red" }],
      arrows: [
        { x1: 212, y1: 62, x2: 276, y2: 62, label: "va", tone: "blue" },
        { x1: 232, y1: 92, x2: 232, y2: 130, label: "baja", tone: "green" },
        { x1: 308, y1: 84, x2: 308, y2: 96, label: "sigue", tone: "amber" },
      ],
      lines: [{ x1: 40, y1: 112, x2: 140, y2: 116, tone: "slate" }],
      curves: [{ x1: 60, y1: 200, x2: 132, y2: 200, tone: "amber", dashed: true }],
      badges: [{ cx: 176, cy: 64, n: 1 }, { cx: 176, cy: 100, n: 2 }],
      labels: [{ x: 90, y: 250, text: "abajo" }, { x: 300, y: 210, text: "derecha", anchor: "start" }, { x: 240, y: 26, text: "arriba" }],
      formulas: [{ x: 240, y: 170, text: "r = v + 1", size: 28 }],
      bars: [{ x: 190, y: 200, w: 150, h: 70, items: [{ label: "a", value: 3, tone: "blue" }, { label: "b", value: 5, tone: "green" }, { label: "c", value: 2, tone: "amber" }] }],
      sheets: [{ x: 196, y: 12, w: 60, h: 20, title: "ficha", lines: 1 }],
    },
  },
  {
    text: "el estado tres",
    title: "Tres",
    scene: {
      ...shared,
      boxes: [box(196, 40, "A", "blue"), box(276, 40, "B", "green"), box(276, 96, "C", "amber"), box(196, 116, "D", "red")],
      dashed: [{ x: 16, y: 116, w: 148, h: 62, label: "borrador" }],
      nodes: [{ cx: 60, cy: 224, label: "n1", tone: "amber" }, { cx: 132, cy: 224, label: "n2", tone: "red" }, { cx: 96, cy: 270, label: "n3", tone: "blue", r: 20 }],
      arrows: [
        { x1: 212, y1: 62, x2: 276, y2: 62, label: "va", tone: "blue" },
        { x1: 232, y1: 92, x2: 232, y2: 130, label: "baja", tone: "green" },
        { x1: 308, y1: 84, x2: 308, y2: 96, label: "sigue", tone: "amber" },
        { x1: 228, y1: 138, x2: 196, y2: 138, label: "vuelve", tone: "red", dashed: true },
      ],
      lines: [{ x1: 40, y1: 112, x2: 140, y2: 116, tone: "slate" }, { x1: 40, y1: 96, x2: 140, y2: 96, tone: "ink", arrow: false }],
      curves: [{ x1: 60, y1: 200, x2: 132, y2: 200, tone: "amber", dashed: true }],
      badges: [{ cx: 176, cy: 64, n: 1 }, { cx: 176, cy: 100, n: 2 }, { cx: 176, cy: 138, n: 3 }],
      labels: [{ x: 90, y: 250, text: "abajo" }, { x: 300, y: 210, text: "derecha", anchor: "start" }, { x: 240, y: 26, text: "arriba" }, { x: 240, y: 288, text: "pie", italic: true }],
      formulas: [{ x: 240, y: 170, text: "r = v + 1", size: 28 }],
      bars: [{ x: 190, y: 248, w: 150, h: 40, items: [{ label: "a", value: 3, tone: "blue" }, { label: "b", value: 5, tone: "green" }, { label: "c", value: 2, tone: "amber" }] }],
      sheets: [{ x: 196, y: 12, w: 60, h: 20, title: "ficha", lines: 1 }],
    },
  },
];

// Audio the timeline can read: `SECONDS` of silence and word boundaries spread
// over it, so the anchors land on instants a render can meet.
export function densePart() {
  const dir = mkdtempSync(join(tmpdir(), "video-dense-"));
  const audio = join(dir, "audio");
  mkdirSync(audio);
  const sections = [{ kicker: "Sección 1", heading: "Densa", beats: [] }];
  for (let i = 0; i < 2; i++) {
    const tag = `s01b${String(i).padStart(2, "0")}`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(SECONDS), "-q:a", "9", join(audio, `${tag}.mp3`)]);
    writeFileSync(join(audio, `${tag}.json`), JSON.stringify(WORDS.map((w, k) => ({ t: k * 0.22, d: 0.2, w }))));
    sections[0].beats.push({ title: `Beat ${i}`, narration: WORDS.join(" "), visual: { scenes: SCENES, anchors: ANCHORS } });
  }
  writeFileSync(join(dir, "note.md"), "");
  const spec = join(dir, "part.json");
  writeFileSync(spec, JSON.stringify({ part: "Parte T", title: "Densa", topic: "t", sections }));
  return { dir, audio, note: join(dir, "note.md"), spec, work: join(dir, "work") };
}
