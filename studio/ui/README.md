# Studio browser UI

- `studio.js`: dependency-free library, topic viewer and SSE tutor client.
- `studio.css`: paper-white Distill tokens and responsive three-panel layout.

The server supplies `<main id="studio">`, JSON in `#studio-data` with a token-scoped `base`, and pinned CDN globals `marked` (15) and `DOMPurify` (3) before loading the script. No build step or inline handlers are needed.

The tutor panel is a workspace of its own: its left edge is a handle (drag it, or use the arrow keys on it — Shift moves further, a double click returns it to its width) and the head carries three switches — fold the list of conversations away so the chat keeps the whole panel, give the chat the whole window with the reading mode, and open the menu. Each choice is kept on the device (`estudio.tutor.ancho`, `estudio.tutor.lista`, `estudio.tutor.completo`), so the tutor opens the way it was left; on a phone the panel is the window and the handle is gone. Escape closes the tutor, like its close button.

The client uses the library/view endpoints, named SSE events and JSON POST bodies specified in [the feature contract](../../odd/tasks/learning-studio.md#api-contract-server--ui). The bridge must allow the studio as an iframe ancestor. Mode selection remains a tutor dialog, never a separate UI preference. The tutor input stays usable while prompts are queued; EventSource handles reconnects.
