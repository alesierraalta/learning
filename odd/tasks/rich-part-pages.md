# Rich part pages
Objective: the HTML page of a part becomes the complete explanation (every section of the learner's method and preferences), read like an Obsidian page but with richer visuals than Mermaid, interactive demos inside the sections, the connected quiz, and a «Generar video» button.
Authorized by the request below (correction of the Part 3 test app); branch feat/learning-studio. Push stays the user's decision.

## Specs
S1 — "en esta primera demo no me estás haciendo las explicaciones como están en mis preferencias. Sino que solamente me estás dando cosas interactivas"
S2 — "necesito también la explicación y un botón que diga generar video para yo poder ver el video"
S3 — "de normal debe ser como de forma totalmente normal. Como si estuviese leyendo una página del obsidian"
S4 — "como ya no tenemos la limitación que teníamos en obsidian, que solamente podíamos hacer Mermaid, aquí podemos hacer cualquier otra cosa. Aquí puedes hacer mejores diagramas de arquitectura, mejores patrones, mejor es cualquier cosa ahí de paso demos interactivas"
S5 — "migremos la visualización que teníamos en Obsidian a estas páginas HTML"
S6 — "Utiliza el framework más apto para que sea lo más sencillo possible de desarrollar, pero más potente en cuanto a lo que se puede hacer. Me da igual cual." Choice (parent): plain HTML pages + a shared web-component kit (custom elements, no build step), with KaTeX, Mermaid and SVG available.
S7 — "No que simplemente sea un paso interactivo y ya. No, tiene que también contener todo lo del obsidian."

## Contract
- Page file: `explicaciones/Parte N - <slug>.html` next to the Markdown note (same basename). The bridge serves it at `/<token>/<topic>/<part>` instead of the Markdown rendering when it exists (the Markdown note stays in the vault and remains the fallback).
- Kit: `integrations/pi/kit/kit.css` and `kit.js`, served at `/<token>/kit/<file>`; a page includes `../kit/kit.css` and `../kit/kit.js` (relative to `/<token>/<topic>/<part>`). Pinned CDN libraries with SRI the kit may load: KaTeX, Mermaid, marked, DOMPurify.
- The bridge injects, first thing in `<head>`: `window.LEARNING_BRIDGE = {submitUrl, quizUrl, topic, part, video}` where `quizUrl` = `/<token>/api/quiz?topic=<t>&part=<p>` returning `{questions (no answer keys), answered (graded with reasoning) | null, verdicts | null}` and `video` = `file/explicaciones/adjuntos/Parte N - <slug>.mp4` (relative; may not exist yet).
- Submissions: the existing `mini-quiz` and `question` kinds, plus `{kind: "video", topic, part}` → chat message `[Vista HTML · <topic> · <part> · video]` asking the tutor to produce the part's video with the learnings-video pipeline.
- CSP of a rich page: scripts from self, the CDN and inline (page-authored simulations); connect only to self; media and images from self; frame-ancestors 'self' plus the studio origin.
- Kit components (light DOM, styled by kit.css in the video's Distill design): `lk-callout`, `lk-steps`/`lk-step` (T0…Tn stepper with NUEVO/BLOQUEO marks), `lk-diagram` (architecture/flow diagrams from a JSON spec rendered as SVG), `lk-math` (KaTeX), `pre.mermaid` (Mermaid), `lk-widget` (frame for a page-authored interactive demo), `lk-video` (play if the file exists, else «🎬 Generar video»), `lk-quiz` (questions from quizUrl, entendi/porque/confianza, submit, results and verdicts), `lk-ask` (question to the tutor), automatic table of contents and reading progress.

## Tasks
R1 — S4,S6 — kit (kit.css, kit.js, docs/kit.md) — worker — done (e26b2df)
R2 — S2,S5 — bridge: serve the rich page with injected config and CSP, kit route, api/quiz, video kind, tests — inline — done (e9b120b; L2)
R3 — S1,S3,S4,S7 — rewrite the reinforcement-learning Part 3 test page as a complete rich page following preferencias.md and the Pure Method, with the interactive demos inside their sections, connected quiz and video — worker (same as R1) — done (e26b2df; copied to the vault test topic; L2)
R4 — S5 — skill explicacion-interactiva and docs/study-view-format.md: the rich page is the part's main output; the Markdown note stays for Obsidian and the engine — inline — done (skill v1.38 outside the repo)

## Log
L2 — Evidence: bridge tests 49 (rich page replaces the Markdown rendering with injected {submitUrl, quizUrl, topic, part, video} and its CSP; kit route with traversal refused; api/quiz without answer keys, then graded with reasoning; video kind → fixed chat message; quick notes). Through the real bridge on the vault test topic: 10 h2 sections, 4 KaTeX formulas, the lk-diagram SVG, 5 inline widgets, the 4-question quiz, «Generar video», config injected, zero page errors (only the expected 404 of the missing video). Worker kit check: every heading of the note, five experiments, submissions, restored grading/reasoning/verdicts, offline rendering, mobile width.
L1 — "Claro, porque aquí estoy viendo que en esta primera demo no me estás haciendo las explicaciones como están en mis preferencias. Sino que solamente me estás dando cosas interactivas. Y lo que te dicho no, necesito también la explicación y un botón que diga generar video para yo poder ver el video. Pero de normal debe ser como de forma totalmente normal. Como si estuviese leyendo una página del obsidian, pero además como ya no tenemos la limitación que teníamos en obsidian, que solamente podíamos hacer Mermaid, aquí podemos hacer cualquier otra cosa. Aquí puedes hacer mejores diagramas de arquitectura, mejores patrones, mejor es cualquier cosa ahí de paso demos interactivas. Entonces justamente eso que te estoy pidiendo es que migremos la visualización que teníamos en Obsidian a estas páginas HTML que. o HTML. Utiliza el framework más apto para que sea lo más sencillo possible de desarrollar, pero más potente en cuanto a lo que se puede hacer. Me da igual cual. Entonces, bueno, es eso, no. No que simplemente sea un paso interactivo y ya. No, tiene que también contener todo lo del obsidian."
