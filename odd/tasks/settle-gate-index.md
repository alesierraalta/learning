# Settle gate and index links
Objective: the study chat must never end a turn with a half-written stage, and the explanation index must never send the learner to a non-existent or misplaced note.
Authorized ("si"): engine and skill changes with tests, repair of the real topic gramatica-y-phrasal-verbs-speaking, deletion of the empty note Obsidian created at the vault root.

## Specs
S1 — "Luego del quiz me armó mapa, mis palabras, planificador y una página de explicaciones que, bueno, tiene parte 1, parte 2, parte 3 y parte 4. Pero no está la parte"
S2 — "si yo le doy clic, me abre en un directorio totalmente distinto llamado explicaciones que dice parte 1, pero la página está vacía. [...] me lo manda a un lado totalmente distinto de donde debería ir."
S3 — "Y nadie le dice que eso está mal."

## Tasks
T1 — S3 — engine status reports blocked when the frontier stage was started and fails non-learner checks — inline — done (9f66eea)
T2 — S1,S2 — index_note requires one canonical vault-relative link per plan part — inline — done (15b299f)
T3 — S1,S2 — skill: index link format; pending parts rule — inline — done (home repo 30913f7, skill v1.25)
T4 — S1,S2,S3 — repair the real topic and remove the stray empty note — inline — done (L3)

## Log
L1 — "Valida esto porque lo que me acaba de hacer el modelo es importantísimo. Luego del quiz me armó mapa, mis palabras, planificador y una página de explicaciones que, bueno, tiene parte 1, parte 2, parte 3 y parte 4. Pero no está la parte, o sea, me sale la parte 1 abierta, pero no, no está por ningún lado. Y si yo le doy clic, me abre en un directorio totalmente distinto llamado explicaciones que dice parte 1, pero la página está vacía. Y no solamente es que no me cree el contenido, sino que me lo manda a un lado totalmente distinto de donde debería ir. Y nadie le dice que eso está mal."
L2 — Evidence: run 0d5c24907ca68853, model gpt-6-luna after a Claude session limit; diagnosis advanced 10/12; planning validate FAILs planning-link, planificador-sections ("vuelco"), mis-palabras-skeleton (0/4); index links slugs that differ from plan.json; Obsidian created 0-byte ale/explicaciones/Parte 1 - Negacion y frase clara.md; settle gate uses `status`, which returned accepted/next planning without evaluating planning. User: "si".
L3 — T1: status evaluates a started frontier stage (own files only: files no earlier stage declares) read-only and returns its non-learner FAILs as blocked; RED/GREEN TestStatusBlocksAStartedFailingFrontierStage; fixture writePlan no longer writes empty part stubs; 4/4 mutants killed (no eval, always started, waits as failures, shared files start a stage); -race green. T2: index_note needs [[<vault-relative topic>/explicaciones/Parte N - <plan slug>|...]] for every plan part (vault root = nearest .obsidian ancestor) and no undefined part links; 4/4 mutants killed (one earlier "survivor" was a non-compiling mutant). Extra: bibliography verified mark matched case-insensitively (real note wrote "✅ Verificado"), test + mutant. T3: skill obsidian-university §3, learning-validation planning row, SKILL.md rule "stages complete or nothing". T4: real topic repaired: plan.json p1/p4 title+slug aligned with the planning notes (Negacion y frase clara, Phrasal verbs al hablar), focusAreas ["r5","5"] (goal text moved into diagnosisSummary); planificador heading "Vuelco con tus palabras"; mis-palabras four areas with the canonical prompt; index with vault-relative canonical links, all parts pending; stray 0-byte ale/explicaciones/Parte 1 - Negacion y frase clara.md and its empty folder removed; validate planning accepted, advanced; status accepted next explanation p1. Adapter 25/25; Go suite green; main pushed; bin rebuilt.
