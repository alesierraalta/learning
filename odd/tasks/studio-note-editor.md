# Studio note editor

Write and edit quick notes from inside the studio, so Obsidian stops being required. Files stay the source of truth.

## Specs

S1. The user can create and edit a quick note from the studio on phone and desktop, without opening Obsidian: «ya no hace falta que la nota esté en el en el baúl de Obsidian… ya quitar todo de Obsidian» (m02832), choosing option A: «Archivos + editor dentro de la app (recomendado)».

S2. A note is only stored if its guided decks are sound. The save is refused, with the exact problems listed, when a deck block is malformed, a deck is wider than 360, a step is missing its scene, or a box label does not fit its own box. The rule the user asked for is enforced at the door: «esto no debe pasar mas… esto debe ser una regla para todas las notas» (m02304).

S3. The stored note keeps being `rapidos/<id>.md` in the private Git repo, so history, diff and the hourly backup keep working. Saving never lets a request write outside `rapidos/`.

S4. A save is refused, not silently merged, when the file changed since the editor loaded it; the answer carries the current `rev` so the editor can reload.

S5. A note created from the studio appears first in the library, because quick notes are listed by most recent use.

## Tasks

T1. Promote the deck rules from `scratch/validate-walkthroughs.mjs` into `tools/deck-lint.mjs` (pure, no browser) and have `tools/deck-gate.mjs` run it before measuring. (S2)
T2. Bridge write path: `writeQuickNote(root, { quick, title, body, rev })` with slug rules, atomic temp+rename inside `rapidos/`, rev guard and size limit. (S3, S4)
T3. Studio API: `GET /<token>/api/note?quick=<id>` returns `{ id, title, body, rev }`; `POST /<token>/save-note` creates or updates and answers `{ ok, id, rev, created }` or the lint/rev error. (S1–S4)
T4. Studio UI: an editor view reachable from the library (new note and edit this note), markdown textarea, live preview through the real reader, save/cancel, and the server's problems shown verbatim. (S1, S2)
T5. Browser test: create a note in the studio, see it at the top of the library, open it in the reader, edit it, and confirm the change; plus a refused save showing the deck problem. (S1, S2, S4, S5)
T6. Docs: `docs/studio.md` describes the editor, the rev rule and that the vault stays the source of truth.
T7. Verify and deliver: full suite, gate on a generated note, PR, CI, deploy, live check that creates and deletes its own scratch note.

## Log

L1. «Pero es lo que te había dicho. Si quieres, ya no hace falta que la nota esté en el en el baúl de Obsidian. Podemos simplemente armar un backend dentro de la BPS con toda la base de datos con toda la información. No sé cómo tú quieras. Y ya quitar todo de Obsidian. Porque, como te digo, yo utilizo Obsidian por esa facilidad. Pero ahora que hay más facilidades de esta forma, ya no tiene sentido que estén obsidian.» (m02832)
L2. Chosen storage: files remain the truth, the studio gains the editor. A database as the only original was rejected for this step because the vault already gives history, diff and an hourly backup, and losing that net to gain a schema is a bad trade while the authoring surface is what is actually missing.
