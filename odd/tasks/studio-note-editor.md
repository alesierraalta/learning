# Studio note editor

Write and edit quick notes from inside the studio, so Obsidian stops being required. Files stay the source of truth.

## Specs

S1. The user can create and edit a quick note from the studio on phone and desktop, without opening Obsidian: «ya no hace falta que la nota esté en el en el baúl de Obsidian… ya quitar todo de Obsidian» (m02832), choosing option A: «Archivos + editor dentro de la app (recomendado)».

S2. A note is only stored if its guided decks are sound. The save is refused, with the exact problems listed, when a deck block is malformed, a deck is wider than 360, a step is missing its scene, or a box label does not fit its own box. The rule the user asked for is enforced at the door: «esto no debe pasar mas… esto debe ser una regla para todas las notas» (m02304).

S3. The stored note keeps being `rapidos/<id>.md` in the private Git repo, so history, diff and the hourly backup keep working. Saving never lets a request write outside `rapidos/`.

S4. A save is refused, not silently merged, when the file changed since the editor loaded it; the answer carries the current `rev` so the editor can reload.

S5. A note created from the studio appears first in the library, because quick notes are listed by most recent use.

S6. La vista previa muestra el borrador mientras se escribe, sin guardarlo: no se escribe ningún archivo en el vault, una diapositiva rota se puede previsualizar igual porque la vista previa sirve para escribir y no para aprobar, y el servidor que la genera no acepta cuerpos de otros orígenes ni de más de 200 000 caracteres.

## Tasks

T1. Promote the deck rules from `scratch/validate-walkthroughs.mjs` into `tools/deck-lint.mjs` (pure, no browser) and have `tools/deck-gate.mjs` run it before measuring. (S2)
T2. Bridge write path: `writeQuickNote(root, { quick, title, body, rev })` with slug rules, atomic temp+rename inside `rapidos/`, rev guard and size limit. (S3, S4)
T3. Studio API: `GET /<token>/api/note?quick=<id>` returns `{ id, title, body, rev }`; `POST /<token>/save-note` creates or updates and answers `{ ok, id, rev, created }` or the lint/rev error. (S1–S4)
T4. Studio UI: an editor view reachable from the library (new note and edit this note), markdown textarea, live preview through the real reader, save/cancel, and the server's problems shown verbatim. (S1, S2)
T5. Browser test: create a note in the studio, see it at the top of the library, open it in the reader, edit it, and confirm the change; plus a refused save showing the deck problem. (S1, S2, S4, S5)
T6. Docs: `docs/studio.md` describes the editor, the rev rule and that the vault stays the source of truth.
T8. Vista previa del borrador: una ruta renderiza un cuerpo enviado con el mismo lector y el editor apunta el marco a esa vista mientras se escribe. Pruebas: render sin escribir archivo, cuerpo enorme rechazado, origen ajeno rechazado, y una prueba de navegador que teclea una diapositiva y la ve sin guardar. (S6) Risk: item 3 and item 2 — the route renders submitted content and adds an HTTP surface.
T9. Mover «Pantalla completa» a su propia fila para que un título largo de diapositiva no se parta en cuatro líneas en columnas estrechas. (S2) Risk: item 3 — shared reader contract.
T7. Verify and deliver: full suite, gate on a generated note, PR, CI, deploy, live check that creates and deletes its own scratch note.

## Log

L1. «Pero es lo que te había dicho. Si quieres, ya no hace falta que la nota esté en el en el baúl de Obsidian. Podemos simplemente armar un backend dentro de la BPS con toda la base de datos con toda la información. No sé cómo tú quieras. Y ya quitar todo de Obsidian. Porque, como te digo, yo utilizo Obsidian por esa facilidad. Pero ahora que hay más facilidades de esta forma, ya no tiene sentido que estén obsidian.» (m02832)
L2. Chosen storage: files remain the truth, the studio gains the editor. A database as the only original was rejected for this step because the vault already gives history, diff and an hourly backup, and losing that net to gain a schema is a bad trade while the authoring surface is what is actually missing.
L3. Editor in the studio: `#/editar` and `#/editar/<id>` with a title field, the Markdown body, Guardar/Cancelar and the real reader as preview. A refused deck lists the returned problems verbatim and keeps the typed text; a stale save answers 409 and offers «Recargar» without adopting the other revision. Commits c65c19a (server half: api/note, save-note, lint before writing, 409 on a changed rev) and d0ef383 (UI). Screenshots scratch/studio-editor-390{p,-preview}.png, scratch/studio-editor-1280.png, scratch/studio-library-{390,1280}.png.
L4. The preview shows the stored note, never the unsaved textarea: the reader route serves files. The header now says «lo guardado; tus cambios al guardar» and a new note replaces the empty frame with one line instead of a blank box. On a phone the preview frame takes the full width so it matches the reader's own column. Known cosmetic limit, recorded not fixed: a deck title longer than ~20 characters next to the floating «Pantalla completa» button wraps into three or four short lines at a stage narrower than ~340 px, because the title reserves `calc(100% - 10.5rem)` for the button; the fix needs the button on its own row and was left out to avoid changing the verified reader layout late in the delivery.

L5. La vista previa del borrador pasó las pruebas y falló en el VPS: el estudio enviaba el POST al origen público del lector y un `fetch` de Node rechaza el certificado autofirmado del proxy, así que la ruta respondía 502 y la interfaz dejaba el marco anterior en silencio. Arreglo (PR 29, merge 32d9940): el puente informa `localBase` (loopback) además de `base` (pública), el estudio llama al lector por loopback y devuelve al navegador la URL pública, porque el marco lo carga el navegador. Prueba nueva con `publicOrigin`/`bridgePublicOrigin` configurados: 200 y URL `https://box.tail0.ts.net:8446/<token>/borrador/<clave>`. Suite 154/145/9. Prueba real en https://10.154.59.151:8445 a 390 px: `{"draftUrl":true,"deckDrawn":true,"title":"BORRADOR EN VIVO","savedYet":false,"pageErrors":[]}`; captura del marco en scratch/live-draft-frame-390.png con «tu borrador», «PASO 2 DE 3» y la navegación funcionando.

L6. T9 cerrado (PR 30, merge d2b338a). Medido en el lector desplegado a 390 px: antes, las 13 diapositivas de la nota de LSTM dibujaban el título al **43 %** del ancho de la tarjeta (`calc(100% - 10.5rem)` reservado para el botón); después, `squeezed: []` y `widestSentence.share: 0.99`. Kit.css reserva la fila del botón y el título usa el ancho completo; la prueba «deck titles leave room for the full-screen button» pasó de medir un hueco horizontal a exigir que no haya solape y que el título ocupe al menos el 90 % del ancho. Evidencia en vivo: `scratch/live-title-check.mjs`, `scratch/live-deck-title-390.png`. Ese mismo barrido destapó una ceguera aparte de la puerta (`text-over-arrow` solo mide tallos rectos), registrada como T6 en odd/tasks/note-visual-rule.md.
