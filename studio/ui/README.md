# Studio browser UI

- `studio.js`: dependency-free library, topic viewer and SSE tutor client.
- `studio.css`: paper-white Distill tokens and responsive three-panel layout.

The server supplies `<main id="studio">`, JSON in `#studio-data` with a token-scoped `base`, and pinned CDN globals `marked` (15) and `DOMPurify` (3) before loading the script. No build step or inline handlers are needed.

The tutor panel is a workspace of its own: its left edge is a handle (drag it, or use the arrow keys on it — Shift moves further, a double click returns it to its width) and the head carries three switches — fold the list of conversations away so the chat keeps the whole panel, give the chat the whole window with the reading mode, and open the menu. Each choice is kept on the device (`estudio.tutor.ancho`, `estudio.tutor.lista`, `estudio.tutor.completo`), so the tutor opens the way it was left; on a phone the panel is the window and the handle is gone. Escape closes the tutor, like its close button.

On the reader (`#/leer/…`) the two panels are columns beside the part instead of sheets over it, because the reader is the one surface with a frame to keep: Tareas on the left, the part in the centre and the conversation on the right at 1280 and wider; below that, a two-column band with the tasks rail on the left and the conversation under the part, and one column under 960. Each toggle hands its width back to the frame, opening one no longer closes the other, and no scrim is drawn — the frame is never covered. The three planes are colour, not shadow: the page recessed, the rails quiet with a hairline, the frame on the paper; the dark theme reorders the same tokens (`--plane-page`, `--plane-rail`, `--plane-frame`) so no surface of the artboard is imported. With both panels closed the reader keeps exactly the measure and the rail it had.

The client uses the library/view endpoints, named SSE events and JSON POST bodies specified in [the feature contract](../../odd/tasks/learning-studio.md#api-contract-server--ui). The bridge must allow the studio as an iframe ancestor. Mode selection remains a tutor dialog, never a separate UI preference. The tutor input stays usable while prompts are queued; EventSource handles reconnects.

For versioned open assessments the reader posts an additive `learning:submitted` message with `open: true` and no `score`. The results route shows «Respuestas enviadas al tutor» and a pending state while the topic's task works, then reads `api/verdicts?tema=<topic>&parte=<part|quiz>` and renders each verdict with the tutor's verbatim evidence, criterion results and one next step via `lkQuestion.feedback`. The route returns no rubric, key or answer text; old multiple-choice results keep their score and chosen/correct display unchanged.
