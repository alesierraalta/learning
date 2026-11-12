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
| Timing report | `lib/timings.mjs`, `timings.json` | Wall clock per stage, written beside the output so two renders are compared, not remembered. |
| Migration | `migrate.mjs` | Turns a `render_part.py` spec into a first engine draft: narrations kept word for word, bullets drawn. |

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

`--craft` runs the craft gate before any frame is captured, so a part that is
not readable produces no file. `--stills 12.5,90` writes PNG stills instead of a
video (fast visual checks).`--from 100 --to 120` renders a slice. `--workers N`
sets how many pages capture at once (default: half the cores, at most 4;
`--workers 1` is the sequential loop). `--remote synchub:<dir>` fetches missing
narration; on the VPS the audio cache is already local and no `--remote` is
needed. Requires `ffmpeg`, `ffprobe` and Playwright (local or global; the
renderer resolves both).

Rendering does not re-synthesise anything: if a beat's `.mp3` exists, only the
picture changes. A full part is ~27 fps of Chromium work in one page and ~47 fps
over four pages, measured on 240 frames of a six-beat part; Part 3 (6:17,
11 300 frames) is ~8 minutes in one page and ~5 over four by that arithmetic.

## Capture

`frame(t)` is pure, so a frame can be drawn on any page at any instant. Capture
uses that: it boots `--workers` pages in **one** browser, hands each page the
next frame index, and feeds ffmpeg the frames strictly in order. A captured
frame waits until every frame before it has gone through stdin, so frame `i` is
still the picture at `t_i` and the film is byte for byte the one `--workers 1`
writes — that equality is a test, not an intention.

A frame is taken through the page's own CDP session (`Page.captureScreenshot`
with `optimizeForSpeed`), not through `page.screenshot`. ffmpeg reads pixels, so
the PNG is compressed for speed instead of size: same picture, a bigger file
(86 KiB against 55 KiB for a 1080p figure). The pixels are the contract — the
capture test compares the decoded frame against the screenshot it replaced, at
two instants, and fails if one of them moves. On 240 frames of a six-beat part
that is 52.4 → 37.4 ms a frame in one page (19 → 27 fps) and 33.4 → 21.2 ms over
four pages (30 → 47 fps).

The first capture of a page waits for one painted frame. Without that wait the
surface can still hold the picture from before the drawing, and the film opens on
a frame nobody drew — the rest of the film is then encoded against a picture that
never existed.

Stills keep `page.screenshot`: a still is a deliverable, not a frame in a pipe,
and a still on disk stays the same file it was. The craft gate measures a clipped
figure with its own screenshot and never touches the capture path.

The reordering is bounded: a page may only run a couple of frames ahead of the
head being written, so what waits in memory is a handful of PNGs. The pipe is the
backpressure for everything else — no run ever holds a whole part.

When ffmpeg dies (a flag it refuses, a full disk), the pipe is declared broken
and the render fails with ffmpeg's own message instead of waiting for a `drain`
that a dead pipe never emits. A page that fails mid-capture stops the encoder
too: a film with a hole in it is not a deliverable.

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
from that recording. edge-tts tokenises for its own convenience (it merges
`+1 entero` into one boundary and splits `−0,04` into four), so
`lib/audio.mjs:alignWords` realigns them to the narration's words; audio
recorded for other words still fails, which is what catches a stale cache. A
beat's visual is one of three things:

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

## The craft gate

Readable is part of the contract, not a matter of taste. `legibility.mjs` loads
the same stage the renderer uses, seeks every state the beat draws and asks the
browser what it actually painted: the computed size of each text in screen
pixels, its colour, and the paint behind it. It reads the plan, not the
narration and not the pixels.

```bash
node tools/video/legibility.mjs --plan tools/video/.cache/parte3/plan.json
# summary: 0 errors · 4 warnings · 95 waived      (exit 1 if an error)
```

Five rules, and one of them is a hard stop:

- `contrast_aa_failure` — **error**. A colour under 3:1 (24 px and up) or 4.5:1
  below that cannot be read on a phone. Our muted chrome sat at 4.27:1 until
  `--muted` went from `.62` to `.66` (4.82:1).
- `text_below_floor` — warning. The floor is 2.6% of the short side (28 px in
  1080p), the size at which a line survives a phone. Chrome the viewer does not
  read carries `data-texture` and is reported as waived instead of silently
  dropped.
- `dead_stretch` — warning. More than 3 s with the figure unchanged **and the
  voice silent**. A figure that holds while the narration explains is not a
  hole: the film is moving. The gate reports the silent span it measured, so the
  number is the hole and not the hold. A stillness that was chosen carries
  `"hold": true` in the spec and is waived; anything else is a question for the
  author, not a bug in the engine.
- `film_silent` — a film over 15 s with no narration at all.
- `first_frame_empty` — warning. The poster is the frame before play, and it is
  measured on the drawing: no primitive and no label inside the figure. A title
  alone does not save it, because the header says what the film is, not what it
  shows.

A part sets `"hold": true` on a beat whose picture is meant to sit still. The
poster is measured on the first sample, the progress bar is excluded (chrome that
moves every frame would hide a still figure), and findings about the same
`where` × `text` are counted once instead of once per sample.

## The timing report

Every render that finishes writes `timings.json` beside the artifacts it wrote
(`plan.json`, `final.srt`, the video). "Faster now" is then a diff of two files
instead of a memory of one run. Each stage is timed while the pipeline runs it,
and it is reported in the order it ran:

```json
{
 "part": "Parte 3",
 "spec": "tools/video/parts/parte3.json",
 "fps": 20,
 "resolution": "1920x1080",
 "encoder": { "codec": "libx264", "preset": "medium", "crf": 20 },
 "window": { "from": 0, "to": 377.2 },
 "started_at": "2026-11-12T13:50:41.681Z",
 "total_ms": 1696.43,
 "stages": [
  { "stage": "promises", "ms": 1.17 },
  { "stage": "audio", "ms": 198.224 },
  { "stage": "legibility", "ms": 858.373 },
  { "stage": "capture", "ms": 609.272, "frames": 12, "fps": 19.7, "workers": 4 },
  { "stage": "encode", "ms": 1077.219, "overlaps": "capture" }
 ]
}
```

- `promises` — the promise audit over the whole part.
- `audio` — the narration cache plus one `ffprobe` per beat.
- `legibility` — only with `--craft`: the gate's own run, before any frame.
- `stills` — every `--stills` render, with the frames it wrote.
- `capture` — the frame loop, with the frames it wrote, the effective rate over
  the whole window and how many pages captured them. The console's rate is a
  running estimate; this one is the number the stage actually reached.
  `workers: 1` is the sequential loop, so two reports that differ only there are
  a measurement of the capture, not of the film.- `encode` — ffmpeg's own lifetime. It starts at spawn, while frames are still
  being written to its stdin, so it **covers `capture`**: the stages do not add
  up to `total_ms`, and `overlaps` names the stage it swallows.
- `total_ms` — the whole process, from the renderer being imported to the last
  file written.

`window` is present only when a video was encoded: a stills run draws instants,
not a span.

A run that does not finish writes no report: numbers that describe a render that
never happened are a claim nobody can check. The report only observes — it wraps
the pipeline, never reorders it — so the frames, the gate verdicts and the
encoder flags are the same with it as without it.

## Delivery

The video keeps the page's contract: `final.mp4` + `final.srt` named
`Parte N - <slug>.mp4|.srt` under the topic's `explicaciones/adjuntos/`. Copy
both, then verify with `ffprobe` and a couple of extracted frames — the page
player links by name, so the name must not change.

## Coming from the old pipeline

The `parts/*.json` on the vault were written for `render_part.py`, where a beat
named a scene *type* (`formula`, `flow`, `chain`) and a list of bullets. This
engine draws instead of naming, so there is no honest translation between them —
but there is a starting point:

```sh
node tools/video/migrate.mjs --spec parts/parte1.json --out /tmp/parte1.draft.json
```

The draft keeps every narration word for word, because the audio is bound to it,
and draws each beat's bullets as one state, so the draft validates and renders
as it is. It invents no anchors: a draft changes its drawing once per beat, never
on a spoken word. What no tool can do is say what the drawing should be — that is
authoring — and each beat keeps `migratedFrom` with the old scene type and bullet
count so the rewrite knows where it started. A spec that already has `visual` on
some beats is refused instead of half merged.
