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
  `howToReadFollows`) removed. 181 Go tests pass.
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

## Log

L1 (user, verbatim): "Por eso necesito que haya algo más que una skill que está bien, la verdad es que eso está muy bien, pero necesito que haya algo que se que pueda validar, que pueda que pueda certificar que todo lo que se pide, tanto visual, diagramas, las mini demos, todo esté y cumpla parámetros mínimos de calidad. O sea, que el motor los detecte y entienda, diga, bueno, sí, y me siento me chiste de explicación y cumple con todo, se puede entregar. Listo, chao."

L2: The skill-only gate (counted visual minimum before replying) was insufficient on its own; this change moves the enforcement into the engine so delivery itself is blocked.

L3: Fence-body lines were being judged as after-lines (fixed by skipping fenced bodies); inline elements now wait for their marker line with extras on the same line counted as missing.

L4: Real run 10/10 PASS. Note: editing `explicacion.md` after planning rewinds the frontier to planning (`index_note` receipts the index there), so the delivery flow re-advances planning before advancing `explanation`.

L5: "Pantalla completa" did not work inside the Studio because demo embeds lacked `allow="fullscreen"`; the kit swallowed the rejection silently. Fixed in the embed attributes and by surfacing the denial as a visible hint.

L6: Demo vocabulary chosen from what the vault actually renders today (per the user's walkthrough screenshot and the kit docs): `lk-widget` for parameter playgrounds (the neural-net style the user described), `lk-walkthrough` for stepped decks. The user's photo of the wanted visual TYPES may extend `demoElements`; the rules file is the single place to extend it.
