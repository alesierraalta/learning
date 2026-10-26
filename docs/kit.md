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

<lk-video></lk-video>
<lk-quiz></lk-quiz>
<lk-ask></lk-ask>
```

Diagram positions use an 80-pixel grid; boxes are 190 × 70 pixels. Leave at least
three grid units between centers. `kind` is `box`, `agent`, `env`, `store`, or
`decision`. Dimensions are SVG viewBox pixels; diagrams scale to the column.
Use short labels and inspect the result for overlapping edges and text.

`lk-walkthrough` is the deck's own visual language, step by step: each step is a `scene`
in the tutorial's primitives (`sheets`, `boxes`, `arrows`, `labels`, `badges`, `dashed`, `gears`,
`nodes`), and the learner reveals them with «Siguiente», «Anterior», the dots, or the arrow keys.
Keep every step on the same coordinates so the figure grows instead of moving, put the sentence
that explains the step in its `text`, and keep labels short: below 640 px the stage scrolls
sideways with a hint instead of shrinking the letters.

A page with a walkthrough must load the drawing vocabulary first, because `kit.js` takes it from
`window.LKScene` and throws «Falta scene.js» otherwise:

```html
<script src="../kit/scene.js" defer></script>
<script src="../kit/kit.js" defer></script>
```

Later steps paint over earlier ones, so a `dashed` highlight that must not hide what it marks
needs `"fill": "none"`.

`lk-quiz` fetches questions and requires only a choice for each. The `razonamiento` box — where
the learner drains what they are thinking, typed or dictated with the microphone button — and
`confianza` (`seguro`, `dudo`, `adivine`) are optional extras that show the tutor how the learner
reasons; leaving them empty never blocks grading. Own-words and exercise fields are optional too.
It displays server grading and restored read-only answers
and concept verdicts. Never put answer keys in the page. Exercise instructions
remain page-authored content. `lk-video` checks availability with HEAD and polls
every 30 seconds after requesting generation. `lk-ask` sends a question.
Without bridge config these three show the instruction to open the page in Pi;
all local demos, diagrams, steps, and mathematics remain usable.

## Injected config

The bridge injects this **first in head**; builders must not hardcode tokens:

```js
window.LEARNING_BRIDGE = {
  submitUrl: '/<token>/submit',
  quizUrl: '/<token>/api/quiz?topic=<topic>&part=<part>',
  topic: '<topic>', part: '<part>',
  video: 'file/explicaciones/adjuntos/Parte N - Name.mp4'
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
