# Reading design implementation
Objective: implement artboard 01; branch feat/113-reading-design; delivery strategy ask-on-risk; forecast not yet established.
Test runner: existing Studio/reader tests; confirm targeted commands before edits.

## Specs
- S1: "Implement the design artboard design/seccion-lectura/01-editorial.html"
- S2: "Implement it in the project's real stack. Use the artboard as the visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML verbatim."
- S3: "Take colors, typography, spacing, radius and shadows from design/system.md, the project's token source."
- S4: "Report progress with the gentle_design tool: action \"handoff\", target \"seccion-lectura/01-editorial.html\", status \"in_progress\" when you start; status \"implemented\" when it is done, with previewUrl set to the running app's loopback URL (localhost, 127.0.0.1 or [::1]) when one is running, so the canvas can compare it with the artboard."
- S5: "Implement the design artboard design/seccion-lectura/04-inicio.html"
- S6: "Implement the design artboard design/seccion-lectura/05-tema.html"
- S7: "Implement the design artboard design/seccion-lectura/07-preferencias.html"
- S8: "Implement the design artboard design/seccion-lectura/06-diagnostico.html"
- S9: "Implement the design artboard design/seccion-lectura/09-dependencias.html"

## Tasks
- T1 [S1–S3] inline/worker — done — implemented reader, index and media; focused checks and 63/63 browser layout tests passed; commit pending.
- T2 [S1–S4] inline/verify — in_progress — independent verification, review eligibility and handoff; commit pending.
- T3 [S2–S3,S5] inline — pending — implement Inicio y biblioteca with checks and handoff; issue #114; commit pending.
- T4 [S2–S3,S6] inline — pending — implement Tema y ruta with checks and handoff; issue #115; commit pending.

- T5 [S2–S3,S7] inline — pending — implement Preferencias with checks and handoff; issue #116; commit pending.

- T6 [S2–S3,S8] inline — pending — implement Diagnóstico with checks and handoff; issue #117; commit pending.

- T7 [S2–S3,S9] inline — pending — implement Mapa de dependencias with checks and handoff; issue #118; commit pending.

## Log
L1 — User request verbatim:
Implement the design artboard design/seccion-lectura/01-editorial.html

Artboard: design/seccion-lectura/01-editorial.html
Title: Lectura continua
Tradeoff: Mantiene el artículo y la barra actuales; el recorrido se descubre al avanzar.

Implement it in the project's real stack. Use the artboard as the visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML verbatim.
Take colors, typography, spacing, radius and shadows from design/system.md, the project's token source.

Report progress with the gentle_design tool: action "handoff", target "seccion-lectura/01-editorial.html", status "in_progress" when you start; status "implemented" when it is done, with previewUrl set to the running app's loopback URL (localhost, 127.0.0.1 or [::1]) when one is running, so the canvas can compare it with the artboard.
This design is not linked to an ODD feature document: size it under the project's ODD rules as usual.
This handoff itself commits nothing.

L2 — Approved design and system live in registered sibling worktree /home/ale/documents/learning-worktrees/design-112-reading-section/design/; implementation worktree starts at origin/main ec3070115604. Issue #113. Handoff set in_progress.
L3 — User request verbatim: Implement the design artboard design/seccion-lectura/04-inicio.html

Artboard: design/seccion-lectura/04-inicio.html
Title: Inicio y biblioteca
Tradeoff: Prioriza retomar el estudio sin ocultar el acceso a un tema nuevo.

Implement it in the project's real stack. Use the artboard as the visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML verbatim.
Take colors, typography, spacing, radius and shadows from design/system.md, the project's token source.

Report progress with the gentle_design tool: action "handoff", target "seccion-lectura/04-inicio.html", status "in_progress" when you start; status "implemented" when it is done, with previewUrl set to the running app's loopback URL (localhost, 127.0.0.1 or [::1]) when one is running, so the canvas can compare it with the artboard.
This design is not linked to an ODD feature document: size it under the project's ODD rules as usual.
This handoff itself commits nothing.

L4 — User request verbatim: Implement the design artboard design/seccion-lectura/05-tema.html

Artboard: design/seccion-lectura/05-tema.html
Title: Tema y ruta de aprendizaje
Tradeoff: Hace visible la progresión; el panel lateral ocupa espacio en escritorio.

Implement it in the project's real stack. Use the artboard as the visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML verbatim.
Take colors, typography, spacing, radius and shadows from design/system.md, the project's token source.

Report progress with the gentle_design tool: action "handoff", target "seccion-lectura/05-tema.html", status "in_progress" when you start; status "implemented" when it is done, with previewUrl set to the running app's loopback URL (localhost, 127.0.0.1 or [::1]) when one is running, so the canvas can compare it with the artboard.
This design is not linked to an ODD feature document: size it under the project's ODD rules as usual.
This handoff itself commits nothing.


L5 — User request verbatim:
Implement the design artboard design/seccion-lectura/07-preferencias.html

Artboard: design/seccion-lectura/07-preferencias.html
Title: Preferencias
Tradeoff: Expone los controles de enseñanza y del tutor; requiere desplazamiento para revisar todos los aspectos.

Implement it in the project's real stack. Use the artboard as the visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML verbatim.
Take colors, typography, spacing, radius and shadows from design/system.md, the project's token source.

Report progress with the gentle_design tool: action "handoff", target "seccion-lectura/07-preferencias.html", status "in_progress" when you start; status "implemented" when it is done, with previewUrl set to the running app's loopback URL (localhost, 127.0.0.1 or [::1]) when one is running, so the canvas can compare it with the artboard.
This design is not linked to an ODD feature document: size it under the project's ODD rules as usual.
This handoff itself commits nothing.

L6 — User request verbatim:
Implement the design artboard design/seccion-lectura/06-diagnostico.html

Artboard: design/seccion-lectura/06-diagnostico.html
Title: Diagnóstico dentro del lector
Tradeoff: Da espacio a las respuestas y al razonamiento; muestra solo una pregunta de ejemplo.

Implement it in the project's real stack. Use the artboard as the visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML verbatim.
Take colors, typography, spacing, radius and shadows from design/system.md, the project's token source.

Report progress with the gentle_design tool: action "handoff", target "seccion-lectura/06-diagnostico.html", status "in_progress" when you start; status "implemented" when it is done, with previewUrl set to the running app's loopback URL (localhost, 127.0.0.1 or [::1]) when one is running, so the canvas can compare it with the artboard.
This design is not linked to an ODD feature document: size it under the project's ODD rules as usual.
This handoff itself commits nothing.

L7 — User request verbatim:
Implement the design artboard design/seccion-lectura/09-dependencias.html

Artboard: design/seccion-lectura/09-dependencias.html
Title: Mapa de dependencias
Tradeoff: Relaciona conceptos y detalle; el grafo requiere desplazamiento horizontal en móvil.

Implement it in the project's real stack. Use the artboard as the visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML verbatim.
Take colors, typography, spacing, radius and shadows from design/system.md, the project's token source.

Report progress with the gentle_design tool: action "handoff", target "seccion-lectura/09-dependencias.html", status "in_progress" when you start; status "implemented" when it is done, with previewUrl set to the running app's loopback URL (localhost, 127.0.0.1 or [::1]) when one is running, so the canvas can compare it with the artboard.
This design is not linked to an ODD feature document: size it under the project's ODD rules as usual.
This handoff itself commits nothing.

L8 — Reader implementation: focused Chromium checks passed; full `node --test studio/layout.test.mjs` passed 63/63. Independent verification running; native assessment marked high by item 3 escalation, native risk unassessable while untracked scope is undeclared.
