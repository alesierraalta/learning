# Rich part pages

Before authoring, run `node tools/branch-fresh.mjs`: a checkout behind `origin/main` documents a
contract main has already replaced, so a figure written against it is redesigned the moment it
lands (#406).

The part's Markdown note is what the learner reads (#265): the reader renders it with the
kit's pieces, the interactive mini-quiz and the video. A plain HTML page beside the note,
with the same basename and an `.html` extension, is optional. The bridge serves it at
`/<token>/<topic>/<part>` only when it measures as its note (the same rules, read as a page, without the
authoring cues, #305) and carries every `<lk-…>` figure of the note and the interactive `<lk-quiz>`; otherwise
the learner gets the note. Inside the page, code goes in `<pre><code>`, titles in `<h2>` and formulas in
`<lk-math display>`; a Markdown fence outside `<pre>` refuses the page (`codigo-pagina`, #328).
No build or framework is required.

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

`lk-math` renders a clean equation and nothing else: it is for a **calculation of one line**. A formula the
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

### Sequences: who says what to whom, in order (#353)

When an idea is a process across actors — a request through a client, an API and a database — draw
a `sequence` inside a `<lk-story>` step (or a legacy `<lk-walkthrough>` step) instead of a row of
boxes with arrows. Boxes say who exists; a sequence says who speaks, to whom and when. Declare
`{actors: [{id, label, sub}], messages: [{from, to, label, kind, at?}], notes?, phases?}` on the
`scene`; `kind` is one of the existing tones (`blue`, `green`, `amber`, `red`) and `at` is the row
that orders time. `phases` adds a band per stretch, `notes` a caption below the rows, `legend`
names the categories, and `flow: true` makes a message flow. Author the `viewBox` around 680 wide
so one unit is about one pixel at the reading column: labels that small still clear the reader's
14 px floor.

The whole diagram is one piece of state: with an `id` its key is stable across steps, so it
slides from where it was, flashes when a message changes, accepts `ring: "<id>"`, and its arrows
draw themselves and flow with the kit's own motion. `facts` and `summary` work unchanged. At 390 px
the stage scrolls horizontally inside its frame instead of shrinking the type; the gates measure
the settled frame. `scene-lint` reports `mensaje-sin-actor`, `mensaje-desordenado`, `mensajes-encimados`
and `actor-sin-etiqueta`.

```html
<lk-story>
<script type="application/json">
{"kind":"derivation","viewBox":"0 0 680 360","steps":[
 {"title":"La petición","narrator":"El cliente pide y la API consulta.",
  "stage":{"scene":{"sequence":{
   "id":"pedido",
   "actors":[{"id":"cli","label":"Cliente","sub":"navegador"},{"id":"api","label":"API"},{"id":"db","label":"Base"}],
   "messages":[{"from":"cli","to":"api","label":"GET /pedido","kind":"blue","at":0,"flow":true},{"from":"api","to":"db","label":"SELECT id","kind":"amber","at":1}],
   "phases":[{"label":"Petición","at":0,"tone":"blue"}]
  }}},
  "facts":[["emisor","Cliente"]]}
]}
</script>
</lk-story>
```

Worked example, gated in black at 1500 px and at 390 px:
`integrations/pi/kit/examples/secuencia-peticion.md`.

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
component reveals one scene per step, so earlier steps never leak into later ones, and «Ir al
final» shows the last scene. Reach it with «Siguiente», «Anterior», the dots
or the arrow keys, and press «Pantalla completa» when you need the letters big.

**Motion between steps.** A step change moves the figure instead of swapping it. Each piece keeps its identity across steps: its explicit `id`, else its kind and label (`box:Cliente`, `icon:database`). A piece that stays slides from where it was and takes its new tone; a new piece rises 6 px while it fades in; a removed piece fades out. All of it runs in 320 ms on `cubic-bezier(.2,.8,.2,1)`, and the settled frame is the static drawing. Give a piece an `id` when its label may change between steps and it must still count as the same piece. While a step is moving the stage carries `data-settled="false"`. `prefers-reduced-motion: reduce` swaps steps at once, and the gates and the reader's tests run that way so they measure the settled frame. A new step, an arrow key or full screen cancels the step in flight. The SVG steps of `lk-story` move the same way; its piece steps (cards, memory, tables, venn) are HTML and swap at once.

**A change is marked, and a focus is ringed.** A piece that stays from the previous step and whose text, value or tone changed flashes its outline once, for 600 ms, with nothing to author. A step can name one piece with `ring: "<id>"`, the `id` of a box, icon, label, actor or prop in that same step: a ring pulses around it until the step changes, and a step rings at most one piece. The ring and the flash are drawn in the figure's own units, so they follow the night themes, wide mode and full screen. The ring is marked `data-focus-ring`, and the gates take it out before they measure, so it moves nothing they check. Under `prefers-reduced-motion` nothing flashes and the ring is a static outline. `scene-lint` reports `foco-sin-pieza` when the id names no piece of its step. In a story, `focus` is the list of formula tokens it highlights; a string `focus` rings nothing. A step rings its piece with `ring` and highlights tokens with `focus`, both at once if it needs to.

**A flow arrow carries movement.** An arrow (`arrows`) or a story move (`moves`) with `flow: true` is dashed, and its dash travels from tail to head on the explorer's clock (`lk-xflow`). Use it when something moves or is handed from one piece to another, such as a value that passes or a request that reaches a server, and not on every arrow: a relation that does not change should not flow. A new arrow draws itself in over 400 ms, with its head appearing at the end; a new flow arrow is solid while it draws and starts flowing when it lands. Under `prefers-reduced-motion` a flow arrow is solid and still, and a move without `flow` keeps its dashed look. `flow` must be a boolean; `scene-lint` reports `flujo-no-booleano` when it is not.

**Facts and a closing card.** A step can carry `facts: [[key, value], ...]`, at most five rows: a key-value table beside the step's text, with the values in mono and tabular figures, stacked under the text below 640 px. A walkthrough or a story can carry `summary: {title, text?, metrics: [[key, value], ...]}`, a closing card after the last step. It is reached with «Siguiente», the dots, the arrow keys or «Ir al final»; there the counter reads «Resumen» and the progress bar is full. The card is not a step, so the step counter, the step numbering and the engine's step bounds do not count it. Use `facts` for a symbol legend (`donde: a → …`) or for the measured result of a walkthrough, and the card for that result. It is not a recap: the standard refuses a closing summary in the prose. A row without text on both sides is not drawn, and `scene-lint` reports it as `hechos-mal-formados`, `hechos-vacios` or `hechos-demasiados`; the card has `resumen-mal-formado`, `resumen-vacio` and `resumen-demasiados`. `deck-gate` measures the table and the card at 390 px and reports `hechos-desbordados` or `resumen-desbordado` when one leaves its box or the screen. A story takes `facts` on each step: the engine reads step keys strictly, and `facts` is one of them.

**The cues are measured, and story moves flow.** A walkthrough or a story of three steps or more ends with a `summary` card; a formula or derivation story names its symbols in `facts` on at least one step; and a walkthrough or story of three or more drawn steps names one piece with a `ring`. `explain-check` measures the three (`falta-resumen`, `falta-leyenda`, `falta-foco`). Piece stories (cards, memory, tables, venn) have no drawn steps and ask for no ring. A story's `moves` flow by default, as if they had `flow: true`; `flow: false` holds one still. Walkthrough arrows stay opt-in.

**A calculation is a derivation story, not text (#324).** Two or more lines of `<expr> = <expr>` that substitute numbers, in a fenced block or in consecutive lines, are a calculation written as text; so are two or more consecutive display formulas (`$$…$$`, `\[…\]`, `<lk-math display>`) that do the same. Two or more calculation lines inside one display (`\\`, `aligned`, `align`, `array`, `gathered`) are a calculation too, and so are two or more `<lk-math>` elements alone on their own lines that do the same. `explain-check` refuses them as `calculo-en-texto`, and the engine refuses them under the same rule: draw each line or formula as a step of a `<lk-story kind="derivation">`, with the changed token in `focus` and a `summary` card with the result. A single result line (`z = 2`), a value inside a sentence, a formula with no numbers and one display formula with its values in one line are not calculations; the code of a programming language is code.

A derivation story does not count toward the part's one walkthrough (`maxWalkthroughs`, #324): a part carries its formula story and one derivation per calculation.

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
arrows, so it is for a calculation of one line, never for explaining a formula. Two or more lines of calculation are a derivation story (#324).

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

**The header is one line.** A formula or equation never wraps and a highlighted group never
spreads its letters (#222): the highlight is a background bar with no horizontal padding or
margin, so the group measures what it measures unhighlighted, and the line is a `nowrap` row
that scales between 22 and 28 px with the card (`cqw`) and scrolls horizontally, with the
highlighted group brought into view, when it still does not fit. The bridge matrix pins one line
and an unchanged width in every cell.

**Actors with state and props** (#217). An actor is a concept with a name tag: a box with a
`label` or, with `"kind":"robot"` (its older alias `icon` still works), a character drawn centred
at `x`, `y`. Its `state` shows by colour and mark: `active` (default, its tone), `faded` (grey: it
no longer holds), `invalid` (grey, struck through, with a ✗ at its corner unless the author marks
it with their own ✗), `locked` (its tone, a dashed frame and a small lock at its corner: the row is
held by a transaction) and `waiting` (grey, a dashed frame: it is not its turn yet).

**Actor characters** (#245). An actor whose idea is a character is drawn as one, never as a
rectangle with its name inside: `kind` is one of `database` (the cylinder), `row` (a table row with
its cells), `session` (a terminal with its prompt), `lock`, `user`, `server` (the rack), `process`
(a block with its cycle), `file` (the folded sheet), `packet` (the envelope) and `robot`. They are
line drawings in the kit's own stroke — two or three shapes each, no text inside, legible from
14 px up, and they follow the three papers because they are drawn with the tone's ink and sheet.
The same kinds work as `scene.icons` and as a `prop`'s `kind`. A story whose actors are all boxes,
when a name asks for a character («Cuenta 10» is a row, «Memoria de sesión» is a session), is
refused by `explain-check` as `actor-sin-personaje` and by the engine as `actorCharacter`; a
`<lk-scene>` that only draws boxes with text and arrows is refused as `escenario-de-cajas` /
`sceneStage`. Worked example, gated: `examples/plsql-transaccion.md` (two rows with their saldos,
the locked row with its lock, and `lk-memory` for session versus disk).
`props` carry meaning and are anchored by id: `{"id":"valor","kind":"value","on":"s1","side":"right","label":"\"hola\""}`
draws a small chest with its value label, `read` an eye, `write` a pencil, and any icon kind
draws that icon; `state: "faded"` greys a prop. The prop goes to the side asked for and, where
that side has no room (canvas edge, another actor, another prop, the name tag over its actor), to
the first one that does; its label is measured in the reader's font. A move can start or end on a
prop (`{"from":"valor","to":"s2","verb":"se mueve"}`), a tag can name one, and a result mark goes on an actor,
on several (`"actors":[...]`) or in the gap between two (`{"kind":"ok","between":["s1","s2"]}`).
A prop or a mark that names an id the step does not have is declared, not drawn in the air:
`scene-lint` reports it as `pieza-sin-destino`, and a prop drawn over a word as `pieza-sobre-texto`;
`scene-gate` measures them like every other piece (`al-borde`). Worked example, gated:
`integrations/pi/kit/examples/propiedad-rust.md` (a value changes owner, the old owner is struck
through, the value is freed).

**A move is one dashed arrow, whichever way it is written** (#286). The canonical shape names its
two pieces — `{"from":"two-old","to":"two","verb":"pasa restando"}` — and is the one to write;
the stroke leaves the border of the origin (an actor, a prop, a box) and lands on the border of the
destination. The shape the tutor writes names an actor and a target point —
`{"actor":"cli","toX":222,"toY":150,"verb":"SYN"}` — and is accepted with the same meaning: the
same dashed stroke, arrowhead and verb, leaving the actor's drawn figure towards that point and
ending on it. Point the target at free space or at the border of the piece it reaches: a point
inside a figure buries the arrowhead (`punta-enterrada`). A move the drawing cannot draw — a shape
the kit does not know, an origin or a destination the step does not have, or a target where the
actor already is (a stroke of 0 units) — is never dropped in silence: the kit marks it on the
drawing and `scene-lint` refuses the step as `movimiento-no-dibujado`, while the engine mirrors the
structural half under the additive `storyMoveDrawable` key. The four notes of the fifth bench run
that declared `{actor,toX,toY}` with the actor's own coordinates are
`integrations/pi/kit/test/fixtures/bench286/` (Git, TCP, Rust and CSS), next to Bayes, which wrote
the canonical shape and drew 4 of 4.

**One row, one baseline** (#245). Actors that stand side by side are laid out from the
largest frame in the row, the state frame included: a `locked` actor draws a dashed frame and a
lock at its corner, and those pieces grow its measured box, so a row laid out from each actor's
own box put its name tag ~30 units higher and its value chest ~22 units lower than its neighbour's
and the row read crooked. Tags share the row's top, props share the row's bottom, and both are
centred on the actor's figure (the character or the box), never on the decorated edge. `scene-lint`
reports a row whose figure centres or name tags differ by more than 6 units as `fila-torcida`.

**A mark sits on its owner** (#245). A ✓ or ✗ that names one actor or prop is placed under its
owner's column, or above it when there is no room below, and it moves to the outer side of the
row — away from the neighbour — before it ever goes into the gap. A mark that names several
pieces is placed in the gap between them and must carry its `label`. `scene-lint` reports
`marca-suelta` when a mark's box falls in the horizontal gap between its owner and another piece,
or when its centre is nearer another piece than its owner.

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
`lk-walkthrough` deck follows the night paper too (#222): its card takes the page paper and ink,
its stage carries `lk-remap`, and its title, caption and step buttons read at ≥ 4.5:1 on it (the
bridge matrix measures it; it was a white card in dark and black). A mermaid diagram is the
exception: it keeps its own light sheet, whole, as a card. Both night themes go
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
inner JSON script holding `{id, pregunta, opciones, correcta, explicacion}`; `id` may be left out, because the
bridge gives each checkpoint one when it serves the page. The key stays with the tutor: the page is served with
`correcta` and `explicacion` removed and the options in the learner's own order — the mini-quiz's seeded scheme,
«No sé» last, the same order on every reload (#272/#276). Answering posts `{kind:"quick-quiz", id, chosen}` to
`submit` (a quick note also names its `note`), and the bridge grades it, replies with the verdict, the right letter
and the explanation, records telemetry (`telemetria.json`) and delivers the result to the chat, feeding the tutor's
adaptive model across any discipline. The element draws what it is served: it never grades on its own. A checkpoint
is answered once; its answers file is `explicaciones/Parte N - <slug>.qq.answers.json` for a part and
`rapidos/<nota>.answers.json` for a quick note. The file route serves neither a note nor a tutor page (demos excepted):
both carry the key (#276).

Question text is drawn by one renderer, `kit/question.js` (`window.lkQuestion`), in the reader and
in the studio alike (#332). A stem, an option, an exercise statement or a `pieza` is prose that
may hold: a fence (```` ```lang ````) whose lines are kept and highlighted, `code` inline,
`$...$` or `$$...$$` drawn by KaTeX, `**bold**`, `*italic*` or `_italic_`, and `- ` or `1. ` lists as
real elements. Everything else is text: a question's words never reach `innerHTML`. A `pieza` of tipo `codigo`, `salida` or `katex` is drawn by the same renderer.

**Code answers are code fields** (#334). `kit/code-field.js` (`window.lkCodeField`) makes a textarea a code field: monospace at the reader's code size (`textarea.lk-code` in `kit.css`), lines and indentation kept and not wrapped, and Tab and Shift+Tab indent and outdent instead of leaving the field. A selection is indented line by line, and no text is replaced. An empty field lets Tab move the focus; a field with text keeps Tab for indentation, and Escape blurs it so a keyboard user is never trapped. The box grows with its content from the authored `rows` (3 for an answer) up to 18 rows, and only then scrolls inside: no inner scrollbar for a short PL/SQL answer. It is re-measured on input, on paste and after the direct `value` assignment dictation makes. The value stays exactly what the learner typed, nothing is added on blur, and dictation (`kit/dictate.js`) writes into the same textarea. The engine marks a code answer two ways (`isCode`): a question whose `pieza` is `codigo` or names a language (its «Cómo lo pensé» box is a code field), and an exercise with a code language `lenguaje` (its answer box is one). The reader's «Tu código» editor is always a code field. Every other answer, «Vuelco con tus palabras» and «Mi entrada» included, stays a plain box. The submit still trims both ends of an answer, as it always has. The bridge loads `code-field.js` before `kit.js` on the reader and on a rich page that does not load the kit itself; a page that loads `kit.js` itself gets it beside `kit.js`, as a standalone kit page does; the studio shell loads it after `question.js`.

**A code exercise whose language cannot run here is still an exercise** (#344). The bridge reads any `lenguaje` written in a topic: the exercise keeps its statement, its editor and its «Entregar al tutor» button. When there is no runner — or the declared image is missing, Docker is stopped or the CLI is absent — the result panel says «No se puede ejecutar aquí: …» and claims no score, instead of «Ejercicio no disponible»; the answer is still saved in `codigo/<id>/entregas/NNN.json` and delivered to the tutor (`Resultado: sin ejecución`). With the image present, the configured command runs and the panel shows the usual per-test results. There is deliberately no `plsql-lite` shim: running only the DML subset against SQLite would silently misgrade anonymous blocks, exceptions and `DBMS_OUTPUT`.

**The runner catalogue has three layers** (#348). `integrations/pi/runners.json` holds the builtin defaults — the fallback, not the ceiling: `python`, `c`, `cpp`, `java`, `javascript`, `sqlite` (alias `sql-sqlite`), `postgres`, `mongodb` and `plsql`. A machine overlay at `~/.config/learning/runners.json` (or `$XDG_CONFIG_HOME/learning/runners.json`, or the file named by `$LEARNING_RUNNERS`) merges over the builtins, so adding rust, go or R on one machine is one file and no deploy. A topic overlay written beside that topic's `plan.json` adds a language for that topic only. Precedence is builtins < machine < topic; a topic entry may **add** a language but may not replace an entry an earlier layer declared, because that is the execution contract. Both overlays are plain JSON objects of `{ "language": { "image", "file", "run", "compile?", "setup?", "entrypoint?", "size?" } }`. An entry that is malformed, names a host command (`"image": "host"`, an empty image, `sudo` or `docker run` in a command), or has no image/file/run is reported in `warnings` and ignored: never a broken page. Every command still runs as `sh` inside the container with the same network, memory, process and read-only-root limits as before; there is no host execution path. Adding a language anywhere is a single entry — no code change.

**Images shipped today** (compressed amd64, approximate) — the reader lists the ones actually present on this machine:

| Runner | Image | Size | Command |
|---|---|---:|---|
| `python` | `python:3.12-alpine@sha256:b658b05…` | ~18 MB | `python3 main.py` |
| `c` / `cpp` | `gcc:14@sha256:435c3cbc…` | ~541 MB | `gcc` / `g++`, then `./main` |
| `java` | `eclipse-temurin:21-jdk-alpine@sha256:fd52084c…` | ~184 MB | `javac Main.java`, `java Main` |
| `javascript` | `node:22-alpine@sha256:fe4f6d74…` | ~61 MB | `node main.js` |
| `sqlite` / `sql-sqlite` | `nouchka/sqlite3:latest@sha256:ef0d50c0…` | ~30 MB | `sqlite3 /work/lesson.db < main.sql` |
| `postgres` | `postgres:16-alpine@sha256:81e77a48…` | ~116 MB | server started in `/tmp/learning-pg`, then `psql … -f main.sql` |
| `mongodb` | `mongo:8.0@sha256:d97fea17…` | ~320 MB | `mongod` on `/tmp`, then `mongosh --file main.js` |
| `plsql` | `gvenzl/oracle-xe:21-slim` (unpinned: Oracle license) | ~755 MB | `sqlplus -s /nolog` |

Neo4j is deliberately **not** a builtin: its image is ~392 MB compressed (over 1 GB unpacked) and a JVM server needs a heap and page cache beyond the judge's 512 MB cap, so starting it inside the sandbox would mean weakening the isolation every other runner gets. If a machine has it, declare it in that machine's or topic's `runners.json` instead.

**Seeding an exercise.** A runner may declare `setup`, a shell command executed in the same container before any learner code or test. The tutor authors a seed script next to `ejercicio.json` and names it there as `"setupFile": "setup.sql"`; the bridge copies its text to `.judge/seed` inside the container, where the runner's setup command reads it (for example `sqlite3 /work/lesson.db < .judge/seed`). A seed is optional; runners that declare `setup` write an empty seed when no file is named, so an unseeded exercise still runs. Setup stdout is discarded on success: it is never mixed with the learner's result. On failure the result panel says «La preparación del ejercicio falló (salida N): …» with the clipped setup output, `total` is 0 and nothing is graded; a submission is still saved and delivered with `sin ejecución`.

**The runnable list is honest and actionable.** `GET /api/runners?topic=<id>` returns the merged catalogue annotated by a short, 30-second-cached `docker image inspect` (concurrent pages share one inspect). Each language has one of three states: `present` (the probe answered and the image is there), `missing` (the probe answered «No such image») or `unknown` (the daemon refused the connection, the docker CLI is absent, or the probe timed out). Only `present` is in `runnable`; an `unknown` image is never claimed as available nor as plainly absent: the reader says «no se pudo comprobar» beside its size and keeps the install hint, but offers no pull button, because pulling would fail for the same reason. No page waits on Docker: the reader paints the cached names, then refreshes the list as it loads, and the studio asks its own `api/runners` after the shell paints. Unknown answers survive the cache and flip on a later refresh once the probe can answer. Missing images show the exact `docker pull <image>` line and the approximate size in a quiet disclosure; the learner can press «Pedir al estudio que lo descargue», an explicit `POST /api/code/pull` — nothing is pulled on page load or in the background. Pull progress, success, failure and «no se pudo comprobar» are states, not error dumps (an explicit pull attempted while the probe cannot answer reports `unknown` without spawning docker). A run on such a language keeps #344's honest path: a notice, no score, and the answer saved and delivered with `sin ejecución`. The same list is exported in `learning_view`'s result (`runnable`, `runners`, `warnings`) and in the studio library, so the tutor prefers a language that runs here and offers the one-line install when a topic needs another.

`lk-quiz` fetches questions and requires only a choice for each. The `razonamiento` box — where
the learner drains what they are thinking, typed or dictated with the microphone button — and
`confianza` (`seguro`, `dudo`, `adivine`) are optional extras that show the tutor how the learner
reasons; leaving them empty never blocks grading. Own-words is optional too. Each code exercise linked to the part (`parte` in its `ejercicio.json`) gets a box under its statement, numbered, and a part without exercises shows no exercise box: an optional exercise always carries its statement.
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

### Story steps: marks, ground lines and stage share (#261)

- A **mark** names the outcome it approves (`«conexión pedida»`, `«0.50»`), never the move or the tag of its own step: a mark that repeats a `moves[].verb` or an actor's `tag` is `marca-eco` (`explain-check`).
- A **ground line** (a horizontal `paths` entry at the foot of the stage, without an arrow) belongs to a `derivation` declared as a scope or a timeline: `"frame": "scope"` or `"frame": "timeline"`. Anywhere else it is `suelo-sin-sentido` (`scene-gate`). A formula story draws the axes of its function, so it is not measured this way.
- The drawing of each step covers at least a quarter of its stage (the box around its pieces, the ground left out): `escenario-vacio` (`scene-gate`). The floor is calibrated on the approved examples, whose steps run from 27 % to 77 %.
- `tools/register/fixtures/bench261/` holds the four real parts that exposed these rules (Git, TCP, Rust, Bayes). The counts example is `examples/bayes-mil-personas.md` (gated): counts first, then the derivation.

### Visual pieces: verdict cards, memory, joined tables, sets

Six elements draw ideas the scene vocabulary tells badly. Each is declarative JSON in an
`<script type="application/json">`, anchored by ids: a pointer, a connector or a region names
what it reaches and the kit traces it from the boxes the browser drew (`placeMemory`,
`placeTables`), so a note never carries a coordinate. They are HTML, not a canvas: they stack in a
narrow column, follow the three papers (the `--pt-*` tone tokens lighten on dark and black) and
grow in full screen. They live alone or as the stage of a `<lk-story>` step
(`"stage":{"venn":{…}}`); a story-level key (`"venn":{"sets":[…]}`) is inherited by every step, and a
story may mix scene steps and piece steps (the scene canvas exists only if some step uses it). Each
accepts a `caption`, drawn under the piece as its own reading guide.

| Element | Draws | Worked example (gated) |
|---|---|---|
| `lk-cards` | 2–4 verdict cards side by side (stacked on a narrow column): pill, title, a tiny drawing of the case (`refs` chips with `read`/`write`/`value` icons → `target`), one line of reason; the `verdict: "no"` card is tinted red, and only an error earns the tint (NO COMPILA, ERROR, INCORRECTO, RECHAZADO); `verdict: "neutral"` is the contrast between two valid states, untinted with a slate pill (#261). A `read`/`write` icon needs its card's words to say what is read or written (`accesorio-sin-sentido`). For code only (compila / no compila, correcto / error). | `examples/prestamos-rust.md` |
| `lk-memory` | State in numbered steps: each repeats its code line (badge + code), columns (STACK / HEAP, or SESIÓN / DISCO), segmented cells, status pills, a pointer from a cell to its target (`points`), invalid cells dashed and struck with a ✗. | `examples/memoria-string-rust.md`, `examples/plsql-transaccion.md` |
| `lk-tables` | Real tables joined by curved connectors (one colour per match, derived from the data), the `ON` pill and the derived result; `kind: "left"` keeps unmatched rows with `NULL`; `show` reveals tables → links → on → result. Also `group`: rows → groups with value chips and a COUNT badge. | `examples/sql-join-videojuegos.md`, `examples/sql-group-by.md` |
| `lk-venn` | Two or three labelled sets; `fill` lists the exact regions that answer (`a+b` = in A and B only; `a` = A only), `op` names the operation, `says` explains it. One region per story step. | `examples/sql-venn-joins.md` |
| `lk-tree` | A frequency tree: each group is a person (`kind`), each branch carries its count and its rate, the highlighted leaves stand out; two branches per group, laid out by the kit and measured at 1440 and 390 px (labels on their branch, no word over a word, the group's text inside its person). | `examples/bayes-mil-personas.md` |
| `lk-explorer` | A process between several systems over time: a map of the actors, a numbered step list that drives it, a details panel per step and an event log that fills as it runs; a second view draws the same steps as a sequence diagram. | `examples/abrir-una-pagina.md` |

The engine and `explain-check` count a piece as the part's drawn figure (one scene *or* one piece
per part, `pieceOpenCount` in `internal/engine/pieces.go`); its JSON is not prose; a story step that
draws a piece satisfies the derivation rule. `scene-gate` and `scene-lint` measure pieces through
`integrations/pi/kit/piece-gate.mjs` (which runs `piece-measure.mjs` at 1440 and 390 px, one story
step at a time): off-canvas, words under 13 px, ink under 4.5:1, a white island on a night paper,
a connector that misses its anchor (`connector-miss`), a word over a word, a connector or a set
outline over a word. The bridge matrix (`integrations/pi/bridge.test.mjs`, `PIECE_EXAMPLES`)
renders every example through the real reader in light/dark/black × narrow/wide/phone and in full
screen, and writes the element screenshots to `/tmp/vp-shots/`.

### `lk-explorer` — a system map whose focus follows the steps

A scenario — opening a web page, a request through three services, a handshake — is not one
scene: it is **several systems and a sequence over time**. The explorer draws the systems once on a
map and then moves the focus with a numbered step list, the way the learner's reference
(`protocol-explorer-alpha.vercel.app`) does, with our own pieces and drawing: boxes with a character (`kind`), a
name and the detail that identifies the system, dashed links between the actors that talk, and the
payload of each step written on the map.

Use it when the answer to «what happens?» is *who talks to whom, in what order, and what travels*.
Use `<lk-story>` with actors and props when the answer is *who holds what and when it stops being
valid* (§8d): a story has one stage and a narrator, and the explorer has a map, a list, a panel and
a log.

```json
{"title":"Abrir una página web","rows":[["client","router"],["dns","web"]],"views":["map","sequence"],
 "actors":[{"id":"client","name":"Cliente","detail":"192.168.1.10","kind":"person","tone":"blue"},
           {"id":"dns","name":"DNS","detail":"8.8.8.8","kind":"database","tone":"amber"}],
 "links":[{"from":"client","to":"router"},{"from":"router","to":"dns"}],
 "steps":[{"title":"La consulta","subtitle":"pregunta por el nombre","focus":["client","dns"],
   "travels":{"from":"client","to":"dns","label":"www.example.com","kind":"query"},
   "details":{"text":"El cliente no sabe dónde vive ese nombre.","rows":[["URL","www.example.com"],["PUERTO","53"]]},
   "log":{"from":"client","to":"dns","kind":"query","info":"¿A qué IP va?"}}]}
```

- `actors` (2 to 6): `id`, `name`, `detail` (the identifying detail: an address, a port, a role)
  and an optional `kind`: the characters the kit draws (`person`, `house`, `doc`,
  `gear`, `robot`, `coin`, `database`, `server`, `row`, `session`, `lock`, `process`, `packet`). Without `kind` the actor is a box with its name; a `kind` the kit does
  not draw is refused, not drawn empty. `rows` places them in the map's grid — an array of rows of
  ids, `""` for an empty cell — and the phone stacks them in that order.
- `links`: the dashed topology between actors. **Declare links between actors that are adjacent in
  the map**; a link that skips over a card is drawn straight through it and `scene-lint` calls it
  `connector-over-text`.
- `steps` (1 to 8): `title` and `subtitle` for the list, `focus` (the actors that talk in this
  step), `travels` (what moves: `from`, `to`, `label` and a `kind`), `details` (a short paragraph
  and its `rows` of key/value) and `log` (the event row: `from`, `to`, `kind`, `info`).
- `kind` colours the payload and the log row: `query`, `answer`, `syn`, `ack`, `get`, `ok`,
  `render` have a tone of their own, any other word is slate, and `tone` overrides it.
- `views: ["map","sequence"]` adds the second view: one lifeline per actor and one arrow per step,
  with the payload written above the arrow. Without it the explorer is only the map.
- `log` is optional: `"log": false` removes the event log, and a flow where no step has a `log` draws
  none. Otherwise the log fills as the steps advance, and back, play, step and reset drive it.

**The focus dims, it does not crop.** The active step marks its actors (`data-focus`) and the rest
fade; the map never pans or zooms, so the focused actor stays whole at every width — a camera that
zooms would push it out of the canvas on a phone. The transition and the flowing dashes of the
payload arrow are turned off under `prefers-reduced-motion`.

**Everything is placed from measured boxes.** The links leave one actor's border and land on the
other's; the payload label goes to the empty lane the map leaves it — above the row of a
side-by-side pair, the gap between rows when the pair is stacked or diagonal — and the arrow is cut
where the label sits, so no word ends up under a stroke. On a phone the actors stack and the links
run in a right-hand gutter, one lane per link (the longest one outermost), with each card's exit
points ordered so that no two lines cross; the payload runs down a left-hand gutter. The phone margin
is fixed in pixels, so both gutters sit 24 px or more from the panel edge whatever the font size.
On a wide column the map fills its panel: the actors stretch to their rows (up to 12 em each) and the
group is centred when the panel is taller than that. The layout is three panels (list | map | details)
with the log below on a wide column, and map → details → collapsed list on a narrow one. The log is a
table: the header and every row share the same columns, so its five columns sit on one line on a wide
column, and on a phone the information stacks under each row while the header shows the four columns
that have a title. Subtitles are sentence case, with normal tracking. Full screen gives the map the
whole width, with the list and the panel below it.

`measurePiece` (`piece-measure.mjs`) adds the explorer findings, and `scene-gate` /
`scene-lint` run it in light, dark and black at 1440 and 390 px, step by step and once for the sequence view:
`focused-out-of-view` (the focused actor leaves its map or the window), `log-overflow` (a log row is
wider than its box), `travel-over-text` (the payload label covers a word), `map-underfilled` (on a wide
column the actors cover less than 60 % of the panel height, or sit off centre), `log-header-orphan` and
`log-cell-stacked` (a header or a cell falls off its line), `log-cell-wraps` and `log-cell-overflow`
(a cell breaks or overflows its column), `subtitle-style` (a step subtitle in capitals, tracked, or under
13 px) and `link-on-edge` (a line within 8 px of the panel edge, or 20 px on a phone). A connector that
does not reach its anchor is `connector-miss`, and a connector cut by its label declares only the
end it owns (`data-from` on the first half, `data-to` on the second), so both ends are still
measured. Words are measured line by line, so a chip at the end of one line never hides the words
that wrap under it. The bridge matrix (`integrations/pi/bridge.test.mjs`) renders the example through the
real reader in light/dark/black × narrow/wide/phone, steps through every step, opens the sequence
view and full screen, and writes the screenshots to `/tmp/se-shots/`.

Worked example, gated: `integrations/pi/kit/examples/abrir-una-pagina.md` (client, router, DNS
as a `database` and the web server as a `server`; eight steps, the most one explorer takes: the DNS query and its answer, the
TCP handshake (SYN, SYN-ACK, ACK), the HTTP request and its 200 OK, and the browser painting the page).

### `<lk-stage>` — a declared isometric stage

A new figure base (#358), chosen over the old `lk-scene` look and brought up to the approved
isometric map: actors sit in named cells of an isometric grid and the renderer computes their
prisms, their labels, the lane verbs, the step focus and the camera. It does not draw `lk-scene`
primitives. The element reads one inline JSON payload and needs no build step or npm dependency;
`manifest.json` and the reader's page ship `stage.css` and `stage.js` beside `kit.css`/`kit.js`,
and the same file works in light, dark and black themes. The whole figure is laid out to fit a
1440×900 screen: the stage breaks out of the reading column and stays at least 1000 px wide.

**Spec vocabulary (S4).** The payload is one object; every listed key is required unless marked
optional, and nothing else is accepted at any level.

| Level | Keys |
| --- | --- |
| root | `title`, `kicker`, `caption`, `dirt[]`, `route[]` (all optional), `question`, `focus`, `actors[]`, `lanes[]`, `steps[]` |
| `actors[]` | `id`, `kind`, `cell`, `name`, `color` (`#RRGGBB`); a `room` may add `cells[]` and `labelCell`; any actor may add `labelSide` |
| `lanes[]` | `id`, `from`, `to`, `verb`, `identity`, `labelT` (optional path fraction 0–1) |
| `steps[]` | `activeActor`, `highlightLane`, `facts[]`, `narrator[]`, `focusOn[]`; optional `cell`, `cleaned[]`, `signal`, `battery` (0–100) |
| `facts[]` | `identity`, `label`, `value`, `tone` |
| `narrator[]` | a Spanish line, optionally with inline chips `[text\|tone]` |
| `focusOn[]` | one or two `{ "target": "actor:id\|tag:id\|lane:id\|fact:N", "tone": "look\|right\|wrong" }` |

- `cell` is `A1`–`F5` (six columns, five rows). There are **no x/y coordinates anywhere**; placement,
  label placement and camera framing are derived from the cell names.
- `from`, `to`, `identity`, `activeActor` and `fact.identity` are actor ids; `highlightLane` is a lane
  id or `null`. `focus` is one word copied from `question`, highlighted in the heading.
- `fact.tone` ∈ `neutral | good | bad | warn | info`; a chip tone uses the same five values.
- `focusOn` targets resolve against the declared actors, lanes and the facts of that same step;
  `fact:N` is zero-based. `look` outlines in blue, `right` in green and `wrong` in red. A focused
  fact card uses its own single 2 px border; there is no second outline over it. There are at most
  two focus marks per step and they may not overlap or nest; everything else is quieted to ~55 %.
- An authored `route` is a chain of adjacent cells the robot walks; `dirt`/`cleaned`/`signal`
  drive the floor patches and the robot's readout. Step-only specs from before the map keep working:
  the renderer derives a static route from the robot's cell and follows `activeActor` with the camera.
- Kinds (v1): `robot` (blue screen and battery), `room` (flat dirt-spotted floor), `charger` (tall
  prism with a bolt) and `block` (generic prism). Every kind is an isometric prism with a light top,
  mid left face, dark right face and a soft shadow; no kind is invented by the renderer.
- A step's narrator uses base A's grammar: coloured chips such as `[4 % de batería|warn]`. The last
  line of a multi-line step reads as the conclusion.

The stage shows a question with its focus word marked, prisms and shadows on a subtle grid, dashed
lanes that flow and carry their verb pill, a plain caption above the fact cards, and a player with
**only** `←`, `→` and `▶`, step dots and `N/M`. Dots are progress indicators, not buttons; there are
no sliders, inputs, hover-only content or colour legend. The step lines are plain text with inline
chips — no visible «Narrador» label — and no card carries an accent stripe. Dark pills keep ≥ 4.5:1
text contrast even when quieted and leave ≥ 6 px of padding around their labels. Arrow keys move the
steps while the element has focus. Labels are painted in a top layer and placed against the projected
prism silhouettes and the other labels: a verb never covers a name tag, and no cell code is printed.
The camera fits the declared actors and their labels with even margins, then eases toward the active
actor step by step. One easing curve (`cubic-bezier(.2,.8,.2,1)`, 150–420 ms) covers the camera, the
lanes and the step lines; `prefers-reduced-motion` settles every step at once. `▶` advances one step
per tick and stops on a second click.

```html
<lk-stage>
<script type="application/json">
{
  "caption": "Sigue el recorrido y lee qué cambia en cada paso.",
  "question": "¿Qué acciones elijo para maximizar la recompensa total?",
  "focus": "acciones",
  "actors": [
    { "id": "robot", "kind": "robot", "cell": "B3", "name": "Robot", "color": "#5AB0FF" },
    { "id": "charger", "kind": "charger", "cell": "E4", "name": "Cargador", "color": "#5FD6A4" }
  ],
  "lanes": [
    { "id": "charge", "from": "robot", "to": "charger", "verb": "cargar", "identity": "charger" }
  ],
  "steps": [
    {
      "activeActor": "robot", "battery": 4, "highlightLane": null,
      "facts": [{ "identity": "robot", "label": "Batería", "value": "4 %", "tone": "warn" }],
      "narrator": ["Le queda [4 % de batería|warn]."],
      "focusOn": [{ "target": "actor:robot", "tone": "look" }]
    }
  ]
}
</script>
</lk-stage>
```

Invalid specs fail loudly at authoring time: the error names the offending value and the path it was
written at, for example `actors[0].cell: "Z9" is not a cell`,
`steps[1].activeActor: "robo" is not an actor`, `actors[0].x: unknown key "x"`,
`steps[0].focusOn[0].target: "nope:robot" must be actor:, tag:, lane: or fact:`, or
`steps[0].focusOn[0].tone: "loud" is not a focus tone`. A page that still renders an invalid payload
shows that message inside the element (`role="alert"`) instead of a broken figure. Worked, gated
example: `integrations/pi/kit/examples/lk-stage-robot.html`; the real-browser S18–S22 gate is
`integrations/pi/kit/test/stage.test.mjs`.

### The other four step figures and Mermaid (T9)

`lk-codestep`, `lk-tablestep`, `lk-guided` and `lk-lanes` join `lk-stage` in
`manifest.json` and in every page the bridge builds: each classic script is loaded with its CSS,
and each reads one `<script type="application/json">` child. DOMPurify's allow-list in
`view/app.js` keeps those five names and their JSON children. On a wide page all five break out of
the two-column prose into a centred `min(1280px, 100vw - 64px)` figure.

Mermaid diagrams (`mermaid`, `flowchart`, `sequence`, Gantt and the other structural families) keep
using Mermaid, now themed by `kit/mermaid-theme.js`: the reader calls `LkMermaidTheme.initialize()`
before `mermaid.run()`. The night variant reads `--paper`, `--ink` and the accent tokens from the
kit, so `black` stays neutral black instead of a navy white-paper island. The old white-paper CSS
rule was removed.

The visual counters (`bridge.ts` `countVisuals` and the Go engine), the browser gate and
`tools/visuals/audit-note.mjs` recognise all five elements. The authoring gate runs each element's
DOM-free validator on its JSON child and names the element, its index in the note, the failing path
and the offending value. Old figures (`lk-figure`, `lk-scene`, `lk-story`, `lk-walkthrough`) still
render and still count; the `Cómo leerlo` guide line is still required for every new figure.

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

Quiz responses are `{questions, answered, verdicts, exercises}`; `exercises` lists the part's code exercises as `{id,titulo,enunciado}` and is empty when the part has none. Questions have `id`,
`enunciado` and an A–E `options` object, without keys, in the order the learner sees: shuffled per learner and question, «No sé» last. The file route never serves `quiz.json`, `quiz.answers.json` or `mini-quiz/*.json`. `answered` is null or a
graded array of `{id,chosen,correct,ok,razonamiento,confianza}` (`chosen` and `correct` are the letters shown; the answers file keeps the tutor's own letters; the bridge
format; a file written by the older two-prompt page is still read and merged). It also accepts a grading object with `results`, `score`, `reasoning`
(or `razonamientos`) and optional `answers`, `ownWords`, `exercises`. Verdicts
are an array of `{codigo,estado,pregunta,evidencia}`; a concept-ID map to
`{veredicto,evidencia}` is also accepted. Submissions use JSON:

- Video: `{kind:'video', topic, part}`.
- Audio: `{kind:'audio', topic, part, style}` with `style` one of `debate`,
  `entrevista`, `charla`, `formal`; anything else is rejected with 400.
- Question: `{kind:'question', topic, part, text}`.
- Quiz: `{kind:'mini-quiz', topic, part, answers, reasoning, ownWords?, exercises?}`, where `exercises` maps the part's exercise ids to the learner's text. Blank answers are dropped; any other id, or a value that is not text, is refused with 400.
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
screen. A demo page is one scroller, its frame: it nests no scroll container, sets no
full-height `html`/`body`, keeps its text at 14 px or more and wraps its code (see
"Demo frame and page rules" in `study-view-format.md`). Keep review questions at the end. Use vertical Mermaid for decision
trees; use SVG where spatial relationships genuinely clarify the example.

Use the shared white-paper palette and system DejaVu Sans / DejaVu Sans Mono;
**no external fonts**. No network except same-origin bridge endpoints and pinned,
SRI-protected CDN libraries. The kit lazily loads KaTeX 0.16.22 (CSS/JS) and
Mermaid 11.6.0 only when used. It does not need marked or DOMPurify: fetched
strings are rendered as text, never HTML. Handle network errors visibly and
inspect desktop/mobile layouts and keyboard operation before delivery.

Reference: `integrations/pi/kit/examples/rl-parte-3.html` (serve through the bridge;
the relative kit URLs intentionally target the bridge route).
