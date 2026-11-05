# TSP — Parte 3 re-authored against the live note

Run date: 2026-11-04. Surface: the code and content this session wrote to re-render
Parte 3 from the published note.

## Under attack

| Promise | Where it is stated |
| --- | --- |
| One boundary per spoken word, aligned to the words the narration actually has | `tools/video/lib/audio.mjs:alignWords` doc comment |
| Audio recorded for other words fails instead of being stretched over it | same function; `README.md` "the boundaries come from that recording" |
| A box much wider than it is tall reads as a bar; two square boxes do not | `tools/video/lib/promises.mjs` wide-box rule |
| An SVG `fill` is the ink, never the paper under the words | `tools/video/legibility.mjs:collectText` |
| No arguments is a usage problem, not a run that pretends to work | `tools/video/render.mjs:checkArgs` (already refused empty argv) |
| Every beat's narration is the note's own step text, verbatim | `odd/tasks/educational-video-engine.md` T9, L19 |

## Defects found and pinned

### D1 — a boundary file with an unusable timing became a NaN instant

`tools/video/lib/audio.mjs:alignWords` validated nothing about the timing it read. Probed:

```
alignWords("uno", [{ t: "x", d: 1, w: "uno" }])   → [{ t: NaN, d: 1, w: "uno" }]
alignWords("uno", [{ t: 0, w: "uno" }])           → [{ t: 0,   d: NaN, w: "uno" }]
alignWords("uno", [{ t: 1, d: -0.5, w: "uno" }])  → [{ t: 1,   d: -0.5, w: "uno" }]
```

A corrupted or half-written `<tag>.json` therefore reached the timeline as `NaN`, which
`JSON.stringify` writes as `null` — a beat whose state appears at no instant, or a word that
ends before it starts. The function already refused text that did not match, so silence here
contradicted its own contract.

Pinned by `tools/video/test/audio.test.mjs :: a boundary file with a timing the engine cannot
trust is refused, not silently timed` (red before the fix: `assert.throws` saw no throw).
Fix: every record must carry a finite `t >= 0` and a finite `d >= 0`, and a boundary payload
that is not a list is refused with the same message.

### D2 — a render that named no output exited 0 with no film

`tools/video/render.mjs:checkArgs` refused an empty argv but accepted a fully specified run
with neither `--video` nor `--stills`. Observed live: the encode step ran 19 s, printed the
gate summary and `30 beats · 60 cues · 5:07`, wrote `plan.json` and `final.srt`, and exited 0
with no `final.mp4`. The README's canonical command always passes `--video`, so the contract
implies a render produces a film; a silent no-op reads as success.

Pinned by `tools/video/test/cli.test.mjs :: a render that names no output says so instead of
exiting as if it had rendered` (red before the fix: exit 0). Fix: `usage("nothing to render:
pass --video <file> or --stills <instants>")`, exit 2, before any frame is captured.

## Verified, not defects

- Narration fidelity: 30 beats, 30 deck steps, 6 decks — `0 not verbatim` against the live note.
- `alignWords` folded text: composed vs decomposed accents and case both align.
- Empty and blank narration align to `[]`; punctuation-only tokens keep their place at `t: 0`.
- 5000 words align in 11 ms and the function holds no state between calls.
- Wide-box rule boundaries: exactly `w = 3h` holds, `w = 2.99h` refuses, `h = 0`, a missing `h`
  and a negative `w` all refuse, numeric strings coerce, and the falsifier (`two square boxes are
  not a bar chart`) still refuses the claim.
- The stale pre-regeneration spec is still refused outright (`deck "La política: una flecha por
  casilla" is not in the note`), so the bar rule did not loosen the gate.
- The craft gate still catches a genuinely unreadable label (`#efefef` at 13 px) after the
  backdrop change — that witness predates this run and stayed green.

## Ruled out, with the reason

| Cell | Why it cannot happen here |
| --- | --- |
| CSS-painted SVG fill as a backdrop | Every stage primitive comes from `kit/scene.js`, which writes `fill` as an attribute; a computed-only fill does not exist in this stage. |
| Concurrency in `alignWords` / the bar rule | Both are pure functions over their arguments, called once per beat from a single process. |
| Resource growth | Neither function holds state, files, or subscribers; the 5000-word probe is the largest input in the pipeline. |

## Left unprobed

A light ink placed deliberately on a tinted `greenS`/`redS` fill: no scene in Parte 3 draws one,
so the backdrop rule for tinted fills has no falsifier yet. Probe it the day a scene does.

## After the run

`node --test tools/video/test/*.test.mjs` → 79 tests, 77 pass, 2 skipped (pre-existing skip of
the VPS-only paths), 0 fail. Both witnesses live in the repository suite; nothing stayed local.

## Second pass — after the film existed

Re-ran the skill on the code as it stands once the re-authored part was encoded, plus the
deliverable's own contract (`final.srt`).

### D3 — the poster rule could never fire

`tools/video/legibility.mjs` `first_frame_empty` decided "the frame shows nothing" with
`#fig [data-prim].length === 0 && #title.textContent.trim().length === 0`. The page always
fills `#title` (31 characters on the probe's own plan), so the second half of the conjunction
is never true: a first frame with an **empty figure** was reported as clean. Probed with a plan
whose single beat draws nothing → `summary: 0 errors · 0 warnings · 3 waived`, no finding.
The README did not list the rule either.

Pinned by `tools/video/test/cli.test.mjs :: the poster rule fires when the first frame draws
nothing` (red: no `first_frame_empty` in the output). Fixed by measuring the drawing instead of
the header — `prims === 0 && (fig.textContent || "").trim().length === 0` — and by documenting
the rule in `tools/video/README.md` "The craft gate". The real part keeps `summary: 0 errors ·
1 warnings · 90 waived` because its first frame draws the grid.

### Verified

- `final.srt` on the re-authored part: 60 cues for 60 plan cues, monotonic, no overlap, at most
  two display lines per cue, first at `00:00:00,251`, last ending at `305.523 s` inside a
  `306.792 s` plan.
- `--sample 0`, `--sample -1` and `--sample abc` are refused with exit 2, so the sampler cannot
  spin on a zero step.
- `--plan` on a hand-made plan that names no note/audio measures text and stills normally, so
  the gate does not quietly depend on the spec pipeline.

### After the second pass

`node --test tools/video/test/*.test.mjs` → 80 tests, 78 pass, 2 skipped (pre-existing), 0 fail.
