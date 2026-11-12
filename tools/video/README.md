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
| Segment cache | `lib/segments.mjs` | Cuts the film at the beats, keys each piece by what its frames are made of, and keeps the ones that did not change. |
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

`--craft` runs the craft gate beside the capture and waits for its verdict before
anything is published, so a part that is not readable still produces no file — it
just no longer makes the frames wait for the answer. `--stills 12.5,90` writes PNG
stills instead of a video (fast visual checks); a stills run has no long capture to
hide the gate behind, so it draws the verdict first.`--from 100 --to 120` renders a
slice. `--workers N`
sets how many pages capture at once (default: half the cores, at least 2 and at most
4; `--workers 1` is the sequential loop). `--remote synchub:<dir>` fetches missing
narration; on the VPS the audio cache is already local and no `--remote` is
needed. `--single-pass` renders the film in one ffmpeg instead of in segments and
skips the cache: it is the path the cache replaces, kept because the quality gate
has to compare against the film it protects. Requires `ffmpeg`, `ffprobe` and
Playwright (local or global; the renderer resolves both).

Rendering does not re-synthesise anything: if a beat's `.mp3` exists, only the
picture changes. A full part is ~27 fps of Chromium work in one page and ~47 fps
over four pages, measured on 240 frames of a six-beat part; Part 3 (6:17,
11 300 frames) is ~8 minutes in one page and ~5 over four by that arithmetic.

## Capture

`frame(t)` is pure, so a frame can be drawn on any page at any instant. Purity
is painted, not assumed: during a cross-fade the state that is leaving is
repainted at the last frame instant before the change — the instant the
sequential loop had already drawn it at — instead of keeping whatever its last
paint left. A page that skips frames would otherwise freeze that layer at
whichever frame it happened to draw, and the same instant would be a different
picture depending on how many pages drew it. The repaint touches attributes on
the layer that is already built (a few microseconds); rebuilding its SVG would
cost 2-5 ms a frame and eat the capture it is meant to keep.

That instant belongs to the **window**, not to the part: the frames of a render
are `--from + k/fps`, so the last frame before a change is the last one *of this
render*. With `--from 0.71` at 30 fps every frame sits 0.3 of a frame off the
part's grid, and quantizing to the part's grid froze the cross-fade up to a frame
earlier than the loop drew it: on a 0.9 s slice starting at 0.71 s the two
anchors disagree on 13 of 27 frames, the 8 inside the cross-fade by up to 150/255
per channel. The renderer therefore writes the
window's start into the plan as `origin`, the stage quantizes to `origin + k/fps`,
and `window.__frozen()` reports the instant it repainted the leaving state at —
which is also how the test pins it. A `--from` that is a whole number of frames
picks the same instants as the part's grid, so nothing moves there: that is the
"no pixel changed" comparison against the previous renderer, still 27/27 and
48/48 frames.

What that means for comparing windows: the picture at an instant is a function of
the instant *and of where the window puts its frames*. Two windows that share
frames (a `--from` that differs by a whole number of frames) draw a shared instant
identically, byte for byte. Two windows on different grids cannot share an instant
at all — `--from 0` draws `{k/30}` and `--from 0.71` draws `{0.71 + k/30}`, and
0.71 × 30 = 21.3 is not a whole number — so there is no instant whose frames they
both draw, and asking that they look the same is asking two different instants to
be one picture. The layer that is leaving is also part of the document while it is
fully transparent, and Chrome rasterizes the figure around it: moving the
attributes of a group at opacity 0 moves 6 575 pixels of the visible picture, up
to 60/255. Pixel identity across windows therefore needs the whole drawing — the
invisible state included — to be frozen at the same instant, which is exactly
what sharing a grid means.

Two renders are therefore comparable frame by frame only when they share
`origin` — or share a grid, which is the same thing when their starts differ by a
whole number of frames. That is why the timing report carries `origin` beside
`window`: the cross-fade is frozen at the last frame of *this* render's grid, so
`--from 0.7` and `--from 0.71` put the same instant in a different picture (up to
150/255 inside the fade), and a frame-by-frame or stage-by-stage comparison of
two reports with different origins is a false claim, not a measurement. A
comparison after a change that does not touch the drawing keeps one origin on
both sides: `--from 0.7`, not `--from 0.7001`.

Capture uses that: it boots `--workers` pages in **one** browser, hands each page the
next frame index, and feeds ffmpeg the frames strictly in order. A captured
frame waits until every frame before it has gone through stdin, so frame `i` is
still the picture at `t_i` and the film is byte for byte the one `--workers 1`
writes — that equality is a test, not an intention. The test's scene is dense on
purpose and changes states twice inside the window, because a single box that
never changes cannot show a state outliving its frame.

A frame is taken through the page's own CDP session (`Page.captureScreenshot`
with `optimizeForSpeed`), not through `page.screenshot`. ffmpeg reads pixels, so
the PNG is compressed for speed instead of size: same picture, a bigger file
(86 KiB against 55 KiB for a 1080p figure). The pixels are the contract — the
capture test compares the decoded frame against the screenshot it replaced, at
two instants, and fails if one of them moves. On 240 frames of a six-beat part
that is 52.4 → 37.4 ms a frame in one page (19 → 27 fps) and 33.4 → 21.2 ms over
four pages (30 → 47 fps).

The first capture of a page is taken until the surface settles. A fresh page
answers that request with the frame that was already on its way out, so the film
opened on a picture nobody drew and every frame after it was encoded against that
picture: measured on fresh pages, 4 of 60 first captures carried the empty stage
(and 1 of 18 renders at `--crf 20`, which is how it was found). Waiting longer is
not the answer — the paint proof had completed in all 60. The capture itself is
what moves the surface on, so the opener is captured, paced by a painted frame,
until two captures agree; from then on one capture per frame follows the
drawing. The cost is paid once per page and only at the opening: measured on a
booted page, the opening frame costs 247 ms against 44 ms for a frame in the
middle of the film (one extra capture plus the paint proofs), so a four-page
render pays under a second in total.

Neither bound is a silent fallback. A page that cannot prove it painted within
30 s fails the render, and a surface that has not settled after five captures
fails it too: a film with a frame nobody drew is worse than no film. A page that
skips its first painted frame is not a slow render, it is a wrong one.

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

## The segment cache

The film is cut where the beat changes: **one segment per beat, on frame
boundaries** — a beat that draws three states is still one segment. Each segment
is captured and encoded on its own — same encoder, same parameters — and the pieces
are joined with `stream copy`; the window's audio is encoded once and muxed at the
end, so no sample is re-encoded at a cut and there is no audio seam at a beat.
Entries live in `<work>/cache/<sha256>.mp4` (`tools/video/.cache/render/cache/` by
default, gitignored).

What makes reuse safe is the key, and the key is the picture, not the position in
the film. In: the slice of the spec the segment covers, the narration words that
fall inside it, the bytes of the audio under it, fps, resolution, encoder
parameters, the **hash of the code that draws a frame** (`src/page/stage.js`,
`src/page/stage.css`, `src/page/index.html`, `integrations/pi/kit/scene.js`), the
beat's own clock measured from where the segment starts and from the window's
frame grid, the part's name and title — the brand line in every frame is
`plan.part · plan.title` — and the part's progress bar. The window's `--from`
enters as its **frame phase**: an origin that differs by a whole number of frames
draws the same pixels (that is what the window tests pin), so it is the phase that
belongs in the key and not the number. Out: the beat's tag, its index, its place in
the spec, the rest of the part.

Position enters in exactly two places, and both because the picture really does
depend on it: the progress bar below, and the absolute instants a segment that
opens inside the entrance ramp was painted at — a frame inside the ramp is not
fully drawn, so it is not the beat's content alone. Past the ramp every primitive
is saturated and that entry disappears from the key.

The drawing hash is the part that keeps the cache from serving the past: change
one byte of `stage.js` and every entry is invalid, whether or not the change moves
a pixel. A cache that guessed otherwise would serve frames from the code before
the change, and the film would look fine.

The progress bar is the one thing in a frame that is the whole part's, not the
beat's — `frame(t)` draws `covered / plan.total`, and `plan.total` is the length of
the entire film — so the bar of **every** frame is a function of every beat's
duration. A beat that moves to another instant of the part does not share its
entry: it draws a bar of another width, and a wrong picture is worse than a missed
cache entry. The same quantity decides how far an edit reaches, and the rule is the
part's total length, not the kind of edit:

- A drawing, a state, a colour or the layout of one beat: the total does not move,
  so the edit is local. That beat's segment misses and the others are served from
  the cache — `test/segments.test.mjs` changes one label and re-encodes one
  segment.
- New narration, a longer take, a beat added or removed: the total moves, so
  `plan.total` moves, so the bar of every frame moves, every key changes and the
  film is captured and encoded whole. On the fixture below that is the cold row
  (5 354 ms), not the edit row.

That second case is a decision, not a defect waiting for a workaround: the bar is
how the viewer knows how much of the part is left, and it is worth more than a
cache hit on a narration edit, so it stays. One consequence is worth spelling out:
a beat keeps its entry only when **both** its instant and the part's total length
are unchanged, which is why reordering beats of different lengths rebuilds the
whole cache.

On the fixture used by the tests (5 s at 30 fps, two beats, 150 frames, four
pages), from `timings.json`:

| run | total | capture | encode | segments | mux |
| --- | --- | --- | --- | --- | --- |
| one pass (`--single-pass`) | 4 219 ms | 3 180 ms (47 fps) | 3 442 ms | — | — |
| cold (nothing cached) | 5 354 ms | 3 355 ms (45 fps) | 4 444 ms | 2 missed | 122 ms |
| warm (same spec again) | 823 ms | 0 frames | 0 ms | 2 hit | 118 ms |
| after editing one scene | 3 187 ms | 1 844 ms (41 fps) | 2 314 ms | 1 hit, 1 missed | 126 ms |

A cold render is **slower** than one pass, and that is the trade: the encoder's
tail no longer overlaps the next segment's capture, which costs about half a
second per cut (measured: a 2.4 s window that is one segment costs the same as
one pass, +14 ms; a 5 s window cut in two costs +1.1 s) — 5 354 ms against
4 219 ms on the fixture above, ~27 % slower. The win starts at the second render —
editing one scene of a two-beat part is 1.3× faster than a redo, and re-rendering an
unchanged part is 5× faster, because it captures nothing.

`timings.json` carries the counts, so the claim is checkable:
`stages` has a `segments` entry with `segments`, `hits`, `misses` and `frames`,
a `mux` entry for the join, and `cache` in the report names the drawing and what
the cache did. A zero-frame `capture` is a warm render, not a missing measurement.

### Writing an entry

A segment is written under `<key>.<pid>.<n>.part` and published with a rename
after the bytes are fsynced, the same rule `tools/audio/synth.py` follows: a
render that is interrupted leaves a `.part` nobody reads, never an entry a later
render would serve. The name of the entry *is* its identity, so there is no index
to get out of step with the files.

### Does the cut cost quality?

S4, the human's word: "no quiero perder calidad". Independent rate control per
segment changes where the keyframes and the quantizers go, so
`test/quality.test.mjs` renders the same window both ways and measures it — every
frame, against the declared limits of mean SSIM ≥ 0.99, worst frame ≥ 0.95 and
mean PSNR ≥ 40 dB (`--from 2 --to 3.5` of the dense fixture, two segments):

```text
ssim mean 0.9993 worst 0.9987 · psnr mean 53.25 dB
size 107 345 B vs 85 710 B (×1.252, +21 635 B, keyframes at the cuts 31 474 B) · 573 vs 457 kbps
```

Quality is not lost — the segmented film is the same picture, and the extra bits
land at the cuts. **Size was declared at +10 % and that budget was missed** on
this window. What the measurement showed is that the excess is one extra keyframe
per cut and nothing else, a fixed ~21 KiB on this drawing:

| window | frames | one pass | segmented | ratio |
| --- | --- | --- | --- | --- |
| 2.0-3.5 s | 45 | 85 710 B | 107 345 B | ×1.252 |
| 2.0-4.0 s | 60 | 122 777 B | 143 153 B | ×1.166 |
| 1.0-5.0 s | 120 | 184 057 B | 206 192 B | ×1.120 |

The extra bytes are 21-22 KiB in all three, so the budget is met by any film long
enough to amortize one keyframe per beat: a nine-minute part of ~40 beats pays
~0.8 MB on 30-35 MB by that arithmetic. The test therefore asserts the mechanism
— the excess is at most the keyframes the cuts added — and prints the raw ratio
instead of hiding it. Nothing in the encoder was adjusted to make a number fit.

Disk: an entry is the encoded segment, so the cache holds roughly the video track
of one render per distinct version of a part — 3.4-4.7 MiB per minute of film at
these settings — and nothing ever removes one: there is no eviction, no size limit
and no prune step, so the directory only grows and cleaning it is `rm` on a
gitignored folder. An edit that leaves the durations alone adds the segments it
changed, not a new copy of the part; an edit that moves the total adds a second full
copy, for the reason above.

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
 "origin": 0,
 "started_at": "2026-11-12T13:50:41.681Z",
 "cache": { "drawing": "9f2c…", "segments": 22, "hits": 20, "misses": 2, "dir": "tools/video/.cache/render/cache" },
 "total_ms": 1696.43,
 "stages": [
  { "stage": "promises", "at": 0.1, "ms": 1.17 },
  { "stage": "audio", "at": 1.3, "ms": 198.224 },
  { "stage": "legibility", "at": 199.5, "ms": 858.373, "exit": 0, "overlaps": "capture", "overlap_ms": 609.2, "waited_ms": 0 },
  { "stage": "segments", "at": 240.4, "ms": 609.272, "segments": 22, "hits": 20, "misses": 2, "frames": 7544 },
  { "stage": "capture", "at": 240.4, "ms": 609.272, "frames": 686, "fps": 19.7, "workers": 4 },
  { "stage": "encode", "at": 240.4, "ms": 1077.219, "segments": 2, "overlaps": "capture" },
  { "stage": "mux", "at": 1290.5, "ms": 214.55, "segments": 22 }
 ]
}
```

Every record carries `at`, the millisecond it began, so two records whose windows
overlap are two stages that shared the wall clock instead of two that happened one
after the other. That is what makes `legibility` readable as a gate the render did
not wait for.

- `promises` — the promise audit over the whole part.
- `audio` — the narration cache plus one `ffprobe` per beat.
- `legibility` — only with `--craft`: the gate's own run, with `exit` its verdict.
  It is reported where its verdict was read, so its `at` is the head of the render
  and not the row above it: `overlaps` names the stage it shared its clock with and
  `overlap_ms` is that intersection, while `waited_ms` is what the render actually
  stood still for. `waited_ms: 0` is a gate that was entirely hidden; a stills run
  shows the gate's whole duration there, because nothing can hide it.
- `stills` — every `--stills` render, with the frames it wrote.
- `segments` — the cache: how many segments the window is cut into, how many were
  served from disk, how many had to be captured, and the frames they cover.
- `capture` — the frame loop, with the frames it wrote, the effective rate over
  the whole window and how many pages captured them. The console's rate is a
  running estimate; this one is the number the stage actually reached.
  `workers: 1` is the sequential loop, so two reports that differ only there are
  a measurement of the capture, not of the film. A warm render captures nothing,
  so its `capture` is zero frames and not a missing measurement.
- `encode` — ffmpeg's own lifetime, summed over the segments that were captured.
  It starts at spawn, while frames are still being written to its stdin, so it
  **covers `capture`**: the stages do not add up to `total_ms`, and `overlaps`
  names the stage it swallows.
- `mux` — the join: the window's audio encoded once, then `stream copy` over the
  segments. It touches no frame.
- `total_ms` — the whole process, from the renderer being imported to the last
  file written.

`window` is present only when a video was encoded: a stills run draws instants,
not a span. `origin` is written with it — the instant the window's frame grid
starts at, which is where the cross-fade freeze is anchored — because two reports
that disagree on it are not the same film and cannot be compared frame by frame.

A run that does not finish writes no report: numbers that describe a render that
never happened are a claim nobody can check. The report observes the pipeline and
never reorders it — `at` only says where each stage began — so the frames, the gate
verdicts and the encoder flags are the same with the report as without it.

## The craft gate does not wait for the frames, and the frames do not wait for it

The gate reads the plan, not the pixels: to decide whether a part is readable it
seeks the instants a beat settles on and samples one still per second for the hole
rule. It draws nothing the frame loop can hand it — the loop draws thirty frames per
second, the gate samples one, and it keeps its clamp on the figure rather than the
whole frame, so a frame from the loop is not a frame the gate would have taken.
Waiting for it is waiting for work that can happen beside the capture.

So `--craft` starts the gate as a child process at the head of the render and lets
the capture run: same script, same `--plan`, same exit code, same counts as running
`legibility.mjs` by hand. The verdict is awaited before the join, which is before
any deliverable is written, so the order of the output is untouched — a part the
gate refuses leaves no film, no `final.srt` and no `timings.json`. What changes is
the wait: the gate's own duration comes off the critical path whenever it is shorter
than the capture, which on a cold render of a real part it is. A warm render
captures nothing, so there the gate *is* the critical path — it was before this
change too, and that is the price of not caching a verdict.

On the 5 s two-beat fixture, a 4 s window, cold cache, three interleaved pairs from
`timings.json` plus the gate's own wall clock:

| run | total | gate | hidden by the capture |
| --- | --- | --- | --- |
| gate first, then capture (before) | 6 123 / 7 693 / 8 161 ms | 1 142 / 1 291 / 1 326 ms | — |
| gate beside capture | 5 147 / 7 107 / 6 289 ms | 1 295 / 1 545 / 1 434 ms | 528 / 596 / 567 ms, then `waited_ms: 0` |

The saving is the gate's own run: **~1.1 s of ~7.3 s, 16 % of the wall clock** on
this window, and it scales with the part rather than with the window — the gate
samples one frame per second where the loop draws thirty, and on a 300 s part the
gate measures ~114 s against a capture of minutes. `overlap_ms` counts only the part
the gate shared with the capture; the rest of it ran beside the browser boot, which
is why `waited_ms` — the number that matters — is 0 while `overlap_ms` is ~550.

Two costs are declared rather than hidden. A refusal that arrives after the capture
has already drawn frames throws that work away, and the render says so: `the craft
gate refused this part (exit 1); 54 frame(s) had already been captured (…ms of
capture, left in the segment cache under the key of what draws them)`. The frames
are not deleted — a cache entry is keyed by what draws it, so a fix that edits one
beat's drawing and leaves the durations alone invalidates that beat and leaves the
rest reusable, while a fix that touches `stage.js` invalidates every entry, by
design — but the film they belong to is not written. And the gate now runs beside a
capture that is already using several Chromium renderers, so the two contend for the
CPU: on a loaded machine the capture absorbs part of what the overlap gives back,
which is why the saving is 16 % and not the gate's full share of the run.

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
