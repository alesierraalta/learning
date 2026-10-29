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
L7. PR 24 merged as `9367804`, CI and Deploy green; the VPS runs that build with `learning-studio` and `learnings-backup.timer` active. Live proof: `scratch/live-deck-audit.mjs` walked all 13 decks of `/home/ale/Learnings/rapidos/lstm.md` at 390x844 and reported `{"decks":13,"problems":0}`, and `scratch/live-order-check.mjs` returned the quick list in the same order as `ls -t rapidos/*.md`.
L8. The live screenshot of the «red simple» deck showed the arrow's own label «marca singular» reading as if it sat on the arrowhead. The first gate rule inflated the arrow's bounding box and reported 46 false collisions, all four pixels wide; the rule now measures the shaft only (a vertical `line`, text x-range across it, more than 2 px of overlap) and the installed note passes with 0 problems, so the collision was aesthetic rather than measured. PR 25 (`abdef91`) extends the gate to the shaft rule and is on `main`; the deck itself still gets more room around that arrow so the label never reads as touching the head.

S4. Una etiqueta no puede quedar encima de una flecha: ni sobre el tallo ni sobre la punta, y da igual que la flecha sea recta o curvada. Si la etiqueta nombra la flecha, va al lado, no encima.

### T6. Que la puerta vea también las flechas curvadas
Risk: item 3 (la regla que se promete a toda nota).
Estado: abierto.

La medición en vivo de la nota de LSTM destapó una ceguera: en la diapositiva 1, paso 1, la etiqueta «hay que recordarlo» se dibuja sobre la punta de la flecha y `tools/deck-gate.mjs` informa `problems: 0`. La causa probable es que la comprobación `text-over-arrow` solo mira elementos `line` (tallo recto) y las flechas con `bend` se dibujan como `path`. Arreglo: la puerta debe medir la geometría dibujada de toda flecha, recta o curvada, incluida la punta; y la nota debe colocar esa etiqueta al lado. Antes del arreglo esa diapositiva tiene que fallar; después, pasar.

L7. Comprobación en vivo tras desplegar el arreglo del título: `{"decks":13,"squeezed":[],"widestSentence":{"title":"El plural que hay que recordar","share":0.99},"pageErrors":[]}` — el título pasó del 43 % al 99 % del ancho. La captura `scratch/live-deck-title-390.png` muestra además la etiqueta «hay que recordarlo» encima de la punta de la flecha, con la puerta informando `problems: 0`: la ceguera queda registrada en T6.

L7. T6 cerrado. La puerta medía solo tallos rectos (`line`), así que una etiqueta sobre una flecha curvada o sobre la punta pasaba con `problems: 0`. Ahora `tools/deck-gate.mjs` muestrea el trazo real de cada flecha (`line` y `path`) en coordenadas de pantalla con `getScreenCTM`, ignora los 5 px de cada extremo (ambos caen sobre el borde de una caja, donde un descendente que roza la flecha no es una etiqueta encima) y compara contra la caja del texto con 3 px de margen interior. Al medir la nota real salieron 26 etiquetas sobre el trazo: no era un caso aislado, era el idioma de las diapositivas (el componente dibujaba `label` centrada en la línea). El arreglo es del componente, no de 26 contenidos: `integrations/pi/kit/kit.js` corta la flecha donde van sus palabras —tramo, palabras, tramo con la punta, como se dibuja a mano una flecha etiquetada— y solo si la flecha es demasiado corta para cortarla pasa la etiqueta al lado con el anclaje hacia el lado con sitio. Resultado: `node tools/deck-gate.mjs scratch/lstm-sections.md` → `problems: 0` GATE PASSED, y el fixture `scratch/gate-probe.md` (etiqueta libre encima del tallo) sigue fallando con `text-over-arrow`. Regresión en `integrations/pi/bridge.test.mjs`: «an arrow carries its words beside it, never on the line» exige cero tinta dentro de la etiqueta, una sola punta y el tallo cortado. Suite completa 155 pruebas / 146 pasan / 9 saltadas.

L8. Publicado y verificado en producción. PR 31 → merge 8363b2f; CI y Deploy verdes; `/home/ale/learning` limpio en 8363b2f con el estudio activo. En el VPS, a 390 px: la auditoría de las 13 diapositivas da `{"decks":13,"problems":0,"errors":[]}` y el barrido de tinta dentro de las etiquetas da `{"hits":0}` (52 antes del corte). Captura `scratch/live-arrow/deck1-step1-390.png`: «hay que recordarlo» queda en el hueco de la flecha, legible, con la punta debajo apuntando a la caja. La nota del vault no se tocó: el cambio es del componente, así que basta el despliegue de la app.
