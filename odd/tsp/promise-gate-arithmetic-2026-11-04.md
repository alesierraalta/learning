# Test strategy pass — the one-arrow-per-cell arithmetic

Surface: `tools/video/lib/promises.mjs` as merged in `559b85d` (#88), specifically
the arithmetic added today: `labelKind`, the wall/exit/hazard subtraction, the
last-state read, and the declared-versus-labelled split.
Pinned in `tools/video/test/promises-arithmetic.test.mjs`: 3 tests red today, plus
one green witness that the fixture itself is a complete field.

`docs/testing/test-plan.md` covers a different surface (the Go CLI + Pi adapter)
and is modified in the working tree by another session, so this run does not
touch it. The earlier pass on this file is
`odd/tsp/promise-gate-2026-11-04.md`; its D1 and D2 are fixed, D3 was the
arithmetic this run attacks, D4 (the note pane answering a drawn number) is still
open and still skipped in the suite.

## The contract under attack

The lexicon's own words for the claim: *the finished field says which of its
tiles are walls, exits and hazards, and puts one arrow on every remaining cell*.
The arithmetic that enforces it:

```text
fact.policyArrows === fact.cells - fact.walls - fact.exits - fact.hazards   (promises.mjs:70)
```

and the classification that feeds it, `labelKind`, whose comment states the
principle: *a tile that already says what it is says it with its label, so a
field that names its walls, exits and hazards that way needs no declaration in
the spec. An explicit declaration wins: the author's statement is the figure.*

So the promise is symmetric: the same figure must be certified the same way
whether its tiles are labelled or declared. A and B are that symmetry breaking.
C is the same asymmetry one level up: an unknown drawing key is surfaced, an
unknown spoken term is not.

## Defects

### A — a robot tile is dropped from the count but its arrow is not (`tools/video/lib/promises.mjs:256`)

`if (kind === "robot") continue;` skips the tile before it reaches
`sets.cells`, but the arrow drawn inside it is counted by the `scene.policy`
loop at `:262-265` all the same. A field where the robot is drawn in its own
tile — which is how the warehouse reads, the agent occupying a cell — is then
one cell short and one arrow long:

```text
4x3 warehouse, one wall, two exits, robot labelled "R" in a cell, 9 arrows
cells=8  walls=1  exits=2  policyArrows=9      =>  9 !== 8-1-2  =>  1 violation
```

The same figure without the robot label passes. The narration said every
remaining cell has its arrow, and it did.

### B — a declared field cannot name a hazard (`tools/video/lib/promises.mjs:21,252,255`)

`declared` is true only when `scene.walls` **and** `scene.exits` are arrays
(`:252`), and in that mode every box is forced to `"cell"` (`:255`), so
`labelKind` never runs and `sets.hazards` stays empty. `"hazards"` is not even a
known scene key (`:21`), so a spec that tries to declare one is reported as *a
drawing key this gate cannot read*.

The consequence is that the two modes disagree on the same drawing:

```text
boxes [plain, "−1", plain, "×"], 2 arrows
labelled   => cells=4 hazards=1  =>  2 === 4-0-0-1  =>  passes
declared   => cells=4 hazards=0  =>  2 !== 4-1-0-0  =>  fails, plus unknown key
```

`requires` prints *walls, exits and hazards* to whoever reads the violation, so
the gate refuses a figure that its own contract says is complete. A declaration
that can name two of three things cannot replace the labels it is meant to
override.

## Probed and holding

- The last-state read: a field that assembles 1 → 3 → 5 → 9 arrows passes, and a
  finished field missing one cell fails (`promises-gaps.test.mjs:39,51`).
- A declared wall that lands on no drawn box fails instead of shrinking the
  count (`:58`).
- An exit tile (`+1`) or a wall (`×`) carrying its own arrow fails, which is the
  arithmetic doing its job: those tiles have no action to choose.
- A hazard written `−1` (U+2212) and `-1` (hyphen-minus) are read identically;
  `–1` (en dash), `+ 1` (spaced) and `norte` are refused in the open rather than
  silently shrinking the count.
- An action glyph `↑` in a tile counts as that tile's arrow, and drawing both a
  glyph and a policy arrow on one tile double-counts and fails — correct, two
  arrows on one cell is not one arrow per cell.
- Folding keeps the raw words in the quoted phrase: `"😀 la tabla de arriba"`
  reports `phrase: "tabla"` at index 6, so a violation still quotes what the
  viewer heard. Uppercase with accents (`LA FÓRMULA`) matches.

## Not probed

- Whether `cells` should count a `grid` and `boxes` together: a field drawn twice
  over would double-count, but no scene in the repository does that and the
  contract does not describe it. Left unprobed rather than invented.
- `Robot` (capitalised) is refused as unreadable. The contract says a label the
  gate cannot read fails in the open, so this is the promised behaviour, not a
  defect; a case-insensitive read would be a product decision.
- The 1,26 s minimum between drawing changes lives in the timeline check, not in
  the lexicon, and is out of this surface.

### C — a spoken term the lexicon lacks makes no promise at all (`tools/video/lib/promises.mjs:44-96`)

The lexicon is closed, and the asymmetry is the defect: an unknown *drawing* key
is surfaced (*a drawing key this gate cannot read*), while an unknown *spoken*
term is silently ignored. The note's own narration now says it:

```text
promisesOf("una acción por casilla")        =>  ["cell"]      # only "casilla"
promisesOf("cada casilla con su acción")    =>  ["cell"]
field with 3 of 9 arrows, "una flecha por casilla"   =>  1 violation
field with 3 of 9 arrows, "una acción por casilla"   =>  0 violations
```

So the claim a viewer hears is checked for *a drawn cell*, not for an arrow on
every cell. The beat in the published spec that says it (`Política, recompensa,
valor`) is a three-box diagram, so nothing is wrong with that drawing today —
but the phrase was introduced precisely while the drawing was being repaired,
and the gate stopped checking the thing the sentence is about.

## Missed by this run

A third defect in the same engine was found by another session the same day, by
watching the rendered video instead of reading the gate: `tools/video/lib/timeline.mjs`
put the first state of each beat into the cut 0,25 s late, so every transition
showed the figure blank for about 0,2 s (measured with `signalstats` on the
figure region: `YAVG` 227,9 → 235, pure white → 230,8). It was in all 22 beats
and no test caught it, because the suite pins what the spec says, not what the
frame shows at the moment the cut lands.

This run probed the gate's claims and never drove the timeline's cut, so the
class is recorded as unprobed rather than as covered: a promise about *when* a
drawing appears needs a probe on the rendered frames (or on the cut arithmetic),
not on the scene objects.

## Fix

A and B are fixed on `fix/promise-gate-arithmetic`:

- `tools/video/lib/promises.mjs` reads the label whichever way the field states
  its walls, so both paths certify the same figure the same way, and a tile the
  robot occupies is a cell like any other instead of a tile dropped from the
  count while its arrow still counted.
- `"hazards"` joins `KNOWN_SCENE_KEYS` and the declaration loop, so a declared
  field can name all three kinds its own `requires` text promises.

Verification: 44 tests, 42 pass, 0 fail, 2 skipped; `audit` on the live spec and
note still reports `22 beats, 22 promises, all drawn`, so the fix removes two
false rejections without loosening the arithmetic.

C is **not** fixed, and the narrow fix was tried and reverted: adding `acción` to
`ARROW_PER_CELL` turns the published content red, because the beat that says it
defines the policy rather than describing a drawing:

```text
"La política elige una acción por casilla: en la salida, subir."   (three boxes)
audit → section 2 · beat "Política, recompensa, valor" · draws nothing that answers it
```

So the same edit that closes the silent pass also rejects a legitimate sentence.
The term needs the design work named above — surface the spoken terms the lexicon
does not know, with a stop list — not a wider regex. The test stays skipped with
that reason, so the finding is visible in the suite instead of buried here.

## Priority

A and B are one-line fixes with no product judgment and both make the gate refuse
a correct figure, which is the failure mode that erodes trust in a gate: A drops
`robot` from the excluded set (or counts its arrow as the cell's arrow), B reads
`scene.hazards` as a declaration and adds it to `KNOWN_SCENE_KEYS`. Neither
loosens the arithmetic — a half-drawn field still fails.

C is a design decision, not a one-liner: the honest fix is to surface the spoken
terms the lexicon does not know, which needs a stop list (the narration is prose,
and most of its words name nothing on screen). The narrow fix — adding `acción`
to `ARROW_PER_CELL` — closes the phrase in use today without pretending the
asymmetry is gone. Until then, a beat can escape the gate by choosing a synonym.
