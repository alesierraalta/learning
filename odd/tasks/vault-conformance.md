# Vault conformance
Objective: make the Learnings vault section work end to end under the deep engine: restart the existing topic in deep mode and fix the two system gaps found in the 2026-10-07 read-only validation.
Authorized: engine and rules change with tests, skill reference edit, archive and restart of the topic in the vault (old notes kept as material). Commits on feat/vault-conformance; push and merge remain the user's decisions.

## Specs
S1 — "vas a validar que en mi Obsidian, mi sección de aprendizaje de explicaciones, pues esté funcionando y tenga todo lo necesario al 100% y maravilloso."
S2 — Topic decision: "Reiniciarlo en modo profundo (Recomendado)" — "/learning init y rehacer diagnóstico (12 preguntas) y mini-quizzes (5) con el protocolo actual; tendrás que volver a responderlos. Las notas actuales se conservan como material."
S3 — System fix: "Aceptar <svg> como visual" — "Añadir el SVG en línea (que Obsidian sí renderiza) a los visuales aceptados por rules/deep.json y el motor, con test."
S4 — System fix: "Lista de archivos en la skill" — "Que explicacion-interactiva enumere qué archivos (notas + JSON) debe crear cada etapa, en vez de solo apuntar a docs/engine.md."

## Tasks
T1 — S3 — engine/rules: inline `<svg>` counts as a planned visual — inline — done (L4)
T2 — S4 — skill reference lists per-stage files (notes + JSON) — inline — done (L5)
T3 — S1,S2 — archive the spec 1.4 topic, `init` a new deep run, write preparation (plan.json) and the 12-question diagnosis, then wait for the learner's answers — inline — pending

## Log
L1 — "Bueno, ahora entonces vas a validar que en mi Obsidian, mi sección de aprendizaje de explicaciones, pues esté funcionando y tenga todo lo necesario al 100% y maravilloso."
L2 — Read-only validation (vault unchanged by file hash): install OK (Pi RPC get_commands lists /learning only from Learnings); topic fundamentos-aprendizaje-por-refuerzo (spec 1.4, pre-engine) not enrolled, no JSON sidecars, diagnosis 10 questions (4/4/2) vs 12 (6 prereq + 6 topic, 2/2/2), mini-quizzes 4 vs 5, part visuals inline `<svg>` not accepted by the engine; skill never lists the sidecar files.
L3 — User decisions: S2 topic restart; S3 and S4 system fixes.
L4 (T1, S3): rules/deep.json thresholds.visualElements ["svg"] (validated as lowercase element names); hasVisual counts a declared element outside fenced blocks, closed and with at least one child element. RED: inline svg and multiline svg rejected before the change; GREEN 16/16 visual cases plus malformed-rules case. Mutations killed 5/5 (svg inside code, no child required, unclosed accepted, svg undeclared, no element validation). Real vault parts 1 and 2 satisfy the rule. Rules hash changes; no vault run was initialized, so no state is affected. docs/engine.md updated.
L5 (T2, S4): JSON shapes were documented nowhere (only Go structs), so docs/engine.md gains "JSON sidecar shapes" with examples taken from the engine-accepted test fixtures. Skill reference ~/.claude/skills/explicacion-interactiva/references/learning-validation.md gains "Archivos que crea cada etapa" (per-stage notes, JSON, writer) pointing to that section, the svg row in accepted visuals, and the rule that a pre-engine topic is archived and re-initialized. The skill file lives in the home repository and was not committed there.
