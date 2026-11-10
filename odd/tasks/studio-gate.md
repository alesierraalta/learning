# Studio gate

Objective: the engine's discipline stops depending on Pi. A turn with any tutor — Pi or Antigravity — may not end while the engine reports a failing stage, and the learner's questions are asked by the page, not by an agent that cannot ask.

Authorized by the owner on 2026-11-10 ("Mover el gate al estudio para los dos runtimes"), branch `feat/180-studio-gate`, issue #180. Push and merge stay the user's decision.

## Specs

S1 — "ni me creó la página": a turn that should produce a page ends as prose, and the learner cannot tell whether the tutor finished or gave up.
S2 — "ni me preguntó si quería universitario o rápido": the question that decides between a quick note and a deep topic is never asked when Antigravity tutors.
S3 — "Mover el gate al estudio para los dos runtimes": one rule, in the studio, binding Pi and Antigravity alike; the gate stops being duplicated in the Pi extension.
S4 — "veo más probable que utilice Antigravity como main porque es el que tengo más uso sin darle uso real": Antigravity must be a first-class tutor, not a lesser one.

## Tasks

T1 — S1,S3,S4 — the studio's settle loop: engine `status` when a turn settles, a follow-up prompt built from the failing checks' own reasons, the same bounded correction budget Pi uses today, and the learner told when the budget is spent; the Pi extension stops double-gating. Route: worker. Commit: see Log.
T2 — S2,S4 — the learner's mode question asked by the page (the studio owns the card), the answer shaping the prompt of the turn; Antigravity cannot receive dialogs, so the agent is never the one asking. Route: worker. Commit: see Log.
T3 — S1,S2,S3,S4 — one conformance test that runs the same gate scenario against both runtimes, and `docs/studio.md` tells the truth about what bounds a turn. Route: worker. Commit: see Log.

## Log

L1 — "y ademas me dice esto que ni me creo la pagina, ni me pregunto si queria universitario o rapido: He registrado el plan completo de estudio para **Aprendizaje por Refuerzo** con los 128 subtemas planificados en plan.json y he avanzado la etapa de preparación en el motor de aprendizaje. La **Ronda 1 del diagnóstico inicial** ya está preparada en quiz.md con 3 preguntas sobre conceptos base: [...] Para responder, ve a la vista de estudio y pulsa «Responder el diagnóstico»."
L2 — Scope decision, verbatim: "Mover el gate al estudio para los dos runtimes" — the option the owner picked: the turn does not settle while `learning status` is not clear, for any runtime, with a bounded correction budget and the engine's own words as the instruction; learner questions move to the page.
L3 — Evidence for S1/S2 on the live studio (VPS, commit 0d639ab, agy conversation `b8faee73`): the turn wrote `plan.json` (16:15), advanced preparation (16:16), wrote `quiz.json` + `quiz.md` (16:18); engine `waiting, stage: diagnosis`; no `explicaciones/Parte 1 - ….md`; the learner was never asked rápido/universitario.
L4 — Why Antigravity behaved that way, measured: the gate is `integrations/pi/index.ts:368` (`agent_before_settle`), and `agente:"agy"` runs one plain process per turn (`studio/agy.ts`), so nothing binds it; `agy -p` cannot answer dialogs (`studio/agy.ts:278`), so the agent can never be the one asking S2's question.
L5 — Boundary: the engine's diagnosis-first rule is untouched by this feature. A university topic still goes plan → diagnosis → the learner's answers → its parts; the gate makes the tutor ask, finish what it started, and say plainly when it cannot. Producing a part page in the same turn would mean changing the engine's rules, and that is a separate decision.
L6 — The note offer for the diagnosis landed first and separately (`fix/175-diagnosis-note`, PR #179), so the learner reaches the diagnosis while this feature is in flight.
