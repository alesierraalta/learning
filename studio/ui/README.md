# Studio browser UI

- `studio.js`: dependency-free library, topic viewer and SSE tutor client.
- `studio.css`: paper-white Distill tokens and responsive three-panel layout.

The server supplies `<main id="studio">`, JSON in `#studio-data` with a token-scoped `base`, and pinned CDN globals `marked` (15) and `DOMPurify` (3) before loading the script. No build step or inline handlers are needed.

The client uses the library/view endpoints, named SSE events and JSON POST bodies specified in [the feature contract](../../odd/tasks/learning-studio.md#api-contract-server--ui). The bridge must allow the studio as an iframe ancestor. Mode selection remains a tutor dialog, never a separate UI preference. The tutor input stays usable while prompts are queued; EventSource handles reconnects.
