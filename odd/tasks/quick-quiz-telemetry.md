# Quick Quiz Per Point & Adaptive Student Telemetry

Every explanatory point/section gains an embedded quick-quiz checkpoint, and every answer (correctness + diagnostic reason) is recorded as telemetry locally and globally so the tutor continuously learns the student's cognitive profile and adapts.

Branch: `feat/quick-quiz-telemetry`

## Specs

- **S1 — Quiz rápido en cada punto**: Each explanatory point/section of an explanation (both in university mode parts and quick notes) carries an immediate verification checkpoint (`quiz rápido`) with choices A–E («No sé»). In Markdown notes: `> [!question] Quiz rápido — Punto N`. In rich HTML pages: `<lk-quick-quiz point="..." tag="...">`.
- **S2 — Telemetría por explicación**: Each topic/explanation keeps a local telemetry record (`<topic>/telemetria.json` or local apunte log) recording each point evaluated, learner answer, correct answer, `ok` verdict, and diagnostic explanation (`por_que`).
- **S3 — Telemetría general y perfil del alumno**: Global telemetry in `telemetria.json` (Learnings root) aggregates overall statistics, category accuracy (`matematicas`, `conceptual`, `arquitectura`, `codigo`), cognitive tendencies (e.g. difficulty with abstract math requiring step-by-step numerical breakdown), strengths, points to reinforce, and tutor adaptation directives.
- **S4 — Adaptación activa del tutor**: The tutor agent reads both global and topic telemetry before explaining. If the student struggles with math, math is reinforced with step-by-step arithmetic and concrete numbers; if gaps exist in topic X, X is reinforced before proceeding; if strengths exist in Y, Y is leveraged as a cognitive anchor.
- **S5 — Ingesta y endpoints**: The bridge accepts `kind: "quick-quiz"` submissions and the studio exposes `api/telemetry` (GET/POST) to read, record, and persist telemetry atomically.

## Deliverables

- `integrations/pi/telemetry.ts` + `studio/telemetry.ts`: data models, validation, atomic read/save for global and topic telemetry.
- `studio/server.ts`: GET and POST `api/telemetry` routes.
- `integrations/pi/bridge.ts`: handling of `quick-quiz` telemetry submissions, delivering chat feedback and updating telemetry.
- `integrations/pi/kit/kit.js` + `kit.css`: `<lk-quick-quiz>` custom element with instant feedback and telemetry dispatch.
- `studio/ui/studio.js`: postMessage listener forwarding quick-quiz events to `api/telemetry`.
- Skill `explicacion-interactiva` (`SKILL.md`, `references/metodo-explicame.md`): mandatory quick quiz in each point and adaptive telemetry integration.
- Learnings vault (`AGENTS.md`, `preferencias.md`, `telemetria.json`): tutor directives and initial seeded student telemetry profile.
