# Lesson video engine

Turns a lesson part into a narrated 1080p video where the drawing is the
explanation: hairlines that draw themselves, one labelled element at a time,
every reveal anchored to the word that introduces it.

It replaces the previous pipeline, whose frames were static per bullet and whose
"scene" was a wall of text next to a picture. Nothing in the old renderer could
animate, because it wrote one PNG per reveal step with PIL.

## What it is

| Piece | File | Job |
| --- | --- | --- |
| Timeline | `lib/timeline.mjs` | Pure planning: beat start/end, state times, SRT cues, frame crop. No DOM, no clock. |
| Note reader | `lib/note.mjs` | Reads the part's `<lk-walkthrough>` decks: the video animates the note's own scenes. |
| Audio | `lib/audio.mjs` | Cached TTS mp3 + word boundaries per beat, `ffprobe` for duration. |
| Spec | `lib/spec.mjs` | The part's sections, narration and per-beat `visual`. Validated before rendering. |
| Promise gate | `lib/promises.mjs`, `audit.mjs` | Refuses a beat whose words promise a drawing its frames do not have. |
| Stage | `src/page/stage.js` | Draws frame `t`: a pure function of time, so a render is reproducible. |
| Renderer | `render.mjs` | Headless Chromium → PNG frames → ffmpeg, plus the SRT. |

`frame(t)` is pure: no CSS transitions, no `requestAnimationFrame`, no clock.
That is what makes the output deterministic and lets Playwright ask for any
instant. Every element entering a state draws on over 0.55 s, staggered by
0.07 s in drawing order; the whole previous state fades out over 0.28 s.

## Render a part

```bash
node tools/video/render.mjs \
  --spec tools/video/parts/parte3.json \
  --note tools/video/.cache/parte3/note.md \
  --audio tools/video/.cache/parte3/audio \
  --work tools/video/.cache/parte3 \
  --video tools/video/.cache/parte3/final.mp4
```

`--stills 12.5,90` writes PNG stills instead of a video (fast visual checks).`--from 100 --to 120` renders a slice. `--remote synchub:<dir>` fetches missing
narration; on the VPS the audio cache is already local and no `--remote` is
needed. Requires `ffmpeg`, `ffprobe` and Playwright (local or global; the
renderer resolves both).

Rendering does not re-synthesise anything: if a beat's `.mp3` exists, only the
picture changes. A full part is ~20 fps of Chromium work, so Part 3 (6:17,
11 300 frames) takes ~10 minutes and ~10 MB.

## The spec

```json
{
  "part": "Parte 3",
  "title": "Política, valor y modelo",
  "topic": "fundamentos-aprendizaje-por-refuerzo",
  "sections": [
    {
      "kicker": "Sección 1 · Por qué existe",
      "heading": "Por qué existe",
      "beats": [
        {
          "title": "El robot del almacén",
          "narration": "…the exact words that were recorded…",
          "visual": { "deck": "El almacén del ejemplo" }
        }
      ]
    }
  ]
}
```

`narration` must match the recorded audio word for word — the boundaries come
from that recording. A beat's visual is one of three things:

- `{"deck": "<note deck title>", "steps": [3, 4]}` — animate steps of the
  note's own deck (all steps when `steps` is omitted).
- `{"scenes": [{"scene": {...}, "text": "…"}]}` — composed inline, in the same
  360×290 units the note uses.
- `{"scenes": [...], "anchors": ["por casilla", 0.5]}` — pin each state to a
  spoken phrase (fractional anchors also allowed) instead of even spacing.

The right-hand column shows the current state's `title` and `text`; decks
already carry both per step.

## Scene vocabulary

`lib/../src/page/stage.js#sceneMarkup` accepts, in drawing order: `grids`,
`sheets`, `dashed`, `panels`, `bars`, `boxes`, `nodes`, `gears`, `packets`,
`arrows`, `curves`, `paths`, `lines`, `badges`, `formulas`, `labels`.

`policy` is the field primitive: a list of `{x, y, w, h, dir}` items, one arrow
per cell, drawn small in the cell's bottom-left corner so it never sits on the
cell's label. `dir` takes eight compass names (`up`, `down`, `left`, `right`,
`up-right`, …); `pad`, `len`, `width` and `tone` are optional. Each arrow is its
own primitive, so a field assembles one cell at a time, and it is what answers
"una flecha por casilla": a single movement arrow beside twelve tiles is not
that picture.

Tones: `blue` (decision), `green` (reward paid), `red` (penalty), `amber`
(weighting), `slate`, `ink`, `muted`. A colour means one thing for the whole
part; never use red for decoration.

Rules that keep a frame readable:

- One idea per state, three to five elements entering at a time.
- Label what the voice names, in the same words, and nothing else.
- Keep the example stable across the part (same warehouse, same coordinates).
- Capitals and formulas are set at 26–34 units; annotations at 12–16.

Arrow captions are placed automatically: the engine tries above the row band,
below it, then beside the arrow, and keeps the first position that clears every
box.

## The promise gate

A beat may only say what its own frames draw. `render.mjs` runs the audit before
it plans anything, so a spec that promises an undrawn thing produces no file.
Run it alone, on a part or on the delivered artefact:

```bash
node tools/video/audit.mjs \
  --spec tools/video/parts/parte3.json \
  --note tools/video/.cache/parte3/note.md
# 22 beats, 23 promises, all drawn        (exit 0)
```

A violation names the section, the beat, the phrase the viewer heard and what
was missing:

```text
section 3 · beat "T0 a T3" · says "todas las flechas" · draws nothing that answers it: one frame draws an arrow for each of its cells
```

The lexicon in `lib/promises.mjs` is fixed and small: `flecha`, `una flecha por
casilla` / `todas las flechas`, `casilla`/`celda`/`rejilla`, `tabla`, `número`,
`barra`, `fórmula`/`ecuación`. Each entry reads its fact from the same scene
objects the stage paints, never from pixels, never from the narration, and a
scene key the gate cannot read is surfaced instead of counted as nothing.

Two boundaries are deliberate. A claim about a finished field (`una flecha por
casilla`, `todas las flechas`) is read on the beat's last state, not on every
frame: a field that assembles itself is a picture, not a lie. What it must
satisfy is the arithmetic — `policy` arrows count against `cells - walls -
exits - hazards`. The gate reads those three from the labels the figure already
draws (`×` wall, `+1` exit, `−1` hazard, `R` robot, an arrow glyph the action
chosen there), so a field that names its tiles that way needs no declaration in
the spec; an explicit `walls`/`exits` pair wins when a scene draws no labels. A
label the gate cannot read fails in the open instead of shrinking the count, and
a declared cell that lands on no drawn box fails too.

Subject nouns (`robot`, `puerta`, `charco`, `salida`) are not promises: they
name the world the beat talks about, not the drawing, and a beat may discuss
the robot over a chart without owing a picture of it.

## Delivery

The video keeps the page's contract: `final.mp4` + `final.srt` named
`Parte N - <slug>.mp4|.srt` under the topic's `explicaciones/adjuntos/`. Copy
both, then verify with `ffprobe` and a couple of extracted frames — the page
player links by name, so the name must not change.
