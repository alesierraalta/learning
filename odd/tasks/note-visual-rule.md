# Note visual rule and quick-note order

The reader must never draw text outside its box, and that guarantee belongs to every note, not to the one that exposed it. The home page lists quick notes newest first.

## Specs

S1. «te pedi que esto no pasara mas» — the screenshot `{634DABA4-ADF9-4AA3-8748-233EB2F3DC11}.png` shows a walkthrough box whose italic sub-line («plural, ocho antes») runs past the box borders.
S2. «esto debe ser una regla para todas las notas» — the guarantee must be enforced by the product for any note that carries a `lk-walkthrough`, quick or university, authored today or later; not only for `rapidos/lstm.md`.
S3. «en notas rapidas debe ordenarse por orden de uso» / «las mas recientes» — the «Notas rápidas» section lists the most recently used note first.

## Tasks

| ID | Specs | Route | Commit |
| --- | --- | --- | --- |
| T1 | S1-S3 | inline: this document | 1415091 |
| T2 | S1, S2 | inline: the renderer measures and fits every box and grid word | pending |
| T3 | S3 | inline: quick notes sorted newest first | pending |
| T4 | S1 | inline: real-browser gate over the installed note, retune what it flags | pending |
| T5 | S1-S3 | inline: checks, delivery, memory | pending |

## Log

L1. «C:\Users\ismar\AppData\Local\...\{634DABA4-ADF9-4AA3-8748-233EB2F3DC11}.png te pedi que esto no pasara mas, y ademas lo que hablamos, esto debe ser una regla para todas las notas, y en notas rapidas debe ordenarse por orden de uso»
L2. Root cause: `/home/alesierraalta/documents/learning/integrations/pi/kit/scene.js:51-54` draws a box sub-line at a fixed `font-size="22"` with no width limit, and `/home/alesierraalta/documents/learning/integrations/pi/kit/kit.js` inlines the whole SVG without measuring it. The authoring gate estimated width from a character count (`0.56 * size`), which is not the real font metric, so the deck passed the gate and still overflowed. Sort gap: `/home/alesierraalta/documents/learning/studio/server.ts:392-402` lists `rapidos/*.md` in filesystem order.
L3. Chosen fix: measure in the renderer (every note, every author) and keep the authoring gate as an early warning, never as the guarantee.
L4. `scene.js` now stamps every `box` label/sub and every `grid` header/cell with `data-fit` (the room it has) and `kit.js` runs `fitStage()` after appending the deck: it shows every step group so hidden text can be measured, shrinks the type in up to four passes down to 55% of the authored size, and only then squeezes glyph spacing. New browser test «a long word never leaves its walkthrough box» failed before the change (`{"text":"sin corrección, la p","inside":false,"size":26}`) and passes after it.
L5. The measured-gate lesson is now in `docs/kit.md`: a character count is not a measurement, and a free label over a box is a collision, not a label. `scratch/gate-decks.mjs` is the real-browser gate over a note file (spill, label-over-box, text-over-text); it reports 0 problems on `scratch/lstm-sections.md` with the renderer fix in place.
L6. Ordering: `studio/server.ts` library() now carries `used: statSync(file).mtimeMs` per quick note, sorts `b.used - a.used || a.id.localeCompare(b.id)` and drops the field before responding. Test «the library lists the most recently used quick note first» was RED without the change and GREEN with it; `docs/studio.md` documents the order.
