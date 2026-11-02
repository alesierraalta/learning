# Study view: content, not page design

> A part's main page is now its rich HTML page written with the kit (`docs/kit.md`):
> the complete explanation with richer visuals, inline demos, the connected quiz and
> the video button. This Markdown guide still governs the `.md` note the vault and the
> engine keep, and quick notes.

Builders write Markdown and learning material only. The shared view supplies the
Distill Academic layout from the rendered videos: white paper, DejaVu Sans body
and bold headings, DejaVu Sans Mono code and table cells, restrained semantic
accents, a single centered column, numbered sections, tables, callouts and diagrams.
The view derives a small uppercase part kicker from `# Parte N — Title`; a trailing
parenthesized subject becomes its short label (e.g. `PARTE 3 · WHERE`).
Do not plan or build a separate page for each part. Planning and maps stay in
Markdown notes; they do not need custom HTML pages.

## Structure a part (Pure Method)

Start with a one-sentence formal definition, then the part title and video.
Use numbered level-two headings such as `## 1. Por qué existe`; the view separates
the section number automatically. Keep one concrete example running throughout.

1. Explain the practical problem: what fails without this concept?
2. Break down the pieces using everyday questions.
3. Walk through discrete steps; write list items starting with `T0`, `T1`, `T2`.
4. Move from intuition to a decision table to the formal rule or function.
   Show calculations and validations line by line.
5. State critical distinctions directly, e.g. `Una fila ≠ una tabla` in its own
   paragraph. Include an explicit “Dónde se rompe la analogía” section.
6. Include a binary decision tree: “El mapa mental más importante”.
7. Close with `Entrada ➔ Proceso ➔ Salida` in its own paragraph, a table with one
   line per concept, and three takeaway bullets.
8. Include a quick-quiz checkpoint in every explanatory point (`> [!question] Quiz rápido — Punto N` or `<lk-quick-quiz>`), evaluating the immediate concept with options A–E and recording telemetry (right/wrong, why, and adaptive category across any topic: sciences, medicine, languages, humanities, finance, code).
9. Supply the required final mini-quiz (five A–E questions, E = “No sé”) and two practical
   exercises (Easy and Medium). The tutor supplies the quiz JSON sidecar; the view
   renders the answer/reasoning controls. Do not hand-build a quiz form.

## Markdown components

```markdown
## 2. Cómo funciona

- T0: Estado inicial.
- T1: Aparece una fila. ◄── NUEVO
- T2: La restricción impide guardarla. ◄── BLOQUEO

> [!note] Regla
> Una idea breve, con **énfasis** o `código`.

> [!warning] Límite
> Describe cuándo deja de funcionar.

> [!success]- Comprobar después
> Contenido plegado inicialmente.
```

Callouts use `> [!type] Title`: `note`, `info`, `video` use cobalt;
`tip`, `success`, `check` use emerald; `warning`, `caution`, `attention` use amber;
`danger`, `failure`, `bug`, `error` use crimson. Labels carry meaning as well as
color. Add `-` for collapsed details or `+` for initially expanded details.

Use normal Markdown tables with a header row for decisions and comparisons.
Use fenced code blocks with a language (e.g. `sql`); no screenshots of code.
Keep tables and code short; wide content scrolls rather than shrinking text.
Markers are highlighted in prose, not inside literal code blocks.

Use fenced `mermaid` diagrams, vertically (`flowchart TD` or `direction TB`),
with short labels and preferably under 400px wide. The view centers diagrams
and provides white boxes, fine borders and sans-serif labels:

````markdown
```mermaid
flowchart TD
  A[Entrada] --> B{¿Es válida?}
  B -->|Sí| C[Guardar]
  B -->|No| D[Rechazar]
```
````

SVG diagrams can be inline `<svg>…</svg>` or enclosed in a fenced `svg` block.
The reader renders both through the same sanitizer: event handlers, external
images, `use` and `foreignObject` are not allowed. Use a `text` or `html` fence
when showing SVG source as a code example instead of drawing it.

## Video and optional interactive demos

Store videos under `explicaciones/adjuntos/` and embed by filename:

```markdown
> [!video] Explicación en video
> ![[Parte N - slug.mp4]]
```

Only genuinely interactive experiments need standalone demo HTML, named
`explicaciones/demos/<part>-<name>.html` (e.g. `p3-filtro.html`). The bridge
discovers them; do not insert iframes into the note. Demos run in sandboxed
iframes with scripts allowed, without same-origin access. To send an observation
to the question box:

```js
parent.postMessage({ type: "learning-demo", observation: "El filtro excluyó dos filas." }, "*");
```

The parent checks the sending iframe and payload type. Observations (prefixed
with the demo filename, capped at 2,000 characters) populate the question box;
the learner still submits them to the tutor. Do not send secrets or answers
through this channel.

## The video control belongs to every node

The video is not optional furniture: every part node must offer a way to get it, and the
reader adds it automatically. When `explicaciones/adjuntos/Parte N - <slug>.mp4` exists it
renders the player; otherwise it shows **«🎬 Generar video»**, which posts
`{kind: "video", topic, part}` to the chat and polls the file until it appears. A rich page
keeps the same guarantee through `<lk-video></lk-video>`; the bridge injects the component
(and `kit.js`/`kit.css`) when the page forgot it. Do not hard-code a second player, a custom
button or a page-specific script.

## Checkpoints in the middle of a node

A rich page can quiz inside a section with `lk-checkpoint`. It takes an inline JSON array,
gives immediate local feedback and never calls the engine, so it fits after a formula or a
distinction the learner must apply before moving on. The graded five-question `lk-quiz`
still closes the part; checkpoints are ungraded self-checks.

```html
<lk-checkpoint>
[
  {"q": "¿Qué devuelve evaluar la política en un estado?",
   "options": ["Una acción", "El valor esperado de seguirla", "La recompensa inmediata"],
   "answer": 1,
   "why": "La evaluación de política estima v(s): lo que se espera ganar siguiéndola desde ahí."}
]
</lk-checkpoint>
```

Keep one to three questions per checkpoint, plausible distractors and a one-sentence
`why`. Do not repeat the mini-quiz questions; a checkpoint checks the step just read.

## Do not

- Design a per-part page, stylesheet, hero, dashboard or navigation shell.
- Add inline HTML styling, scripts, event handlers, remote fonts or dependencies.
- Draw ASCII boxes/arrows or horizontal diagram flows; use vertical Mermaid.
- Use dark backgrounds, gradients, decorative animation or color-only meaning.
- Duplicate the view’s quiz, verdicts, results, reward banner or tutor controls.
