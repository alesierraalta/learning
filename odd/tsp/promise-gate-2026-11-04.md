# Test strategy pass — the promise gate

Surface: `tools/video/lib/promises.mjs`, `tools/video/audit.mjs`, the renderer it
must agree with (`tools/video/src/page/stage.js`, `integrations/pi/kit/scene.js`).
Pinned in `tools/video/test/promises-gaps.test.mjs` (4 tests, all red today).

## The contract under attack

The file's own words: *a primitive the stage gains but this file does not know is
surfaced instead of being treated as "nothing drawn", so the gate cannot silently
pass a promise it is unable to verify*, and *every promise the narration makes*.

So the risk is not a wrong message: it is **a promise nobody verifies**. Four
narration/visual pairs pass the gate today and say what their frames do not draw.

## Defects

### D1 — a spoken term in the plural makes no promise (`tools/video/lib/promises.mjs:58`)

`pattern: /\btabla\b/gi` is the only entry without the plural. `flechas?`,
`barras?`, `casillas?`, `celdas?`, `numeros?`, `formulas?`, `ecuacion(es)?` all
carry it.

```
promisesOf("mira las tablas de arriba")  =>  []
promisesOf("mira la tabla de arriba")    =>  ["table"]
```

A beat that says "mira las tablas" over a scene with no grid is approved in
silence. The gate exists for exactly this sentence.

### D2 — a decomposed accent makes no promise (`tools/video/lib/promises.mjs:24,58-76`)

`norm()` already normalizes to NFD and strips `[\u0300-\u036f]`, but it is used
only to de-duplicate violations at `:130`; the patterns match the raw string, so
a term carrying its accent as a separate code point is invisible.

```
promisesOf("mira los n\u00fameros")   =>  ["numeral"]      # composed
promisesOf("mira los nu\u0301meros")  =>  []               # decomposed
promisesOf("mira la f\u00f3rmula")    =>  ["equation"]
promisesOf("mira la fo\u0301rmula")   =>  []
```

Any editor, keyboard, or language model that emits NFD turns the gate off for
that word. Accent-insensitivity was already the intent; matching never got it.

### D3 — "una flecha por casilla" is satisfied by three arrows over six cells (`tools/video/lib/promises.mjs:48,142`)

`requires` prints *an arrow for each of its cells* to whoever reads the violation,
and `holds` accepts `policyArrows >= 3` whatever the cell count. Six boxes with
three policy arrows are approved:

```
audit({boxes: 6, policy: 3}, "una flecha por casilla")  =>  []
```

The field is half empty and the narration says every cell has its arrow — the
viewer's original complaint, now certified by the gate.

### D4 — a number in the prose answers a drawn number (`tools/video/lib/promises.mjs:60`)

`hasDigit` scans `texts`, which includes the note pane (`text`), so prose answers
a promise about the drawing:

```
audit({scene: {}, text: "en el paso 2 veras que"}, "fijate en los numeros")  =>  []
```

## Probed and holding

- Unknown primitives are surfaced, in both directions: `KNOWN_SCENE_KEYS` covers
  all 17 keys `stage.js` paints (`boxes, arrows, policy, grids, sheet, labels,
  nodes, badges, gears, curves, paths, panel, bars, formula, dashed, boxes`,
  `sheet`), and a scene key the list lacks (`sparkline`) is reported as
  `a drawing key this gate cannot read`.
- `curve` and `path` really do paint an arrowhead by default
  (`integrations/pi/kit/scene.js:95-104`, `arrow = true` → `marker-end`), so
  counting them as arrows is honest.
- Per-frame claims are evaluated on every frame of a deck, not on the first.
- Equivalent objects with a different key order do not count twice (`collect`
  de-duplicates through `JSON.stringify`).

## Not probed

- The note renderer's `policy` loop versus the stage's `direction()`: both split
  on `[-_\s]+` and agree on the eight compass names, but a shared function would
  be the honest fix and needs a product decision, not a test.
- KaTeX/visual fidelity of `formula`; the promise only asks that a formula is
  drawn.

## Priority

D1 and D2 are silent-pass defects with one-line fixes and no product judgment:
normalize the narration with `norm()` before matching, and give `tabla` its
plural. D3 and D4 change what the gate certifies and need a decision: tighten
`holds` to `policyArrows >= cells` (and rewrite `requires`), and restrict
`hasDigit` to drawn labels.
