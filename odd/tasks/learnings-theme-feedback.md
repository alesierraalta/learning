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

## Delivery strategy

Three reviewable work units on `feat/learnings-theme-feedback-regenerate`, in this
order, each self-contained enough to read alone:

1. `7a8d87b` — the dark paper: theme tokens, the bootstrap, the toggle, the frames.
2. `c13535b` — the dialog and the store: sugerencias, regeneration backup, dictation.
3. `af33e26` — the five TSP fixes, each with the test that was red before it.

The slice is larger than the 400-line guideline (the three commits hold ~1440
authored lines). It stays as three units because splitting a theme change away from
the pages it repaints, or a fix away from its witness test, would make each unit
harder to judge than the whole diff. Push and pull request remain the user's call.

## Delivery

- Branch `feat/learnings-theme-feedback-regenerate`, pushed to `origin`.
- Pull request: [#82](https://github.com/alesierraalta/learning/pull/82), base `main`,
  five commits, seventeen files.
- Delivery follows the repository's own path: merge to `main` runs
  `.github/workflows/deploy.yml` on the VPS self-hosted runner, which calls
  `deploy/vps/update.sh` (fast-forward, rebuild, restart, health).
- First attempt (2026-11-03) found that path switched off: the workflow was
  `disabled_manually` and no self-hosted runner existed, so the merge created no
  run. The deploy was done over SSH instead (`fleet.sh vps 'bash
  ~/learning/deploy/vps/update.sh'`, health OK at `d179ee1`). The workflow was
  re-enabled and the runner reinstalled the same day; a `workflow_dispatch` run
  then deployed `d179ee1` in 24 s, and the documentation fix that followed
  deployed through the same path.

## TSP findings (test-strategy / 2026-11-03)

Five defects found after the feature landed, each pinned by a test that was red
before the fix and is green now. No product contract changed: every fix makes an
existing promise true.

| Finding | Where | Promise it broke | Pinned by | Fix |
|---|---|---|---|---|
| F8 | `studio/sugerencias.ts` | an empty but healthy store is not corruption | server.test.mjs · *a store with no suggestions is not a broken store* | keep-aside only when something is actually dropped |
| F9 | `studio/sugerencias.ts` | an unreadable entry is never lost | server.test.mjs · *an entry the store cannot read is never thrown away* | dropped entries are copied to `sugerencias.corrupta-*` before the rewrite |
| F10 | `studio/sugerencias.ts` | a request either stores and says so, or refuses and stores nothing | server.test.mjs · *recording a suggestion never half-succeeds* | preferences move first and their failure never costs the words |
| F11 | `integrations/pi/bridge.ts` | two backups never overwrite each other | bridge.test.mjs · *two regenerations in the same millisecond keep both previous versions* | a taken trash folder gets a `-2` suffix |
| F12 | `studio/server.ts` | a refused regeneration leaves the part in the library | server.test.mjs · *a regeneration that is refused never moves the part* | the prompt is built and measured before the first write |

## Visual pass (real browser, 2026-11-03)

The suites were green, so the surfaces were opened in Chromium against a fixture
vault (rich page, note, mini-quiz) and measured, not eyeballed:

- Studio home, topic list, reader bar and the dialog read correctly in the dark
  paper; the reader bar still fits «Guardada en este dispositivo» + Preguntar +
  Sugerir + Regenerar + Borrar at 1440 px.
- **The figure island was unreadable.** `:root[data-theme="dark"] .lk-walkthrough`
  reset every token but not the inherited `color`, so a caption inherited the
  dark page's light ink on the island's white paper (measured: figure background
  `#fff`, text `rgb(227, 235, 239)`). Fixed with `color: var(--ink)` on the island
  and on `pre.mermaid`.
- **The dialog asked for prose in a code face.** The textarea arrived with
  `Liberation Mono 14px`; it is the one box where the learner writes their own
  words, so it now uses `--sans` at `.97rem`.
- Measured and left alone: the disabled accept button is `opacity: .45` with
  `cursor: default`, so «asks for a reason first» is visible; pressed chips invert
  to the ink surface in both papers, which is the design system's own idiom.

## Log

- L1 (user): «modo oscuro en learnings, un botón de "regenerar parte" y que te
  diga, por qué quieres regenerar parte? y una casilla de feedback con dictado
  donde puedas poner tus ideas, y que la telemetría y feedback vaya mejorando a
  medida que lo usas y le vas dando feedback»
- L2 (user decisions): regenerar = página rica + nota + mini-quiz, versión
  anterior a `.papelera`, video conservado; feedback = directrices + ajuste
  automático de preferencias; modo oscuro = estudio + lector + páginas ricas.
