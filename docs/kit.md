# Rich part pages

Write a plain HTML page beside its Markdown note, with the same basename and an
`.html` extension. Markdown remains the Obsidian copy and fallback. No build or
framework is required. The bridge serves the page at `/<token>/<topic>/<part>`.

```html
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="../kit/kit.css">
  <script src="../kit/kit.js" defer></script>
</head>
<body><main>
  <p class="definition">One precise formal definition.</p>
  <lk-video></lk-video>
  <lk-audio></lk-audio>
  <div class="kicker">Parte 3 · Topic</div>
  <h1>Title</h1>
  <h2>1. Por qué existe</h2>
  <p>The practical problem.</p>
</main></body>
</html>
```

The kit adds an index from `h2` headings and a reading-progress bar. Components
use light DOM: normal page CSS and accessible native controls still work.

## Components

```html
<lk-callout type="warning" title="Important distinction">Reward ≠ value.</lk-callout>

<lk-steps>
  <lk-step label="T0">Initial state.</lk-step>
  <lk-step label="T1" mark="nuevo">New observation.</lk-step>
  <lk-step label="T2" mark="bloqueo">Blocked transition.</lk-step>
</lk-steps>

<lk-diagram title="Agent and environment">
<script type="application/json">
{"nodes":[{"id":"a","label":"Agent","sub":"policy","x":1,"y":0,"kind":"agent"},
          {"id":"e","label":"Environment","x":1,"y":3,"kind":"env"}],
 "edges":[{"from":"a","to":"e","label":"action","dashed":false}],
 "width":380,"height":340}
</script>
</lk-diagram>

<lk-math display>V(s) = r + \gamma V(s')</lk-math>
<lk-math>\gamma = 0{,}9</lk-math>

<lk-walkthrough>
<script type="application/json">
{"title":"El recorrido de una consulta","viewBox":"0 0 1200 660","steps":[
  {"title":"De dónde salen las filas","text":"FROM elige la tabla.",
   "scene":{"sheets":[{"x":30,"y":80,"w":300,"h":400,"title":"employees","lines":8}],
            "boxes":[{"x":390,"y":90,"w":330,"h":100,"label":"FROM employees","sub":"de dónde salen las filas"}],
            "arrows":[{"x1":336,"y1":140,"x2":384,"y2":140}],
            "labels":[{"x":180,"y":512,"text":"todas las filas, todas las columnas"}]}}]}
</script>
</lk-walkthrough>

<pre class="mermaid">flowchart TD
  A[State] --&gt; B[Action]
</pre>

<lk-widget title="Try the policy">
  <button id="run">Run</button><output id="result"></output>
</lk-widget>
<!-- Add page-authored inline JS to wire the demo's native controls. -->

<lk-quick-quiz point="1. Por qué existe" tag="matematicas">
<script type="application/json">
{"id": "qq-1", "pregunta": "¿Por qué...?", "opciones": {"A":"...", "B":"...", "E":"No sé"}, "correcta": "A", "explicacion": "..."}
</script>
</lk-quick-quiz>

<lk-video></lk-video>
<lk-audio></lk-audio>
<lk-quiz></lk-quiz>
<lk-ask></lk-ask>
```

`lk-math` renders a clean equation and nothing else: it is for a **calculation**. A formula the
part explains is drawn as an **annotated formula scene**, one callout per symbol — see
[Annotated formulas](#annotated-formulas) below.

Diagram positions use an 80-pixel grid; boxes are 190 × 70 pixels. Leave at least
three grid units between centers. `kind` is `box`, `agent`, `env`, `store`, or
`decision`. Dimensions are SVG viewBox pixels; diagrams scale to the column.
Use short labels and inspect the result for overlapping edges and text.

`lk-scene` draws one figure the reader only has to look at, with the same vocabulary as a
deck: two actors and the arrow between them, a chain, a contrast, a reparto, a black box.
Reach for it when the idea has a shape but no sequence; it is not a substitute for the part's
walkthrough. Declare it with a `viewBox` of 760 across and 1 unit ≈ 1 px inside it, because
that is the reading column and the type then lands where it was authored. At the video's
1728-wide canvas a 26-unit label renders at 14 px in the column and the figure reads as a
caption, which is why the older wide diagrams looked wrong. Sizes that work: box label 22,
sub 14 with `subDy` 22, arrow label 15, free annotation 14, arrow `width` 3, boxes
196 × 110 at `y` 64, arrows at `y` 100 and 138. Stagger two parallel arrows with `labelAt`
0.36 and 0.64 so their captions do not stack in one column. `integrations/pi/kit/examples/scene-intro-rl.html`
is the worked example.

Three rules keep a scene honest once it is in a page. Text never drops below 11 px on screen: when
a label cannot fit, the pass stops at that floor, squeezes the glyph spacing and marks the stage
with `data-overflow="1"`, so a compressed figure says so instead of going quiet. An arrow's label is
measured against its own shaft — never the whole canvas — because words sized to the figure rather
than to the arrow end up painted over the source box and the marker head. And the stage measures the
column it occupies rather than the window (a container query), so a scene inside a narrow column
keeps its scale and scrolls sideways instead of shrinking its type.

```html
<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 230","title":"Un paso del bucle",
 "caption":"La acción viaja hacia el entorno; la recompensa y el estado nuevo vuelven.",
 "scene":{"boxes":[{"x":8,"y":64,"w":196,"h":110,"label":"AGENTE","sub":"robot · batería 70 %","tone":"blue","rx":0,"size":22,"subSize":14,"subDy":22}],
          "arrows":[{"x1":208,"y1":100,"x2":552,"y2":100,"label":"acción: aspirar","tone":"blue","labelSize":15,"width":3,"labelAt":0.36}]}}
</script>
</lk-scene>
```

### Figures from the visual engine

A note figure is not hand-drawn SVG: it is a JSON scene the engine in `tools/visuals/`
owns, and `lk-figure` draws it with the same renderer the CLI uses. The note names meaning —
a grid, a cell kind, a tone — never coordinates or a colour, so the figure follows the
paper it lands on: light, dark, or the reader's system.

```html
<script src="../kit/visuals/draw.js" defer></script>
<script src="../kit/kit.js" defer></script>

<lk-figure>
<script type="application/json">
{"title":"El almacén","aria":"Una rejilla con el robot y la salida al otro lado",
 "viewBox":"0 0 760 290",
 "grids":[{"x":16,"y":40,"cols":4,"rows":3,"w":82,"h":82,
           "cells":[{"c":0,"r":0,"kind":"robot"},{"c":3,"r":0,"kind":"exit","label":"+1"}]}],
 "arrows":[{"x1":20,"y1":260,"x2":320,"y2":260,"tone":"blue","label":"el robot sigue su política"}]}
</script>
</lk-figure>
```

Author the `viewBox` at the width of the reading column (760) so 1 unit is about 1 px and
the type lands where it was written. The scene keys are the engine's (`grids`, `sheets`,
`panels`, `dashed`, `bars`, `boxes`, `arrows`, `paths`, `labels`; cell kinds `free`,
`policy`, `value`, `exit`, `wall`, `hazard`, `robot`, `start`), documented in
`tools/visuals/README.md`. A figure that draws nothing, or whose payload does not parse,
says so instead of showing an empty box, and the note gate
(`node tools/visuals/audit-note.mjs --note <note>`) refuses a hand-written `<svg>`.

The bridge serves `kit/visuals/draw.js` from `tools/visuals/` and loads it before `kit.js`
on every reader page, so a markdown note only writes the `<lk-figure>` block. A hand-built
page loads it itself, exactly as it loads `scene.js` for `lk-walkthrough`. A page served by
another static server must expose the engine at the same path (`<kit>/visuals/draw.js`),
beside `kit.js`, because that is where the component looks for it; the engine file itself
stays in `tools/visuals/draw.js` so there is only one renderer.

`lk-walkthrough` is the deck's own visual language, step by step. **Every reading section gets
one**: the figure carries the visual explanation and the prose keeps the detail, so a section
without a figure is a gap. Each `scene` is the complete state that step shows, drawn with the
tutorial's primitives (`grids`, `sheets`, `boxes`, `arrows`, `labels`, `badges`, `dashed`,
`gears`, `nodes`, `icons`, `formulas`, `callouts`, `bars`, `stats`, `curves`, `paths`); the
component reveals one scene per step, so earlier steps never leak into later ones, and «Ver
todo» shows the last scene. Reach it with «Siguiente», «Anterior», the dots
or the arrow keys, and press «Pantalla completa» when you need the letters big.

Draw the example itself, not a description of it: a robot on a floor is tiles and the robot's
tile, a network is nodes, and every step points at what changed with a labelled arrow. A table
whose icons change while captions below tell the story is not a scene, and the engine rejects it.
A distribution or a function is its curve, with the axis and the marked region; an object that
acts or changes is an `icons` entry; a box with a word inside is neither. `scene.paths` draws a
trail from its `d` and `scene.curves` a bent one from its two endpoints, both with the same
`tone`, `dashed` and `width` as every other piece; `arrow: false` keeps the head off a curve
that is a curve and not an arrow. A closed `d` plus `fill` paints a region: the ±σ band is the
curve from μ−σ to μ+σ, closed down to the axis (`L 212 250 L 148 250 Z`), so the shading stands
on the axis it belongs to instead of floating over the curve. Curves and paths are drawn before
the arrows, so a filled region never hides the arrow that points at it, and an arrow's tip has
to land on the piece it names: `scene-lint` measures the tip against the ink of every path and
reports `flecha-al-aire` when it is more than 12 units away. The worked bell — curve, μ, ±σ band
and the tails — is `integrations/pi/kit/examples/curva-gaussiana.md`.
When the data is the example, a `grids` entry paints a real table with its values, so a figure can
show the row that violates the rule instead of describing it, with an arrow pointing into that row.
The engine requires at least one such deck of 3 to 6 steps in every part (see
[Progressive walkthroughs](engine.md#progressive-walkthroughs)).

```json
{"step": "...", "scene": {
  "grids": [{"x": 60, "y": 90, "cols": ["employee_id", "last_name", "salary"],
             "rows": [["7782", "CLARK", "2450,00"], ["7999", "LOPEZ", "mucho"]],
             "width": 620, "rowH": 52, "rowTone": {"1": "red"}, "cellTone": {"1,2": "red"}}],
  "boxes": [{"x": 740, "y": 300, "w": 420, "h": 62, "label": "dominio de salary", "sub": "NUMBER(7,2) > 0", "tone": "amber"}]}}
```

### Annotated formulas

A formula the part explains is drawn symbol by symbol, with one numbered callout per symbol and
one `labels` line per number saying what it is. `<lk-math>` renders a clean equation with no
arrows, so it is for a calculation, never for explaining a formula.

```json
{"viewBox":"0 0 760 410","title":"La densidad gaussiana, símbolo por símbolo",
 "caption":"Cada número señala un símbolo de la fórmula y dice qué es.","scene":{
  "formulas":[{"x":380,"y":130,"size":28,"atoms":[{"t":"f"},{"t":"("},{"t":"x"},{"t":")"},{"t":" = "},{"t":"1/(σ√(2π))"},{"t":" · "},{"t":"exp(−(x−μ)²/(2σ²))"}]}],
  "callouts":[{"n":1,"x":173,"y":30,"symbol":"f","tone":"blue"},
              {"n":2,"x":192,"y":76,"at":2,"tone":"amber"}],
  "labels":[{"x":380,"y":220,"text":"① f: la densidad, la altura de la curva"},
            {"x":380,"y":252,"text":"② x: el valor que miras, la latencia"}]}}
```

One atom per symbol (`{"t":"σ"}`, not the whole formula in one atom) is what gives each symbol
its own position, and **a callout names the symbol it points at, never a coordinate**: `"at": 2`
indexes the scene's atoms in drawing order, `"symbol": "x"` takes the first atom whose text is
`x`. The number stays where the author put it (`x`, `y`); the guide is measured at render time
against the `tspan[data-atom]` the reader actually drew, so it lands on the glyph in any
font, size, theme and width. It is measured again when the fonts finish loading, when the
width changes and when the paper changes. An x coordinate measured against one font is what
put ① on «=» and ⑥ on nothing in the learner's reader; a callout that still carries `to`
keeps drawing that way for old notes. A callout that names a symbol the formula does not have
is `callout-desviado` in `scene-lint`, and a guide that crosses a word is `trazo-sobre-texto`.
The engine reads the atoms as the formula and the `labels` lines as the legend, so a symbol no
line names is refused. Worked example, gated: `integrations/pi/kit/examples/formula-anotada.md`.

### Formula and derivation walkthroughs

`lk-story` is the step deck for a formula and for a worked exercise. Both kinds share one
furniture: a **header** with the formula or equation (the step's token highlighted, the rest
normal), a **stage** where the action happens (actors with a name tag, props, state by colour, a
dashed movement arrow with its verb, a ✓/✗ result mark, orthogonal elbows from a tag to its
target), a **narrator** with short sentences and inline chips (`«2»` is a chip, `*pasa
restando*` a coloured keyword), and a **player** (previous / play / next, a segmented progress
bar, an N/M counter).

`kind: "formula"` teaches a formula: step 1 is the whole formula; each middle step highlights
one symbol or group by its stable atom `id` and says what it is, what it is used for and its
value in the running example (`say: {what, use, value}`); the last step shows the formula with
the example's numbers substituted and its result. The formula lives in the header, drawn as
HTML tokens from the same atom objects, so it wraps in a narrow column and stays at reading
size. `kind: "derivation"` teaches an exercise: each step is an equation built from term atoms
with stable ids; a term that crosses to the other side is drawn as a faded actor where it was
and a coloured actor where it lands, with a dashed arrow measured between the two boxes and
its verb above; `marks` of kind `combine` mark the terms that combine and replace them with
their result; the last step boxes the answer with a ✓.

```json
{"kind":"derivation","title":"Resolver x + 2 = 3","viewBox":"0 0 360 250","steps":[
 {"title":"La ecuación","equation":{"size":22,"atoms":[{"t":"x","id":"x"},{"t":" + ","id":"plus"},{"t":"2","id":"two"},{"t":" = ","id":"eq"},{"t":"3","id":"three"}]},"focus":["two"],
  "narrator":"Tengo «x + 2 = 3». Quiero dejar la «x» sola.",
  "stage":{"scene":{"actors":[{"id":"x","x":20,"y":150,"w":44,"h":40,"label":"x","tone":"blue","tag":"incógnita"},{"id":"two","x":140,"y":150,"w":44,"h":40,"label":"2","tone":"amber","tag":"el 2"}]}}},
 {"title":"El 2 pasa al otro lado","equation":{"size":22,"atoms":[{"t":"x","id":"x"},{"t":" = ","id":"eq"},{"t":"3","id":"three"},{"t":" − ","id":"minus"},{"t":"2","id":"two"}]},"focus":["minus","two"],
  "narrator":"El «2» estaba sumando. Al cruzar, *pasa restando*.",
  "stage":{"scene":{"actors":[{"id":"two-old","x":140,"y":40,"w":44,"h":40,"label":"2","tone":"slate","state":"faded","tag":"estaba sumando"},{"id":"x","x":20,"y":160,"w":44,"h":40,"label":"x","tone":"blue"},{"id":"two","x":230,"y":160,"w":44,"h":40,"label":"2","tone":"amber"}],"moves":[{"from":"two-old","to":"two","verb":"pasa restando","tone":"amber"}]}}},
 {"title":"La cuenta","equation":{"size":22,"atoms":[{"t":"x","id":"x"},{"t":" = ","id":"eq"},{"t":"1","id":"one"}]},"focus":["one"],
  "narrator":"«3 − 2 = 1». Entonces «x = 1».",
  "stage":{"scene":{"actors":[{"id":"x","x":40,"y":170,"w":44,"h":40,"label":"x","tone":"blue"},{"id":"one","x":160,"y":170,"w":44,"h":40,"label":"1","tone":"green"}],"marks":[{"kind":"ok","actor":"one"}]}}}
]}
```

A stage can also use the scene vocabulary (`paths`, `curves`, `icons`, `labels`, `callouts`), so
the formula story shows the symbol's meaning in the example: the bell, the μ line, the ±σ band,
and the request and the server as `icons` with a name tag. An icon is drawn with its tone's soft
fill (never white on white paper) and its centre is kept inside the `viewBox`, because a
declared icon half outside the canvas is clipped by the SVG and reads as nothing; `scene-lint`
and `scene-gate` report `pieza-invisible` when a declared icon or figure draws no ink.

The result mark frames the answer **once**: the actor's own border is thickened and drawn in the
result's colour (no second rectangle around it), and the ✓/✗ is placed on the right, below or on
the left of the actor, whichever fits inside the canvas with 12 units of air, measured on what the
browser drew. `scene-gate` measures `<lk-story>` blocks too, one step at a time (it used to open
only `<lk-scene>` and say «sin escenas» in front of a whole story), so a mark, a tag chip or a
label that crosses the canvas edge is `al-borde`.

**One surface.** The whole card — header, stage, narrator and player — shares the reader's
paper, and so does every still `lk-scene`: both stages carry the `lk-remap` class that the night
rules are scoped to. In `dark` and `black` the stage paints with that paper and the night ink instead of a white
rectangle floating between two dark bands: `kit.css` remaps the drawing's tones (`#004276` →
`#8FC0E0`, `#21594F` → `#7FCBAE`, white surfaces → the paper, …) with attribute selectors scoped
to `lk-story .lk-story-stage`, so the SVG is the same and the computed colours are what the
learner sees (every label reads at ≥ 4.5:1 on its paper; the bridge matrix measures it). The
card is at most 720 px wide; its stage panel fills the card and the drawing is centred and
capped at 1.6× its `viewBox`. The narrator is 18 px and the header equation 22–28 px on desktop
(17 and 18 px below 560 px): the two are the most readable things on the card.

Worked examples, gated: `integrations/pi/kit/examples/formula-gaussiana.md` and
`integrations/pi/kit/examples/derivacion-x.md`.

A `<lk-math>` written in a note reaches KaTeX exactly as written. The reader lifts the element
out of the markdown before `marked` runs, like `$…$` and `$$…$$`: `marked` drops the backslash of
an escaped punctuation mark, so `\;` `\!` `\,` used to render as a stray `;` `!` `,`
(`integrations/pi/view/math.js`). An element named inside a code span is prose and is left alone.

`rowTone`, `colTone` and `cellTone` take `{índice: tono}` with `blue`, `green`, `amber` or `red`;
`rowH` and `size` keep long values readable. Keep every step on the same coordinates so the figure
stays put while its state changes, put the one sentence that explains the step in its `text`, and
keep labels short: below 640 px the stage scrolls sideways with a hint instead of shrinking the
letters. In the reader's wide mode a deck crosses both columns (`column-span: all`) and is drawn
once, in its place: without it the deck is split between the columns and only its title shows.
A figure grows to one reading column and no further: `kit.js` stamps the stage with `--lk-vb`
and `kit.css` caps it at `min(100%, 1.6 × viewBox)`, centred. In the reader's wide mode the
column is twice as wide, so a small deck used to float as a thumbnail inside the frame; the
1.6× cap lets it fill the column while its labels stay at or above the reading size (a 14-unit
label renders at 22 px at the cap). A 360-unit scene rendered across a 1304 px column used to
draw its axis labels at three times the reading size; the cap is what keeps the type the size
the author wrote.
For diagrams deliberately authored as a narrow vertical layout, opt in with
`<lk-walkthrough class="lk-wt-compact">`: in full screen the cap is lifted so the figure grows; on mobile the SVG fits the available width and the
scroll hint is hidden. This does not reflow SVG contents; authors must keep text
large enough and verify every scene on a phone. Decks without the attribute keep
existing horizontal scrolling.

A word never leaves the box that holds it. `scene.js` stamps every box and grid text with the room
it has (`data-fit`), and `kit.js` measures the real glyphs once the deck is in the page: it shrinks
the type in up to four passes down to 55% of the authored size and, only as a last resort, squeezes
the glyph spacing. A character count is not a measurement — an earlier gate passed decks whose
sub-lines spilled over the frame. Labels are not boxes: a free label drawn over a box or another
word is a collision, not a label, so put the identifying words in the box `label`/`sub` and use
`labels` for what sits in open space.

An arrow reaches its target from outside the figure: `scene-lint` reports `flecha-cruza-trazo`
when its shaft comes within a stroke's width of another path's ink more than 12 units from its
own tip. The «el pico» arrow left the box below the axis and cut the bell's right flank 156
units from its tip, so the reader saw a line buried in the curve; it now comes from the empty
upper-right area. A box or a label that no arrow or guide reaches and that sits more than 40
units from anything drawn is `pieza-suelta` — a word floating beside the figure. Every piece
connects to what it names, or it is removed. An arrowhead that comes within 4 units of any text
is `punta-sobre-texto`: the «μ−σ» label of the gaussian's step 2 sat under the marker triangle,
so the label moved and the arrow stayed. A declared icon or figure that draws no ink (zero box,
or entirely outside the canvas) is `pieza-invisible`.

An arrow's own `label` is drawn beside the arrow, never on it: a caption on the line hides the very
direction the arrow exists to show. That placement is the component's job, so an author writes
`label` and nothing more; the gate fails a free label that lands on the arrow's ink.
The browser gate also reports `text-over-arrowhead` when a text rectangle overlaps the
marker head's screen-space bounding box by more than 2 px horizontally and more than
35% of the text rectangle's height vertically. This threshold avoids treating a small
graze of the font's empty bounding-box leading as a collision; it is a geometric
heuristic, not a test of individual painted glyphs.

The renderer is the safety net, not the review. Before publishing a note with decks, run the real
browser gate over the file and fix what it names; it exits non-zero on any spill, label over a box,
caption on an arrow or word over a word, and prints `deck`, `step` and the offending text:

```sh
node tools/deck-gate.mjs <vault>/rapidos/mi-nota.md
node tools/deck-gate.mjs <vault>        # every note in the tree
```

The content backup enforces the structural half on its own before it publishes: a note whose decks
break the rules is not pushed, and the run names the note and the rule. See
[Content backup](deploy-vps.md#content-backup).

A page with a walkthrough must load the drawing vocabulary first, because `kit.js` takes it from
`window.LKScene` and throws «Falta scene.js» otherwise:

```html
<script src="../kit/scene.js" defer></script>
<script src="../kit/kit.js" defer></script>
```

Highlights (`dashed`) are painted after sheets and boxes and before labels, so a highlight that
must not hide what it marks needs `"fill": "none"`.

The page paper follows the reader's choice. `kit/theme.js` reads `?theme=`, then
`localStorage`, then the operating system, and sets `data-theme` on `<html>`; the
bridge and the studio load it before anything else paints. `kit.css` swaps only tokens in
`:root[data-theme="dark"]` and `:root[data-theme="black"]`. A scene (`lk-scene`), a story
(`lk-story`) and an `lk-figure` follow the night paper: their stage paints no sheet of its own and
the drawing's tones are remapped to night tones (see «One surface» below). A classic
`lk-walkthrough` deck and a mermaid diagram are the exception: each keeps its own light sheet,
whole, as a card. Both night themes go
in one `:is()` list — written as a comma-separated pair of selectors, each rule reached only
half of them and the annotated formula kept its dark ink on the black page. An `lk-figure` from
the visual engine is
the exception: it names tones instead of colours, so it follows the paper it lands on. A
page that hard-codes `#fff` for a surface will not follow the theme; use `var(--paper)`
and `var(--ink)`.

Both rich quizzes and plain part/diagnosis quizzes share `kit/dictate.js`:
«Cómo lo pensé (opcional)», its hint and «Dictar» button. The bridge loads it
before either client; standalone kit pages load it automatically beside `kit.js`.
Plain quizzes still require confidence, but never require reasoning; saved legacy
answers retain their old explanation when no `razonamiento` is present.

`lk-quick-quiz` embeds an inline checkpoint within each section/point of the explanation.
It takes attributes `point="<section title>"` and `categoria="<category>"` (or `tag="<category>"`, e.g. `matematicas`, `conceptual`, `terminologia`, `gramatica`, `fisiologia`, `finanzas`, `cronologia`, etc.) with an
inner JSON script holding `{id, pregunta, opciones, correcta, explicacion}`. When answered, it grades
instantly in-page and reports telemetry (verdict, correct/wrong, and the explanation why) to the parent
studio and the bridge backend (`telemetria.json`), feeding the tutor's adaptive model across any discipline.

`lk-quiz` fetches questions and requires only a choice for each. The `razonamiento` box — where
the learner drains what they are thinking, typed or dictated with the microphone button — and
`confianza` (`seguro`, `dudo`, `adivine`) are optional extras that show the tutor how the learner
reasons; leaving them empty never blocks grading. Own-words and exercise fields are optional too.
When bridge config includes `transcribeUrl`, «Dictar» records browser audio and
«Detener» uploads it for server-side transcription, showing «Transcribiendo…».
The microphone needs HTTPS remotely; the server keeps the transcriber credential
private. Without that URL the existing browser Web Speech dictation is unchanged.
It displays server grading and restored read-only answers
and concept verdicts. Never put answer keys in the page. Exercise instructions
remain page-authored content. `lk-video` and `lk-audio` are present on every part node —
author them, or the bridge injects them with the kit assets; both check availability with
HEAD and poll every 30 seconds after requesting generation. `lk-audio` draws one row per
style the part can be heard in: an existing file is a player with its download, a missing
one is the «🎧 Generar …» request. `lk-ask` sends a question.
Without bridge config these three show the instruction to open the page in Pi;
all local demos, diagrams, steps, and mathematics remain usable.

## Injected config

The bridge injects this **first in head**; builders must not hardcode tokens:

```js
window.LEARNING_BRIDGE = {
  submitUrl: '/<token>/submit',
  quizUrl: '/<token>/api/quiz?topic=<topic>&part=<part>',
  topic: '<topic>', part: '<part>',
  video: 'file/explicaciones/adjuntos/Parte N - Name.mp4',
  audio: {
    base: 'file/explicaciones/adjuntos/audio/',
    styles: [
      { style: 'debate', name: 'Parte N - Name - debate.m4a', exists: true,
        srt: 'Parte N - Name - debate.srt', srtExists: true },
      { style: 'entrevista', name: 'Parte N - Name - entrevista.m4a', exists: false,
        srt: 'Parte N - Name - entrevista.srt', srtExists: false }
    ]
  }
};
```

Quiz responses are `{questions, answered, verdicts}`. Questions have `id`,
`enunciado` and an A–E `options` object, without keys. `answered` is null or a
graded array of `{id,chosen,correct,ok,razonamiento,confianza}` (the bridge
format; a file written by the older two-prompt page is still read and merged). It also accepts a grading object with `results`, `score`, `reasoning`
(or `razonamientos`) and optional `answers`, `ownWords`, `exercises`. Verdicts
are an array of `{codigo,estado,pregunta,evidencia}`; a concept-ID map to
`{veredicto,evidencia}` is also accepted. Submissions use JSON:

- Video: `{kind:'video', topic, part}`.
- Audio: `{kind:'audio', topic, part, style}` with `style` one of `debate`,
  `entrevista`, `charla`, `formal`; anything else is rejected with 400.
- Question: `{kind:'question', topic, part, text}`.
- Quiz: `{kind:'mini-quiz', topic, part, answers, reasoning, ownWords?, exercises?}`.
  `reasoning` maps question IDs to `{razonamiento, confianza}`; the older
  `{entendi, porque, confianza}` shape is accepted and stored as one
  `razonamiento`. Successful grading returns
  `{results:[{id,chosen,correct,ok}], score:'3/4', saved:...}`.

## Authoring rules

Preserve the complete explanation, not just its experiments. Use neutral Spanish,
short paragraphs, one running example and the learner's Pure Explanatory Method:
formal definition first; «1. Por qué existe»; pieces with everyday questions;
T0/T1 steps with NUEVO/BLOQUEO; intuition, decision table, then formalism;
line-by-line arithmetic; explicit X ≠ Y distinctions; «Dónde se rompe la
analogía»; the dichotomous tree «El mapa mental más importante»; closing
Entrada ➔ Proceso ➔ Salida, one-line-per-concept table, three-bullet summary;
final integrating mini-quiz and two exercises (easy/medium, 60% threshold).
Keep every original section in order. Do not gate reading behind interactions.
Place each demo inline in the section it illustrates, never on a separate app
screen. Keep review questions at the end. Use vertical Mermaid for decision
trees; use SVG where spatial relationships genuinely clarify the example.

Use the shared white-paper palette and system DejaVu Sans / DejaVu Sans Mono;
**no external fonts**. No network except same-origin bridge endpoints and pinned,
SRI-protected CDN libraries. The kit lazily loads KaTeX 0.16.22 (CSS/JS) and
Mermaid 11.6.0 only when used. It does not need marked or DOMPurify: fetched
strings are rendered as text, never HTML. Handle network errors visibly and
inspect desktop/mobile layouts and keyboard operation before delivery.

Reference: `integrations/pi/kit/examples/rl-parte-3.html` (serve through the bridge;
the relative kit URLs intentionally target the bridge route).
