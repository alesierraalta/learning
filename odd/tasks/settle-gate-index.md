# Settle gate and index links
Objective: the study chat must never end a turn with a half-written stage, and the explanation index must never send the learner to a non-existent or misplaced note.
Authorized ("si"): engine and skill changes with tests, repair of the real topic gramatica-y-phrasal-verbs-speaking, deletion of the empty note Obsidian created at the vault root.

## Specs
S1 — "Luego del quiz me armó mapa, mis palabras, planificador y una página de explicaciones que, bueno, tiene parte 1, parte 2, parte 3 y parte 4. Pero no está la parte"
S2 — "si yo le doy clic, me abre en un directorio totalmente distinto llamado explicaciones que dice parte 1, pero la página está vacía. [...] me lo manda a un lado totalmente distinto de donde debería ir."
S3 — "Y nadie le dice que eso está mal."

## Tasks
T1 — S3 — engine status reports blocked when the frontier stage was started and fails non-learner checks — inline — pending
T2 — S1,S2 — index_note requires one canonical vault-relative link per plan part — inline — pending
T3 — S1,S2 — skill: index link format; pending parts rule — inline — pending
T4 — S1,S2,S3 — repair the real topic and remove the stray empty note — inline — pending

## Log
L1 — "Valida esto porque lo que me acaba de hacer el modelo es importantísimo. Luego del quiz me armó mapa, mis palabras, planificador y una página de explicaciones que, bueno, tiene parte 1, parte 2, parte 3 y parte 4. Pero no está la parte, o sea, me sale la parte 1 abierta, pero no, no está por ningún lado. Y si yo le doy clic, me abre en un directorio totalmente distinto llamado explicaciones que dice parte 1, pero la página está vacía. Y no solamente es que no me cree el contenido, sino que me lo manda a un lado totalmente distinto de donde debería ir. Y nadie le dice que eso está mal."
L2 — Evidence: run 0d5c24907ca68853, model gpt-6-luna after a Claude session limit; diagnosis advanced 10/12; planning validate FAILs planning-link, planificador-sections ("vuelco"), mis-palabras-skeleton (0/4); index links slugs that differ from plan.json; Obsidian created 0-byte ale/explicaciones/Parte 1 - Negacion y frase clara.md; settle gate uses `status`, which returned accepted/next planning without evaluating planning. User: "si".
