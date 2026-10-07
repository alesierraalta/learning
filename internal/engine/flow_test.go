package engine

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Full two-part deep run: per-stage validation, learner evidence, a
// condition-after-feedback obligation, and fail-closed completion.
func TestFullMultiPartFlowReachesCompleted(t *testing.T) {
	f := newFixture(t)

	rep, code := f.run(t, f.opts("init", ""))
	assertGatePassing(t, rep, code, "accepted")
	if rep.NextStage != "preparation" {
		t.Fatalf("init nextStage = %q, want preparation", rep.NextStage)
	}
	if _, ok := hasCheck(rep, "run-initialized"); !ok {
		t.Fatalf("init report missing run-initialized check: %+v", rep.Checks)
	}

	// Nothing recorded yet: status is actionable, never PASS-with-FAIL.
	rep = f.statusExpect(t, "accepted")
	if rep.NextStage != "preparation" {
		t.Fatalf("status nextStage = %q, want preparation", rep.NextStage)
	}

	// preparation
	f.writePlan(t, defaultParts()...)
	f.advanceOK(t, "preparation")

	// diagnosis: questions exist, answers pending -> waiting (no FAIL checks).
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6))
	rep = f.statusExpect(t, "waiting")
	if rep.NextStage != "diagnosis" {
		t.Fatalf("waiting nextStage = %q, want diagnosis", rep.NextStage)
	}
	// advancing without learner answers is a failed mandatory validation.
	f.advanceExpectBlocked(t, "diagnosis", "quiz-answers", "waiting")
	stateBefore := f.tryReadState(t)

	f.writeDiagAnswers(t, 2, 6) // d3 and d7 wrong
	rep = f.advanceOK(t, "diagnosis")
	score, _ := rep.Evidence["diagnosticScore"].(string) // derived by the engine
	if score != "10/12" {
		t.Fatalf("diagnosticScore evidence = %q, want 10/12 (derived from answers)", score)
	}
	if string(f.tryReadState(t)) == string(stateBefore) {
		t.Fatal("state must change after a successful advance")
	}

	// planning: plan rewritten to link the diagnostic results.
	f.writePlanWith(t, "Dificultades detectadas en consenso y en quórums.", []string{"d3"}, defaultParts()...)
	rep = f.advanceOK(t, "planning")
	if rep.Part != "p1" {
		t.Fatalf("planning next part = %q, want p1", rep.Part)
	}

	// explanation p1: both applicable reviews are recorded with the advance.
	f.writeExplanation(t, "p1", true, "contexto extra.")
	rep = f.advanceOK(t, "explanation")
	if n := len(f.state(t)["semantic"].([]any)); n != 2 {
		t.Fatalf("recorded reviews = %d, want 2", n)
	}
	if _, ok := hasCheck(rep, "explanation-adapted"); !ok {
		t.Fatalf("semantic check missing from report: %+v", rep.Checks)
	}

	// own_words p1
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")

	// quiz p1: 4/5 derived from answers (caller cannot supply a score).
	f.writeQuizQuestions(t, "p1")
	rep = f.statusExpect(t, "waiting")
	if rep.NextStage != "quiz" {
		t.Fatalf("waiting nextStage = %q, want quiz", rep.NextStage)
	}
	f.writeQuizAnswers(t, "p1", 4)
	rep = f.advanceOK(t, "quiz")
	if sc, _ := rep.Evidence["quizScore"].(int); sc != 4 {
		t.Fatalf("quizScore evidence = %v, want 4 (derived)", rep.Evidence["quizScore"])
	}
	st := f.state(t)
	parts := st["parts"].(map[string]any)
	p1 := parts["p1"].(map[string]any)
	pstages := p1["stages"].(map[string]any)
	if _, ok := pstages["quiz"]; !ok {
		t.Fatalf("quiz not recorded in state: %+v", pstages)
	}

	// feedback p1 with detected difficulty.
	f.writeFeedback(t, "p1", true)
	f.advanceOK(t, "feedback")

	// S4: adaptation requires plan.json changed AFTER the feedback snapshot.
	f.advanceExpectBlocked(t, "adaptation", "feedback-condition", "after feedback")

	// Plan edit makes planning stale first: repair order is enforced.
	f.writePlanWith(t, "Dificultades detectadas en consenso y en quórums; foco ampliado.", []string{"d3"}, defaultParts()...)
	f.advanceExpectBlocked(t, "adaptation", "sequence", "planning")
	f.advanceOK(t, "planning")
	f.advanceOK(t, "adaptation")

	// part 2 of 2: topic must NOT be complete after only the first part.
	rep = f.statusExpect(t, "accepted")
	if rep.NextStage != "explanation" || rep.Part != "p2" {
		t.Fatalf("after p1: nextStage=%q part=%q, want explanation/p2", rep.NextStage, rep.Part)
	}

	f.writeExplanation(t, "p2", false, "sin diagrama planificado.")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p2")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p2")
	f.writeQuizAnswers(t, "p2", 5)
	rep = f.advanceOK(t, "quiz")
	if sc, _ := rep.Evidence["quizScore"].(int); sc != 5 {
		t.Fatalf("p2 quizScore = %v, want 5", rep.Evidence["quizScore"])
	}

	// p2 has no detected difficulty: condition not triggered -> SKIP, no plan edit.
	f.writeFeedback(t, "p2", false)
	f.advanceOK(t, "feedback")
	rep = f.advanceOK(t, "adaptation")
	cond, ok := hasCheck(rep, "feedback-condition")
	if !ok || cond.Status != "SKIP" {
		t.Fatalf("adaptation condition check = %+v, want SKIP", cond)
	}

	// Every part done: the closing stages are still mandatory.
	rep = f.statusExpect(t, "accepted")
	if rep.NextStage != "exercises" {
		t.Fatalf("nextStage = %q, want exercises", rep.NextStage)
	}
	f.advanceExpectBlocked(t, "final", "sequence", "exercises")

	f.writeClosingArtifacts(t, "B", "Cada réplica acepta el mismo registro ordenado.", "1/1")
	f.advanceOK(t, "exercises")
	f.advanceOK(t, "final_quiz")
	f.rescoreMap(t, "cierre")

	// final: only now is the topic completed; final declares no reviews.
	opts := f.opts("advance", "final")
	rep, code = f.run(t, opts)
	assertGatePassing(t, rep, code, "completed")
	if rep.NextStage != "" {
		t.Fatalf("completed nextStage = %q, want empty", rep.NextStage)
	}

	st = f.state(t)
	if n := successfulAdvances(t, st); n != 17 {
		t.Fatalf("successfulAdvances = %v, want 17 accepted state writes", n)
	}

	// status stays completed and writes nothing.
	f.statusExpect(t, "completed")
}

// Validation failure must not touch state or successful counters (S3, S7).
func TestStageFailureLeavesStateUntouched(t *testing.T) {
	f := newFixture(t)
	f.initOK(t)
	afterInit := f.tryReadState(t)

	f.write(t, "plan.json", `{"topic":"x","parts":[]}`)
	rep := f.advanceExpectBlocked(t, "preparation", "plan-structure", "part")

	if string(f.tryReadState(t)) != string(afterInit) {
		t.Fatal("failed advance mutated state.json")
	}
	if n := successfulAdvances(t, f.state(t)); n != 0 {
		t.Fatalf("successfulAdvances = %v, want 0 after failures", n)
	}
	if rep.NextStage != "preparation" {
		t.Fatalf("blocked nextStage = %q, want preparation", rep.NextStage)
	}
}

// Model-authored done flags are never trusted; only objective inputs count.
func TestDoneFlagsAreNotTrusted(t *testing.T) {
	f := newFixture(t)
	f.initOK(t)
	f.writePlan(t, defaultParts()...)
	f.advanceOK(t, "preparation")
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6))
	// A done flag instead of real learner answers.
	f.write(t, "quiz.answers.json", `{"completed":true,"done":true}`)
	f.advanceExpectBlocked(t, "diagnosis", "quiz-answers", "answers")
}

// Quantitative structure of the diagnostic is enforced objectively.
func TestDiagnosticStructureEnforced(t *testing.T) {
	cases := []struct {
		name   string
		qs     []diagQuestionWire
		broken func(*diagQuestionWire)
		want   string
	}{
		{name: "missing prerequisite", qs: buildDiagQuestions(5, 6), want: "prerequisite"},
		{name: "missing topic question", qs: buildDiagQuestions(6, 5), want: "topic"},
		{name: "option set broken", qs: buildDiagQuestions(6, 6), broken: func(q *diagQuestionWire) {
			q.Options["E"] = "No lo sé"
		}, want: "No sé"},
		{name: "wrong topic level distribution", qs: buildDiagQuestions(6, 6), broken: func(q *diagQuestionWire) {
			if q.Type == "topic" {
				q.Level = 3
			}
		}, want: "level"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			f.initOK(t)
			f.writePlan(t, defaultParts()...)
			f.advanceOK(t, "preparation")
			if tc.broken != nil {
				for i := range tc.qs {
					if tc.qs[i].Type == "topic" {
						tc.broken(&tc.qs[i])
						break
					}
				}
			}
			f.writeDiagQuestions(t, tc.qs)
			f.writeDiagAnswers(t)
			f.advanceExpectBlocked(t, "diagnosis", "quiz-structure", tc.want)
		})
	}
}

// A failing mini-quiz routes to bounded re-teaching; exhaustion blocks.
func TestQuizReteachBoundAndDerivedScore(t *testing.T) {
	f := newFixture(t)
	f.initOK(t)
	f.writePlan(t, partCfg{id: "p1", ex: true, vis: true, title: "Parte"})
	f.advanceOK(t, "preparation")
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6))
	f.writeDiagAnswers(t, 2, 6)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades detectadas.", []string{"d3"}, partCfg{id: "p1", ex: true, vis: true, title: "Parte"})
	f.advanceOK(t, "planning")
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")

	// Round 1: derived 2/5 -> re-teach, records cleared, no PASS claimed.
	f.writeQuizAnswers(t, "p1", 2)
	rep := f.advanceOK(t, "quiz")
	if sc, _ := rep.Evidence["quizScore"].(int); sc != 2 {
		t.Fatalf("quizScore = %v, want 2", rep.Evidence["quizScore"])
	}
	if rep.NextStage != "explanation" {
		t.Fatalf("after failed quiz nextStage = %q, want explanation", rep.NextStage)
	}
	st := f.state(t)
	p1 := st["parts"].(map[string]any)["p1"].(map[string]any)
	if r := p1["reteachRounds"].(float64); r != 1 {
		t.Fatalf("reteachRounds = %v, want 1", r)
	}
	if _, ok := p1["stages"].(map[string]any)["explanation"]; ok {
		t.Fatal("explanation must be reopened after a failed quiz")
	}

	// Round 2: still failing (3/5).
	f.writeExplanation(t, "p1", true, "v2 revisada")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizAnswers(t, "p1", 3)
	f.advanceOK(t, "quiz")
	st = f.state(t)
	p1 = st["parts"].(map[string]any)["p1"].(map[string]any)
	if r := p1["reteachRounds"].(float64); r != 2 {
		t.Fatalf("reteachRounds = %v, want 2", r)
	}

	// Round 3: bound exhausted -> blocked, state untouched.
	f.writeExplanation(t, "p1", true, "v3")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizAnswers(t, "p1", 1)
	before := f.tryReadState(t)
	f.advanceExpectBlocked(t, "quiz", "reteach-bound", "re-teach")
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("exhausted re-teach must not mutate state")
	}

	// A passing attempt unlocks feedback again.
	f.writeQuizAnswers(t, "p1", 5)
	rep = f.advanceOK(t, "quiz")
	if sc, _ := rep.Evidence["quizScore"].(int); sc != 5 {
		t.Fatalf("quizScore = %v, want 5", rep.Evidence["quizScore"])
	}
	if rep.NextStage != "feedback" {
		t.Fatalf("passing quiz nextStage = %q, want feedback", rep.NextStage)
	}
}

// S4: an edit made BEFORE feedback must not satisfy the later obligation.
func TestPlanChangeBeforeFeedbackDoesNotSatisfyAdaptation(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 5)
	f.advanceOK(t, "quiz")

	// Edit the plan BEFORE feedback (legal, repairs planning first).
	f.writePlanWith(t, "Edicion previa al feedback.", []string{"d3"}, defaultParts()...)
	f.advanceExpectBlocked(t, "adaptation", "sequence", "planning")
	f.advanceOK(t, "planning")

	f.writeFeedback(t, "p1", true)
	f.advanceOK(t, "feedback")

	// No edit after the snapshot: adaptation must fail even though the plan
	// changed earlier.
	f.advanceExpectBlocked(t, "adaptation", "feedback-condition", "after feedback")

	// Edit after feedback -> obligation satisfiable and verifiable.
	f.writePlanWith(t, "Edicion posterior al feedback, planificacion actualizada.", []string{"d3"}, defaultParts()...)
	f.advanceExpectBlocked(t, "adaptation", "sequence", "planning")
	f.advanceOK(t, "planning")
	rep := f.advanceOK(t, "adaptation")
	cond, _ := hasCheck(rep, "feedback-condition")
	if cond.Status != "PASS" {
		t.Fatalf("condition check = %+v, want PASS after post-feedback edit", cond)
	}

	// Complete the remaining part quickly (p2, no difficulty).
	f.statusExpect(t, "accepted")
	f.writeExplanation(t, "p2", false, "v2")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p2")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p2")
	f.writeQuizAnswers(t, "p2", 5)
	f.advanceOK(t, "quiz")
	f.writeFeedback(t, "p2", false)
	f.advanceOK(t, "feedback")
	f.advanceOK(t, "adaptation")
	f.writeClosingArtifacts(t, "B", "Cada réplica acepta el mismo registro.", "1/1")
	f.advanceOK(t, "exercises")
	f.advanceOK(t, "final_quiz")
	f.rescoreMap(t, "cierre")
	rep, code := f.run(t, f.opts("advance", "final"))
	assertGatePassing(t, rep, code, "completed")
}

// Receipt freshness: edits after completion invalidate completion (S7).
func TestEditsInvalidateCompletion(t *testing.T) {
	f := newFixture(t)
	f.completeSinglePartRun(t)
	p1 := partCfg{id: "p1", ex: true, vis: true, title: "Parte"}

	// Edit the plan after completion: planning receipt is stale.
	f.writePlanWith(t, "Editada tras completar; sigue vinculada al diagnostico.", []string{"d3"}, p1)
	rep := f.statusExpect(t, "blocked")
	c, _ := hasCheck(rep, "receipts-fresh")
	if !strings.Contains(c.Reason, "planning") {
		t.Fatalf("receipts-fresh reason = %q, want stale planning receipt", c.Reason)
	}

	// Repair in frontier order: planning first, then the stale adaptation
	// proof (the edit also invalidated it), then completion is provable again.
	f.advanceOK(t, "planning")
	rep = f.statusExpect(t, "blocked")
	if c, _ := hasCheck(rep, "receipts-fresh"); !strings.Contains(c.Reason, "adaptation") {
		t.Fatalf("receipts-fresh reason = %q, want stale adaptation receipt", c.Reason)
	}
	f.advanceOK(t, "adaptation")
	// The completion proof re-validated plan.json; it must be re-established.
	rep = f.statusExpect(t, "blocked")
	if c, _ := hasCheck(rep, "receipts-fresh"); !strings.Contains(c.Reason, "final") {
		t.Fatalf("receipts-fresh reason = %q, want stale final receipt", c.Reason)
	}
	f.advanceOK(t, "final")
	f.statusExpect(t, "completed")
}

// An edit to a judged artifact invalidates both the stage receipt and the
// recorded reviews; repair requires re-recording them against the edit.
func TestEditedExplanationRequiresRejudgment(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	if n := len(f.state(t)["semantic"].([]any)); n != 2 {
		t.Fatalf("recorded reviews = %d, want 2", n)
	}
	f.writeExplanation(t, "p1", true, "v2 cambiada despues del juicio")

	rep := f.statusExpect(t, "blocked")
	if _, ok := hasCheck(rep, "semantic-receipts"); !ok {
		t.Fatalf("stale review not reported: %+v", rep.Checks)
	}

	// Repairing re-records the reviews against the new artifact hash.
	f.advanceOK(t, "explanation")
	if n := len(f.state(t)["semantic"].([]any)); n != 2 {
		t.Fatalf("recorded reviews after repair = %d, want 2", n)
	}
}

// completeSinglePartRun drives a one-part topic to engine completion with a
// detected difficulty, including the mandatory post-feedback plan change.
func (f *fixture) completeSinglePartRun(t *testing.T) {
	t.Helper()
	f.completeThroughAdaptation(t)
	f.writeClosingArtifacts(t, "B", "Cada réplica acepta el mismo registro.", "1/1")
	f.advanceOK(t, "exercises")
	f.advanceOK(t, "final_quiz")
	f.rescoreMap(t, "cierre")
	rep, code := f.run(t, f.opts("advance", "final"))
	assertGatePassing(t, rep, code, "completed")
}

// Rules are the source of truth: changing them invalidates recorded runs.
func TestRulesChangeInvalidatesState(t *testing.T) {
	f := newFixture(t)
	f.initOK(t)
	f.writePlan(t, defaultParts()...)

	alt := filepath.Join(t.TempDir(), "deep-alt.json")
	raw, err := os.ReadFile(repoRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	modified := strings.Replace(string(raw), `"minPassingScore": 4`, `"minPassingScore": 3`, 1)
	if modified == string(raw) {
		t.Fatal("rules fixture did not change")
	}
	if err := os.WriteFile(alt, []byte(modified), 0o644); err != nil {
		t.Fatal(err)
	}

	opts := f.opts("status", "")
	opts.RulesPath = alt
	rep, code := f.run(t, opts)
	assertBlocked(t, rep, code)
	c, ok := hasCheck(rep, "rules-current")
	if !ok || !strings.Contains(c.Reason, "changed since init") {
		t.Fatalf("rules-current check = %+v, want drift failure", c)
	}
}

// Out-of-order and unknown stages are rejected without mutating state.
func TestOutOfOrderAdvanceRejected(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	before := f.tryReadState(t)

	rep := f.advanceExpectBlocked(t, "feedback", "sequence", "explanation")
	if rep.NextStage != "explanation" {
		t.Fatalf("blocked nextStage = %q, want explanation", rep.NextStage)
	}
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("out-of-order advance mutated state")
	}

	opts := f.opts("advance", "nonsense-stage")
	_, code := f.run(t, opts)
	if code != 2 {
		t.Fatalf("unknown stage exit code = %d, want 2", code)
	}
}

// throughPassingQuiz prepares a one-part run whose p1 mini-quiz passes 5/5.
func throughPassingQuiz(t *testing.T) *fixture {
	t.Helper()
	f := newFixture(t)
	f.initOK(t)
	part := partCfg{id: "p1", ex: true, vis: true, title: "Parte"}
	f.writePlan(t, part)
	f.advanceOK(t, "preparation")
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6))
	f.writeDiagAnswers(t, 2, 6)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades detectadas.", []string{"d3"}, part)
	f.advanceOK(t, "planning")
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 5)
	f.advanceOK(t, "quiz")
	return f
}

// relearnPart rewrites p1 and passes explanation, own_words and quiz again.
func (f *fixture) relearnPart(t *testing.T, marker string) {
	t.Helper()
	f.writeExplanation(t, "p1", true, marker)
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizAnswers(t, "p1", 5)
	f.advanceOK(t, "quiz")
}

// A central gap in the learner's own words re-teaches the part: feedback
// reopens explanation/own_words/quiz, the explanation must really change, and
// the rounds share the bounded re-teach budget with failed mini-quizzes.
func TestCentralGapReteachesThePart(t *testing.T) {
	f := throughPassingQuiz(t)
	f.writeFeedback(t, "p1", true)
	f.recordReview(t, "feedback", "central-gap", "PASS", "confunde la idea central de la parte")

	rep := f.advanceOK(t, "feedback")
	if rep.NextStage != "explanation" || rep.Part != "p1" {
		t.Fatalf("central gap: nextStage=%q part=%q, want explanation/p1", rep.NextStage, rep.Part)
	}
	p1 := f.state(t)["parts"].(map[string]any)["p1"].(map[string]any)
	if r := p1["reteachRounds"].(float64); r != 1 {
		t.Fatalf("reteachRounds = %v, want 1", r)
	}
	stages := p1["stages"].(map[string]any)
	for _, s := range []string{"explanation", "own_words", "quiz", "feedback"} {
		if _, ok := stages[s]; ok {
			t.Fatalf("stage %s must be reopened after a central gap", s)
		}
	}

	f.advanceExpectBlocked(t, "explanation", "explanation-revised", "byte-identical")

	// Second round: the gap persists once more.
	f.relearnPart(t, "v2 reexplicada")
	f.writeFeedback(t, "p1", true)
	f.recordReview(t, "feedback", "central-gap", "PASS", "la laguna central sigue")
	f.advanceOK(t, "feedback")

	// Budget exhausted: a third gap blocks without touching state.
	f.relearnPart(t, "v3 reexplicada")
	f.writeFeedback(t, "p1", true)
	f.recordReview(t, "feedback", "central-gap", "PASS", "la laguna central sigue")
	before := f.tryReadState(t)
	f.advanceExpectBlocked(t, "feedback", "reteach-bound", "re-teach")
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("exhausted re-teach must not mutate state")
	}

	// Without a gap the part closes normally.
	f.recordReview(t, "feedback", "central-gap", "FAIL", "explica bien la idea central")
	if rep := f.advanceOK(t, "feedback"); rep.NextStage == "explanation" {
		t.Fatal("feedback without a central gap must not reopen the part")
	}
}
