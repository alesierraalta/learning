# Test strategy pass — the craft gate

Surface: `tools/video/lib/legibility.mjs`, `tools/video/lib/browser.mjs`,
`tools/video/legibility.mjs`, the `--craft` wiring in `tools/video/render.mjs`.
Pinned in the repository's own suite — 1 test in
`tools/video/test/legibility.test.mjs`, 4 in `tools/video/test/cli.test.mjs`,
all red at the time of the pass (suite: 60 pass, 5 fail; the other 60 untouched and
green), and green after the fixes recorded at the end.

## The contract under attack

The gate's own words: *the part of a frame a viewer can read, measured instead of
argued about*, `--plan`/`--spec` inputs, `Exit 1 when an error is found, 0
otherwise`, and the renderer's `--craft` promise that *a part nobody can read
never becomes a file*.

So the risk is not a wrong message: it is **a gate that measures nothing and
reports green**, or one that the input can kill. Five defects, in that family.

## Defects

### D1 — a percentage alpha is read as a fraction of 255 (`tools/video/lib/legibility.mjs:36`)

`parts.map((p) => p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p))`
applies the percentage scale to every slot, alpha included, so `rgba(0, 0, 0,
50%)` — valid CSS Color 4 — yields `a = 127.5`. `composite` then interpolates
with `1 - 127.5`, the channels go negative, `channel()` clamps them to 0, and the
ratio comes out 21:1 for a colour that is 3.95:1.

Evidence: `parseColor("rgba(0, 0, 0, 50%)").a` → `127.5`;
`contrastRatio("rgba(0, 0, 0, 50%)", "#ffffff")` → `21` (correct: `3.95`).

Why it matters: a half-transparent label is the exact "ghost of a later state"
the gate exists to catch, and in this form it passes as a perfectly readable
line. The same path serves `rgb(0 0 0 / 50%)`.

Pinned: `legibility.test.mjs :: an alpha given in percent is a fraction of one, not of 255`.

### D2 — one malformed request kills the asset server and the whole render (`tools/video/lib/browser.mjs:25`)

`resolve(root, "." + decodeURIComponent(new URL(req.url, "http://x").pathname))`
runs inside an `async` handler whose rejection nobody handles, so a request with
a broken percent-escape (`GET /%zz`) throws `URIError: URI malformed` out of the
`Server` event and Node exits 1 — mid-render, with the ffmpeg child and the
browser still alive.

Evidence: `serve(tmp)` then `fetch(url + "/%zz")` → process exit `1`,
`URIError: URI malformed`, no further responses; a clean `%2e%2e/` traversal is
correctly refused with 403, so containment itself holds.

Pinned: `cli.test.mjs :: a request with a broken escape is a client error, not a dead render`.

### D3 — `--work` is accepted and does nothing (`tools/video/legibility.mjs:24`)

`KNOWN_ARGS` carries `work`, and nothing in the file ever reads `args.work`; the
usage line does not list it either. The renderer's flag was copied in and left
behind, so a caller who passes it gets a silent no-op instead of a refusal.

Evidence: `--plan <plan> --work /tmp/nonexistent-work` → exit `0`, normal report;
`rg "args.work"` finds no reader.

Pinned: `cli.test.mjs :: a flag the gate does not implement is refused, not ignored`
(the run also fixes the precedence: an unknown flag must be a usage error even
when the plan path is bad).

### D4 — a beat filter that names no beat reports green (`tools/video/legibility.mjs:36`)

`--beats` builds a `Set` and filters, with no check that anything survived. A
typo selects zero beats, `measureText` measures nothing, `measureStills` gets
`Math.min()` of an empty list, and the report prints the plan's own beat count
next to an empty result:

```
Parte 3 · 22 beats · 6:16 · floor 28 px · AA 4.5:1
summary: 0 errors · 0 warnings · 0 waived          (exit 0)
```

The header says 22 beats while zero were measured: a CI gate reads that as
"clean". This is the same class as the engine's earlier "an unknown flag reports
success" defect, one level up.

Pinned: `cli.test.mjs :: a beat filter that names no beat is refused instead of reporting green`.

### D5 — a stage that is not there surfaces as a TypeError (`tools/video/lib/browser.mjs:68`)

`page.goto` ignores the response status and the next call assumes the page booted
our stage, so a wrong `root` — the realistic case is running the tool from the
wrong directory — fails as:

```
Error: page.evaluate: TypeError: window.__boot is not a function
```

It names neither the page nor the 404. The repository already treats this class
as a defect (L11: *an out-of-range deck step surfaces as a TypeError*).

Pinned: `cli.test.mjs :: a stage that is not where it should be says so instead of throwing a TypeError`.

## Ruled out, with the reason

| Promise | Class | Why it is not a defect |
|---|---|---|
| `typeFloor` is 2.6% of the short side (`lib/legibility.mjs:18`) | boundary / rounding | `Math.round` can land under the ratio by up to half a pixel (height 400 → 10 px = 2.5%). The contract in `legibility.test.mjs` already pins the rounded convention for 1080/2160/1920; `ceil` would contradict it. A convention, not a lying name. |
| `deadStretches` reports a still (`lib/legibility.mjs:149`) | exact boundary | The code fires at `>= 3.000 s` and `README` says "more than 3 s". A wording fix, not a code defect; the sampled grid (1 s) makes the difference one sample. |
| `assessText` with `px: NaN` returns no findings (`lib/legibility.mjs:89`) | malformed measurement | The only producer is `parseFloat(getComputedStyle(el).fontSize)` on a laid-out element, which is always finite; a NaN cannot reach it from the browser. |
| `assessText` throws on a colour object (`lib/legibility.mjs:99`) | input shape | `contrastRatio`/`composite` accept objects, `assessText` requires CSS text. Every internal caller passes a computed style string, and a colour the gate cannot read is a loud failure by design. |
| `color()`/`oklch()` computed colours throw mid-run (`lib/legibility.mjs:39`) | unexpected input | Intended: "a colour the gate cannot read fails in the open". The stage palette is hex/rgba; a spec that invents a wide-gamut colour gets a named error, not a silent pass. |
| resources must not grow | repetition / leak | One process per run, one page, one plan; the CLI exits and the stage closes in `finally`. A repetition probe would measure Node's own startup, not the gate. |
| 22 beats × 6 instants × ~30 texts | large magnitude | The measured part is the largest one that exists (376 s, ~4000 assessments in ~21 s); no growth is observable at 2× without a synthetic part twice the size. |

## Left unprobed, and why

- **Concurrency**: the gate is single-process and sequential; there is no shared
  state to race.
- **Load**: the promise "same verdict at 10× concurrency" has no meaning for a
  CLI that runs one part at a time.
- **Time zones / DST**: instants are seconds from `t = 0`; no calendar enters.
- **Composition**: layout senses were probed in the earlier pass (a dashed box
  overlapping captions with `layout: 0`); the craft gate does not claim that
  promise, so it is not re-checked here.

## Note on the reproduction

Not local-only: all five witnesses live in the suite (`tools/video/test/*.test.mjs`),
one test per defect, each asserting the contract rather than today's output.
Source was not changed by this pass.

## After the fixes

The five defects were fixed the same day; nothing else in the source moved.

| # | Fix | File |
|---|---|---|
| D1 | a percentage scales the colour channels to 255 and the alpha to one; an alpha outside 0..1 is clamped as CSS clamps it | `tools/video/lib/legibility.mjs:36` |
| D2 | the request handler decodes inside a `try` and answers 400, so a broken escape is a client error | `tools/video/lib/browser.mjs:25` |
| D3 | `work` left `KNOWN_ARGS`; the flag is now a usage error | `tools/video/legibility.mjs:24` |
| D4 | a `--beats` name no beat carries is a usage error naming it | `tools/video/legibility.mjs:36` |
| D5 | `page.goto`'s status is checked and `window.__boot` is verified, so a missing stage names the page and the root | `tools/video/lib/browser.mjs:68` |

Suite after the fixes: **65 pass, 0 fail**. One witness was corrected during the
fix: the expected ratio for half a black over white is 3.98:1 (a 127.5 grey), not
3.95:1 (#808080); the test now asserts the relation between the two spellings of
the same colour instead of a hand-computed constant.

Real run after the fixes, unchanged verdict on the delivered part:
`summary: 0 errors · 43 warnings · 95 waived` (exit 0), and one beat
(`--beats s01b00`) reports the same 4 waived items.
