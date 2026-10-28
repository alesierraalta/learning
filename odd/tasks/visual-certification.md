# Visual certification (Learnings engine)

Objective: the Learning engine — not chat prose — certifies that every requested
artifact (visuals, diagrams, mini demos) is present and meets minimum quality
parameters before a part can be delivered.

Authorized: `~/documents/learning` only. Skill edits live in
`~/.claude/skills/explicacion-interactiva/` (home dir, not a git repo).

## Specs

S1 (user, verbatim): "necesito que haya algo más que una skill que está bien, la verdad es que eso está muy bien, pero necesito que haya algo que se que pueda validar, que pueda que pueda certificar que todo lo que se pide, tanto visual, diagramas, las mini demos, todo esté y cumpla parámetros mínimos de calidad."

S2 (user, verbatim): "O sea, que el motor los detecte y entienda, diga, bueno, sí, y me siento me chiste de explicación y cumple con todo, se puede entregar. Listo, chao."

S3 (derived from the earlier complaint, m00559): a note delivered without
requested visuals is a defect the engine must catch, not a style preference.

## Contract

- `thresholds.minVisuals` (2 today): minimum number of visuals in a part note
  when the part planned a visual. Fail-closed: rules with no value fail to load.
- `thresholds.howToReadLine` ("Cómo leerlo"): the mandatory reading-guide
  marker (M1). Every visual's next non-blank line must start with it.
  Fail-closed: missing marker fails to load.
- `explanation-content` FAILs below the minimum ("has only %d visual(s),
  below the minimum of %d") or with unguided visuals ("%d of %d visual(s) ...
  lack the reading guide ... (M1)"). Pass summary reports "visual verified
  N/M with reading guide".
- A visual counts as: an embed (`![...]`), a nonempty block in a
  `thresholds.visualBlocks` format (mermaid, desmos-graph, geogebra, ggb,
  datachart), or a closed inline `thresholds.visualElements` element (`svg`)
  outside fenced blocks. Fence bodies are never judged as after-lines.
- Complete scope unaffected: parts without a planned visual skip the gate.
- Pedagogical quality (M2–M10) stays with the tutor and the `visual-value`
  review; the engine certifies presence + guidance.

## Tasks

- T6 (S1, S2, S3) [done]: engine counts visuals, enforces minVisuals + M1;
  fixture explanations carry two guided visuals; dead code (`hasVisual`,
  `howToReadFollows`) removed. 181 Go tests pass. Commit 879bcc8.
- T7 (S2) [done]: real run — production binary + `rules/deep.json` on a
  `mktemp -d` workspace, 10/10 scenarios (zero/one visual blocked, broken
  guide pinned, two guided visuals certified); docs/engine.md checks table,
  scope note; skill refs updated.
- T8 (S1, S3) [done]: demo gate — `demoElements` (`lk-widget`,
  `lk-walkthrough`), `minDemos` (1), per-part `demosPlanned` in `plan.json`,
  check `demo-part` at `explanation`, each demo needs its own `howToReadLine`
  guide. 188 Go tests pass. Studio demo embeds now allow fullscreen
  (`view/app.js` iframe attributes) and the kit surfaces a denied request
  instead of a dead button (`kit/kit.js` + `.lk-wt-hint-error` in `kit.css`).
- T9 (S3) [done]: docs/engine.md (preparation `demosPlanned` flag, explanation
  row, "Demo components" paragraph, plan.json example); skill refs
  (learning-validation.md "Mini demos interactivas" section,
  metodo-explicame.md plan + metrics bullets); memory mirror updated.
- T10 (S1-S3) [done]: shipped to `main` and deployed on the VPS via CI
  (feature commit 879bcc8; fullscreen fix 95b8c50).

## Log

L1 (user, verbatim): "Por eso necesito que haya algo más que una skill que está bien, la verdad es que eso está muy bien, pero necesito que haya algo que se que pueda validar, que pueda que pueda certificar que todo lo que se pide, tanto visual, diagramas, las mini demos, todo esté y cumpla parámetros mínimos de calidad. O sea, que el motor los detecte y entienda, diga, bueno, sí, y me siento me chiste de explicación y cumple con todo, se puede entregar. Listo, chao."

L2: The skill-only gate (counted visual minimum before replying) was insufficient on its own; this change moves the enforcement into the engine so delivery itself is blocked.

L3: Fence-body lines were being judged as after-lines (fixed by skipping fenced bodies); inline elements now wait for their marker line with extras on the same line counted as missing.

L4: Real run 10/10 PASS. Note: editing `explicacion.md` after planning rewinds the frontier to planning (`index_note` receipts the index there), so the delivery flow re-advances planning before advancing `explanation`.

L5: "Pantalla completa" did not work inside the Studio because demo embeds lacked `allow="fullscreen"`; the kit swallowed the rejection silently. Fixed in the embed attributes and by surfacing the denial as a visible hint.

L6: Demo vocabulary chosen from what the vault actually renders today (per the user's walkthrough screenshot and the kit docs): `lk-widget` for parameter playgrounds (the neural-net style the user described), `lk-walkthrough` for stepped decks. The user's photo of the wanted visual TYPES may extend `demoElements`; the rules file is the single place to extend it.

L7: "Hagalo" (m03789) resolved the two decisions: the `.html` exports were archived instead of deleted (reversible, and they leave the published set with 34 fewer arrow defects), and the three stale part stages were re-advanced. Evidence: `paradigma-relacional-sql-transacciones` accepted at `own_words/p3`, `gramatica-y-phrasal-verbs-speaking` at `own_words/p1`, `fundamentos-aprendizaje-por-refuerzo` still `waiting diagnosis` because it needs the learner's answers. The engine state was pushed to the VPS and md5-verified on both sides.

L8: Backward compatibility defect: `status` on a topic frozen before this feature returned `rules invalid: minDemos must be positive`, because the engine validates the frozen `.learning/rules.json` snapshot and the new keys had been made mandatory. Absent thresholds now mean "not checked"; a half-declared pair still fails closed. Pinned by `TestFrozenRulesWithoutNewThresholdsKeepWorking`.

L9: Deploy gotcha that hid the whole delivery: the first deploy put the parts at the topic root (`~/Learnings/<topic>/Parte N.md`), so audits and md5 checks passed on files the reader never serves; the served copies live in `<topic>/explicaciones/`. Everything was re-deployed there and the stray root copies were removed after md5 equality. Lesson: verify what the reader serves, not a convenient copy.

L10: The demo pages existed but only one note linked its demo, so a learner could not reach the labs. Each part now ends with `**Para verlo en movimiento:** [abre el laboratorio ...](file/explicaciones/demos/<page>.html)`. Verified live: the link answers 200 and the page loads one walkthrough with 6 steps and 11 arrows.

- L12 · 2026-10-29 · Pedido del usuario: «me gusta, implementalo en todo» sobre el diseño papel × Distill. Aplicado a producción: `integrations/pi/view/app.css` (lector) reescrito con la mezcla —tinta `#0F2E3D`, acento `#004276`, cálido `#a67f59`, magenta `#DD4A68`, selección `#b3d4fc`, medida 648 px, h1 34/400, booktabs, `figure:has(svg)` a 984 centrado, `.note-pair` 648+200, modo ancho 1352 en dos columnas—; `integrations/pi/kit/kit.css` con capa nueva al final (misma paleta compuesta, botones rectangulares, puntos del deck de 16×2 px sin borde, callout y widget sin caja, booktabs); `integrations/pi/kit/scene.js` con la paleta de figuras pasada a papel (`rx` 0, trazo 2). Los estilos inline de las páginas de demo (`vault-batch/out/*/demos`, `vault-batch/rl_explicaciones/demos`, `vault-batch/tensorfold/demos`) se reescribieron al mismo idioma porque ganaban por especificidad.
- Evidencia medida: `go test ./... -count=1` 199 pass, `go vet ./...` limpio, `node --test integrations/pi/bridge.test.mjs` 90 tests/81 pass/0 fail/9 skip. Local: lector con `Liberation Serif` 20 px, `#app` 648, 0 elementos con `rgb(37,99,235)`, booktabs 1 px, botón `border-radius 0`; demo con 11 flechas, puntos sin borde, cabecera transparente. Vivo en `https://10.154.59.151:8446` (token nuevo del bridge): lector `34px/400 rgb(15,46,61)`, 0 azules, 52 trazos de mermaid; demo 11 flechas y 0 errores de consola. Despliegue con md5 igual en los tres archivos de código y los 7 demos.
- No se tocó: motor Go, contenido de las notas, `app.js`/`kit.js` (solo CSS y paleta de figuras). El puerto público del studio es 8445 (el 8446 sirve el bridge).
