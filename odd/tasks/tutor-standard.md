# Tutor follows the repo standard

Milestone #6. The live studio must author parts with the repository's explanation standard, refuse parts that miss it, render the scenes the previews show, and always offer the next step.
Branch per issue, base `main`. Runner: `go test ./...`, `node --test`.

## Specs

- S1 (#184): one instruction chain, versioned in the repo. The tutor of the live studio (Pi and Antigravity) reads the skill from `~/learning/skills/explicacion-interactiva` and a Learnings `AGENTS.md` shipped from the repo; the deploy links both, and both the deploy and the studio refuse to run when the deployed copy differs from the repo. User: "creo que hay un tema bastante fastidioso con el tema de los baúles y de dónde se saca la información creo que tenemos un código espagueti o una arquitectura espagueti que necesitamos solucionar".
- S2 (#184): no instruction layer contradicts the measured part size rule (450 prose words, 2 content sections, `## Ruta` of at most 4 lines, 1 scene, 1 walkthrough, 3 mini-quiz questions). The "Método Explicativo Puro" checklist, the Learnings `AGENTS.md` "Estándar Pedagógico y Visual Obligatorio (Inamovible)" and the `preferencias.md` "Perfil aplicado" stop prescribing the old long anatomy. User: "me está volviendo a hacer exactamente el mismo diseño que le dije que no hiciera ... por el que en frases cortas con el estilo de dibujo que ya en teoría teníamos preestablecido".
- S3 (#185, #180): the engine refuses a part that fails the explanation standard checks, and the studio gate makes either tutor correct it before the learner sees it. User: "tú me habías dicho que tenías ya un verificador que sí funcionaba pero ahora que estamos en la vida real yo soy mi primer cliente y no me funciona".
- S4 (#186): the deployed reader renders the scenes the preview showed. User: "me encantó la preview que me mostraste que si con el robot los iconos la casa cómo manejas el tema de los de las ecuaciones con con los renders ... pero no está reflejado en en la parte que estoy pidiendo en el uso Real de la aplicación".
- S5 (#187, #175): every turn ends with the button the engine state calls for. User: "si acabo de terminar el quiz de presentación que después de entender cuál es mi nivel me diga aquí está el botón para llevarte a la parte 1 ... después yo terminar el quiz y mis palabras y tal me diga ah bueno aprobaste vamos a la parte 3 o desaprobaste aquí está vuelto a generar la parte 2".
- S6 (#188): a new RL topic created by the live tutor passes S2-S5 end to end.

## Tasks

- T1 S1-S2 #184 single instruction chain + deploy/studio check — worker — pending
- T2 S3 #185 the engine refuses a part that misses the measured standard (and counts `lk-scene` as a visual) — worker — in progress; #180 (studio gate) is owned by another session (01a1c642)
- T3 S4 #186 the reader keeps `lk-scene` (the visual engine was already on main) — inline — done, PR #189 (f4dae89, merge 4ade970), deployed to the VPS
- T4 S5 #187 next-step buttons from engine state — blocked on #180 merge; #175 done by PR #179 («Ir al diagnóstico»)
- T5 S6 #188 real-run acceptance on the VPS — pending

## Log

- L1 (2026-11-11, user, verbatim excerpt): "ahorita volví a crear una nueva nota acerca de aprendizaje por refuerzo y hay varias cosas uno después de haber hecho la ... el quiz de introducción para saber mi nivel no me dejó el botón en el chat que me llevase directamente a la parte uno ... además no me está haciendo el diseño de explicación que justamente llevamos tratando todo el p*** día de ayer ... no está haciendo ni los diseños de las diagramas ni los diseños de los visualizaciones ... creo que tenemos un código espagueti o una arquitectura espagueti que necesitamos solucionar ... me encantó la preview que me mostraste ... pero no está reflejado en ... el uso Real de la aplicación".
- L2 (2026-11-11, user): "si, vamos" — accepts the order: instruction chain and gates first.
- L4: T3 scope corrected — origin/main already ships `tools/visuals`, `lk-scene`, `lk-figure` and the scene icons/formulas; the reader's DOMPurify allow-list stripped `lk-scene` from every Markdown note. RED test reproduced it; GREEN with `lk-scene` allowed; suite 395/0/10; CI green; VPS at 4ade970.
- L5 (2026-11-11, #180 owner): after #180 every turn starts in `startTurn` (drift check at its top, after `requireNoTurn`); one turn at a time studio-wide, a button that starts a turn gets a Spanish 409 «El tutor está trabajando; espera a que termine.» and must show it, never queue. The diagnosis flow is: answer the diagnosis → method card (`.method-card`, POST api/metodo) → one planning turn → Parte 1 offer. #187 builds on that: offer «Ir a Parte 1» once Parte 1 exists, and after each mini-quiz «Ir a Parte N+1» (passed) or «Regenerar Parte N» (failed).
- L3 (diagnosis): live topic `introduccion-fundamentos-rl` Parte 1 = 2734 words, 12 sections, 0 lk-math. VPS `~/.claude/skills/explicacion-interactiva` and `~/.agents/skills/explicacion-interactiva` link to `~/skills-registry` (stale, sha `ba48f0e3`; repo `77f79d18`). `~/Learnings/AGENTS.md` (unversioned, edited 2026-11-07) and `~/Learnings/preferencias.md` prescribe the old anatomy as "Inamovible"/"Exclusivo"; the repo SKILL.md itself lists the 12-item Método Puro as mandatory next to the 450-word rule.
