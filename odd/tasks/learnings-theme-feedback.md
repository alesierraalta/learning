# Learnings: dark mode, part regeneration and learner feedback

Feature for the Learning studio: a dark theme across every reading surface, a
«Regenerar parte» action that asks why, and a feedback box with dictation whose
ideas adjust preferences and reach the tutor.

## Specs

- S1. Modo oscuro en learnings: the studio shell, the reader page and the rich
  kit pages share one dark theme; a control switches it, the choice is remembered
  per browser, and the first visit follows the operating system theme.
- S2. «un botón de "regenerar parte"»: every written part offers it in the reader.
- S3. Before regenerating, the system asks «¿Por qué quieres regenerar esta
  parte?» and regenerates only with a motive (a chosen reason or written text).
- S4. Regenerating rewrites the rich page, the Markdown note and the mini-quiz of
  that part; the existing video is kept, and the previous version moves to
  `.papelera/` with its manifest entry, never destroyed.
- S5. «una casilla de feedback con dictado donde puedas poner tus ideas»: each
  part offers a feedback box with optional reason chips, free text and dictation.
- S6. Every feedback entry is stored in the vault with topic, part, reasons,
  text, origin (`sugerencia` or `regenerar`) and timestamp.
- S7. Stored feedback becomes tutor directives: when the tutor writes or
  regenerates a part it receives the accumulated directives, bounded and deduped.
- S8. Chosen reasons adjust the learner's preferences automatically by one level
  (`menos`/`medio`/`más`) per mapped aspect, without touching unrelated aspects.
- S9. Quiz telemetry is summarized into the same tutor context, so explanations
  keep adapting as the learner uses the system.
- S10. Feedback and directives stay inside the vault, validated on read and
  written atomically; malformed stored data never breaks the studio.

## Tasks

| ID | Spec | Change | Route | Commit |
|---|---|---|---|---|
| T1 | S1, S10 | Dark theme tokens for `studio/ui/studio.css`, `integrations/pi/view/app.css`, `integrations/pi/kit/kit.css`; toggle persisted per browser; theme propagated to the bridge frames; reader/kit bootstrap honors system theme and live changes | inline | `7a8d87b` |
| T2 | S6-S9 | `studio/sugerencias.ts`: validated store, preference deltas, derived directives, tutor context from telemetry; studio routes `api/sugerencias` (GET/POST) and `api/transcribe` proxy | inline | `c2542f5` |
| T3 | S2-S5 | Reader UI: «Regenerar» and «Sugerencias» actions, modal with reason chips, free text, dictation, required motive for regeneration | inline | `c2542f5` |
| T4 | S7-S9 | Compose write/regenerate prompts with the tutor context; regeneration prompt asks for page + note + mini-quiz and points at the backup; docs updated | inline | `c2542f5` |

## Verification

- `node --test studio/server.test.mjs` 45/45, `studio/layout.test.mjs` 52/52 (`node --test`, sequential), `studio/telemetry.test.mjs` 8/8, `studio/panorama.test.mjs` 11/11, `studio/offline.test.mjs` 18/18, `integrations/pi/theme.test.mjs` 3/3, `integrations/pi/bridge.test.mjs` 66 pass 0 fail, `go test ./...` ok.
- `7a8d87b` re-checked alone in a clean worktree (`git worktree add /tmp/verify-a 7a8d87b`): 43/43 tests, `node --check studio/ui/studio.js` clean.
- `node_modules/` is absent in this clone, so every `@earendil-works/pi-coding-agent` and `typebox` diagnostic in `integrations/pi/*.ts` is pre-existing and environmental, not a regression of this feature.

## Design notes

- The bridge frames are another origin, so the theme travels as a `theme` query
  parameter on the frame URL plus a `postMessage` for live switching; the bridge
  injects the bootstrap script into every page it serves.
- Figures keep a light surface in dark mode: `scene.js` draws fixed light-paper
  SVG, and inverting it would break the authored palette.
- Dictation reuses the bridge transcriber through a studio `api/transcribe`
  proxy (token stays server-side); without a transcriber the browser Web Speech
  path is used.
- "Feedback" already names an engine stage artifact (`feedback/{part}.json`), so
  the learner's ideas are `sugerencias` on disk and in code.

## Log

- L1 (user): «modo oscuro en learnings, un botón de "regenerar parte" y que te
  diga, por qué quieres regenerar parte? y una casilla de feedback con dictado
  donde puedas poner tus ideas, y que la telemetría y feedback vaya mejorando a
  medida que lo usas y le vas dando feedback»
- L2 (user decisions): regenerar = página rica + nota + mini-quiz, versión
  anterior a `.papelera`, video conservado; feedback = directrices + ajuste
  automático de preferencias; modo oscuro = estudio + lector + páginas ricas.
