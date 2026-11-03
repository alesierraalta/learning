Objective: on a phone the reader's bar stops eating the screen. Nine controls become one compact row plus an overflow menu, so the text gets the screen instead of the chrome.
Branch: feat/video-narration-parity · Delivery: ask-on-risk · Runner: `node --test studio/layout.test.mjs`, visual check at 390×844.

## Specs

- S1 (one row): at `max-width: 720px` the reader bar is a single row no taller than 56px. `Volver`, the truncated title and the overflow trigger are always visible; `Descargar`, `Preguntar`, `Sugerir`, `Regenerar` and `Borrar` live inside the overflow menu. ("solamente deja una parte muy pequeña de la pantalla ... aprovechable para la lectura real")
- S2 (nothing lost): every action reachable before the change stays reachable, with the same handler and the same destructive confirmation for `Borrar`.
- S3 (desktop unchanged): above 720px the bar keeps its current single row with all controls visible.
- S4 (height math): the reading surface is sized from the bar's real height, so the document is never pushed under it and never clipped.
- S5 (tests): `studio/layout.test.mjs` asserts one row, the overflow trigger's accessible name, the five menu entries, and that `Borrar` still asks before deleting.

## Tasks

- T1 bar: single-row mobile layout plus overflow menu in `studio/ui/studio.js` and `studio/ui/studio.css` (S1-S4) — worker — commit
- T2 tests: layout assertions for row, menu contents and delete confirmation (S5) — worker — commit

## Log

- L1 (2026-11-03, user, verbatim): "Ah, o sea, en teléfono. El header que muestra que si el botón de borrado y todas esas cosas es Que los mente grandes. Pero verdad, un grande que No deja visualizar bien el resto del contenido, por lo cual se hace bastante incómodo. Y solamente deja una parte muy pequeña de la pantalla de la pantalla aprovechable para... Para la lectura real."
- L2: diagnosis — `studio/ui/studio.js:1305-1352` builds nine controls; `@media (max-width:720px)` at `studio/ui/studio.css:321-327` wraps them into two rows (`::after { flex-basis:100% }` at `:322`) with 38px targets, while `.reader` already reserves `calc(100vh - var(--topbar))` (`:188`) with `--topbar: 54px` (`:315`).
- L3: the `.switch` slot at `studio/ui/studio.css:192-194` is styled but no code creates it; it is the natural home for the reading-mode control of Tanda 2 and must not be repurposed here.
