# Meaningful figures: a worked example is not a stack of cards

Issue #399. Production evidence reported by the user: «Gestión» Parte 2 draws its worked example as one `<lk-guided>` with `"form": "example"` and four steps. Each step holds exactly one `cards` block and no other visual block. The S29 gate accepts it, because it counts steps and figures and not what the figure shows. This change did not access production.

## Specs

S1. «las visuales lo que hacen es hacer un visual y meter todo en cuadros. O sea, eso no es un visual» — a worked example made only of text cards is not a visual.

S2. «hazlo y arreglalo» — approval to implement the fix now.

S3. Shared Pi/Antigravity rule: text cards alone are not a worked example. Keep the cards that help, and add beside them the real state or data each step changes (`rows`, `numbers` or `formula`).

S4. Preserve existing published notes (no rewrite; their S10 verdicts unchanged), the other step figures (`lk-stage`, `lk-codestep`, `lk-tablestep`, `lk-lanes`), Mermaid sections, and `cards` inside other forms.

S5. Target the concrete shape only: `lk-guided` with `form` = `example`. A step whose blocks include `cards` must also include, in that same step, a `rows`, `numbers` or `formula` block. A cards-only step fails even when another step has data, and the finding names the offending step numbers. The rule checks that the block is present; it never judges whether the data are right or useful. This is not a universal visual-quality classifier. (Per-step since L8; the element-level wording of T1 was wrong.)

## Synthetic reproduction

Isolated and written for the tests. It is not the production note.

- `<lk-guided>` with `"form": "example"`, four steps, and in each step `blocks` = one `{"kind": "cards", ...}` with a `focus`.
- Expected today: no finding (RED), because S29 only counts four steps and a figure per section.

## Rule decisions

- Scope is the S29 scope: notes that use only the new step figures (`usesStepFigures` in Go, `usaFigurasDePaso` in JS). No rules-threshold change: a change to `rules/deep.json` invalidates the hash of learners' topics (see the `stepFigureElements` comment in `internal/engine/checks.go`).
- Granularity is the step (since L8; the element-level rule of L3 is withdrawn). A step with `cards` and no `rows`, `numbers` or `formula` block fails, and the finding names its step number. Scope does not change: only `lk-guided` with `form` = `example`. Per-step is stricter than the element-level rule, because the element-level rule let one data step excuse the cards-only steps beside it, which contradicts the contract's «en el mismo paso».
- `note` blocks are text and do not count as state or data.
- Finding text is Spanish, like the sibling section finding. Code comments are Spanish, like the files they sit in.

## Tasks

| ID | Specs | Route | Status |
| --- | --- | --- | --- |
| T1 | S1, S5 | this document, written before any source edit | done |
| T2 | S5, S4 | RED: Go `TestTextCardsOnlyWorkedExampleIsRefused`, JS «un ejemplo resuelto de solo tarjetas…»; PRESERVE tests for cards beside state and for cards in another form | done (RED observed, L2) |
| T3 | S5 | GREEN: `textCardsExampleFindings` in `internal/engine/standard_figuras.go`; `problemasDeEjemplo` in `tools/explain-check/rules/figuras.mjs` | done (L3); element-level check superseded by T6 (L8) |
| T4 | S3 | one sentence in `integrations/pi/contract.ts`; a §2b paragraph and a §2c checklist line in `skills/explicacion-interactiva/references/visuales.md` | done (L4) |
| T5 | S4 | PRESERVE and format checks (see Validation) | done (L2–L4) |
| T6 | S1, S3–S5 | L8 verifier finding: per-step guard in both mirrors that names the offending step numbers; RED mixed example; differential PRESERVE matrix; handbooks and contract aligned to the same-step rule and to the check that runs it | in progress |

## Validation

Focused checks only. No browser suites, no full `go test ./...`, no fleet offload, no git writes.

- RED Go (before the fix, observed): `rtk proxy go test ./internal/engine -v -run '^(TestCardsOnlyStepFailsEvenBesideADataStep|TestTextCardsRuleChangesOnlyTheObservedShape|TestTextCardsOnlyWorkedExampleIsRefused)$' -count=1` — expected FAIL on the mixed test (no finding), on the differential rows observed, data-first, cards-beside-note and Mermaid, and on TestTextCardsOnlyWorkedExampleIsRefused (wording); expected PASS on the other differential rows.
- RED JS (before the fix, observed): `rtk node --test --test-name-pattern='^(un paso de solo tarjetas|un ejemplo resuelto de solo tarjetas|una fórmula en el mismo paso|una nota no cuenta|explain-check rechaza)' tools/explain-check.test.mjs` — expected FAIL on the mixed, wording, note and CLI tests; expected PASS on the formula boundary.
- GREEN: the same two commands — expected PASS.
- PRESERVE Go: `rtk go test ./internal/engine -run '^(TestWorkedExampleKeepsCardsBesideItsState|TestCardsOutsideWorkedExampleAreNotRefused|TestStepFigureNeedsFourSteps|TestEveryContentSectionNeedsAFigure|TestLegacyNoteKeepsPassingFigureRules|TestNewStepFiguresHaveNoStepCap)$' -count=1` — expected PASS.
- PRESERVE JS: `rtk node --test --test-name-pattern='^(una figura de paso|una sección de contenido|todas las secciones|una nota antigua sigue pasando las reglas de figuras|un ejemplo resuelto con tarjetas junto a sus números|unas tarjetas fuera de un ejemplo resuelto|pasa una nota con Mermaid y los cinco ejemplos canónicos)' tools/explain-check.test.mjs` — expected PASS.
- File-level run (every test in `standard_figuras_test.go`, the deferred pi-lens target): `rtk proxy go test ./internal/engine -v -run '^(TestStepFigureNeedsFourSteps|TestEveryContentSectionNeedsAFigure|TestLegacyNoteKeepsPassingFigureRules|TestTextCardsOnlyWorkedExampleIsRefused|TestWorkedExampleKeepsCardsBesideItsState|TestCardsOutsideWorkedExampleAreNotRefused|TestCardsOnlyStepFailsEvenBesideADataStep|TestTextCardsRuleChangesOnlyTheObservedShape)$' -count=1` — expected PASS.
- JS syntax: `rtk node --check tools/explain-check/rules/figuras.mjs` — expected no output.
- Contract: `rtk node --test studio/contract.test.mjs` — expected PASS.
- Format: `rtk gofmt -l internal/engine/standard_figuras.go internal/engine/standard_figuras_test.go` — expected no output.

## Known gaps (not changed)

- `skills/explicacion-interactiva/references/estandar-explicacion.md` and `skills/explicacion-interactiva/SKILL.md` still list `cards` as a block for `example` without this constraint. They are outside the allowed surfaces.
- `tools/visuals/audit-note.mjs`, which the contract tells authors to run, is outside the allowed surfaces and was not changed. If it carries its own copy of the S29 rules, it needs the same check.
- The production «Gestión» Parte 2 note is not edited. A fresh gate run over it will report the finding. Regenerating it is a human decision.

## Log

L1. Spec written before source edits. Shape confirmed from the schema in `integrations/pi/kit/guided.js`: `form` ∈ {formula, example, numbers}; block `kind` ∈ {formula, cards, rows, numbers, note}.

L2. RED, observed before any implementation. Go `TestTextCardsOnlyWorkedExampleIsRefused`: `ejemplo de solo tarjetas: [], want one finding`. JS «un ejemplo resuelto de solo tarjetas de texto falla y nombra el elemento»: `true !== false`. In the same runs the PRESERVE tests passed: Go `TestWorkedExampleKeepsCardsBesideItsState`, `TestCardsOutsideWorkedExampleAreNotRefused`, `TestStepFigureNeedsFourSteps`, `TestEveryContentSectionNeedsAFigure`, `TestLegacyNoteKeepsPassingFigureRules`, `TestNewStepFiguresHaveNoStepCap` (6 passed, 1 failed); JS S29 tests and the two new PRESERVE tests (7 passed, 1 failed).

L3. GREEN. `textCardsExampleFindings` and `isTextCardsExample` in `internal/engine/standard_figuras.go`, wired into `figurasFindings`; `problemasDeEjemplo` in `tools/explain-check/rules/figuras.mjs`, wired into `check`. Go, 7 focused tests: 7 passed. JS, 8 focused tests: 8 passed. `gofmt -l` on both Go files: no output.

L4. Shared text. One sentence in `integrations/pi/contract.ts` after the four-steps sentence; a §2b paragraph and a §2c checklist line in `visuales.md`. `node --test studio/contract.test.mjs`: 4 passed.

L5. Mutation check (no-excess-tests), reasoned and not executed: removing the `textCardsExampleFindings` call turns the RED test red; dropping the `rows`/`numbers`/`formula` return turns the mixed PRESERVE test red; dropping the `form` check turns the boundary test red.

L6. Environment, not caused by this change: `integrations/pi/index.ts` reports 15 TypeScript cascade errors (`ImportMeta.url`, implicit `any` in extension callbacks). This worktree has no `node_modules`, so `@earendil-works/pi-coding-agent` and the Node typings do not resolve. The file is outside the allowed surfaces and was neither changed nor installed against.

L7. Not run, by instruction: browser suites (`integrations/pi/kit/test/*`, `scene-lint`), full `go test ./...`, fleet offload, production access. No git writes.

L8. Verifier finding (reported by the user; reproduction is the next step). In an `example`, one `numbers` block in step 4 makes steps 1–3, which hold only `cards`, pass the gate. The contract says «en el mismo paso», so the rule is per step. Root cause: `isTextCardsExample` in `internal/engine/standard_figuras.go` returns false as soon as any step has `rows`, `numbers` or `formula`; the mirror `problemasDeEjemplo` in `tools/explain-check/rules/figuras.mjs` does the same across all steps. Both implement the element-level rule of L3. I wrote in Rule decisions that per-step would be the broader classifier; that was wrong, because the element-level rule is the more lenient one. Plan: RED mixed example (Go and JS) and a differential matrix before the fix; then a per-step guard in both mirrors that names the offending step numbers; no new parser; author instructions point to the check that runs the rule. S5 now states the per-step shape.

L9. RED, observed by the parent and reproduced here: `explain-check rechaza el paso de solo tarjetas en una nota del contrato nuevo` expected `lk-guided 1`, while the CLI reports `lk-guided 2: pasos 1, 2, 3`. The note is `notaDelContratoNuevo()` (stage, codestep, tablestep, the kit's `lk-guided.html`, lanes) followed by `## 3. La gestión` and the appended block. The index counts every `lk-guided` by position, so the appended figure is the second one and the CLI was correct. Fix: the assertion now expects `lk-guided 2` with the same steps `1, 2, 3`, plus a one-line comment. The fixture is unchanged. GREEN: the test passes (1 of 1). Focused JS: the mixed-example group passes (5 of 5) and the PRESERVE group passes (8 of 8, including the Mermaid and canonical-examples test). Focused Go, unchanged by this fix: `TestTextCardsOnlyWorkedExampleIsRefused`, `TestCardsOnlyStepFailsEvenBesideADataStep`, `TestTextCardsRuleChangesOnlyTheObservedShape` (11 subtests), `TestWorkedExampleKeepsCardsBesideItsState` and `TestCardsOutsideWorkedExampleAreNotRefused` pass. Not run: the whole JS test file, browser suites and the full `go test ./...`. No git writes.
