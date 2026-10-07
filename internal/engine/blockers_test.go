package engine

import (
	"strings"
	"testing"

	"learning/internal/rules"
)

// B1: a flow that never produced the mandated study bundle (planificador
// sections, dependency map, bibliography, exercises, final quiz) must not be
// able to reach completion.
func TestMandatoryBundleBlocksCompletion(t *testing.T) {
	f := newFixture(t)
	p1 := partCfg{id: "p1", ex: true, vis: true, title: "Parte"}

	f.readyParts(t, []partCfg{p1}, 2, 6)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 5)
	f.advanceOK(t, "quiz")
	f.writeFeedback(t, "p1", true)
	f.advanceOK(t, "feedback")
	f.writePlanWith(t, "Actualizada tras el feedback.", []string{"d3"}, p1)
	f.advanceOK(t, "planning")
	f.advanceOK(t, "adaptation")

	before := f.tryReadState(t)
	countBefore := successfulAdvances(t, f.state(t))

	rep, code := f.run(t, f.opts("advance", "final"))
	if rep.Status == "completed" {
		t.Fatalf("flow without planificador/mapa/ejercicios/cuestionario-final reached completed (exit %d)", code)
	}
	assertBlocked(t, rep, code)
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("rejected completion mutated state")
	}
	if n := successfulAdvances(t, f.state(t)); n != countBefore {
		t.Fatalf("successfulAdvances changed %v -> %v on rejected completion", countBefore, n)
	}
}

// B2: own-words grading is structural only — a short nonempty learner
// submission must pass; absence must be distinguished from rejection.
func TestShortOwnWordsSubmissionPassesStructuralCheck(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")

	f.writeOwnWordsText(t, "p1", "ok, lo vi")
	opts := f.opts("advance", "own_words")
	rep, code := f.run(t, opts)
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("short nonempty own-words submission rejected: status=%q exit=%d checks=%+v",
			rep.Status, code, rep.Checks)
	}

	// Empty submission stays distinguishable from a missing one.
	f.writeOwnWordsText(t, "p1", "   \n")
	rep, code = f.run(t, opts)
	assertBlocked(t, rep, code)
}

// B3: the rules must declare rubrics for adaptation, visual value and
// distractor quality — not a single explanation rubric.
func TestRulesDeclareSemanticRubrics(t *testing.T) {
	r, err := rules.Load(repoRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	stages := map[string]int{}
	for _, rb := range r.Rubrics {
		stages[rb.Stage]++
	}
	if len(r.Rubrics) < 4 {
		t.Fatalf("rules declare %d rubrics, want >=4 (adaptation, visual, distractor, central-gap)", len(r.Rubrics))
	}
	for _, want := range []string{"explanation", "quiz"} {
		if stages[want] == 0 {
			t.Fatalf("no rubric declared for stage %s (rubrics: %+v)", want, r.Rubrics)
		}
	}
}

// B4: after a failed mini-quiz the explanation must actually change; a
// byte-identical replay is rejected deterministically, and the reopened stage
// needs fresh recorded reviews before it can advance again.
func TestUnchangedReteachExplanationRejected(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 2)
	f.advanceOK(t, "quiz") // failed attempt -> re-teach round 1

	before := f.tryReadState(t)
	opts := f.opts("advance", "explanation")
	rep, code := f.run(t, opts) // explanation file NOT edited
	if rep.Status != "blocked" {
		t.Fatalf("byte-identical re-teach explanation accepted: status=%q exit=%d checks=%+v",
			rep.Status, code, rep.Checks)
	}
	assertBlocked(t, rep, code)
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("rejected replay mutated state")
	}

	// A genuinely changed explanation advances after fresh recorded reviews.
	f.writeExplanation(t, "p1", true, "v2 reescrita desde otro angulo")
	f.reviewPending(t, "explanation")
	rep, code = f.run(t, opts)
	assertGatePassing(t, rep, code, "accepted")
}

// B5: a producer-declared difficultyDetected=false cannot conceal recorded
// wrong answers; the obligation is derived from evidence.
func TestDifficultyConcealmentRejected(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 4) // one wrong answer recorded
	f.advanceOK(t, "quiz")

	f.writeFeedback(t, "p1", false) // claims no difficulty despite the wrong answer
	before := f.tryReadState(t)
	rep, code := f.run(t, f.opts("advance", "feedback"))
	if rep.Status != "blocked" {
		t.Fatalf("difficultyDetected=false with recorded wrong answers accepted: status=%q checks=%+v",
			rep.Status, rep.Checks)
	}
	assertBlocked(t, rep, code)
	if c, ok := hasCheck(rep, "feedback-evidence"); !ok || c.Status != "FAIL" {
		t.Fatalf("want feedback-evidence FAIL, got %+v", rep.Checks)
	}
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("rejected feedback mutated state")
	}
}

// B6: skip/trigger reasons must report the OBSERVED values, not the
// configured constant.
func TestConditionReasonReportsObservedValues(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 5) // clean run -> no derived difficulty
	f.advanceOK(t, "quiz")
	f.writeFeedback(t, "p1", false)
	f.advanceOK(t, "feedback")

	rep := f.advanceOK(t, "adaptation")
	c, ok := hasCheck(rep, "feedback-condition")
	if !ok {
		t.Fatalf("feedback-condition check missing: %+v", rep.Checks)
	}
	if c.Status != "SKIP" {
		t.Fatalf("condition status = %q, want SKIP", c.Status)
	}
	if !strings.Contains(c.Reason, "difficultyDetected=false") {
		t.Fatalf("reason must report observed difficultyDetected=false, got %q", c.Reason)
	}
	if strings.Contains(c.Reason, "(difficultyDetected=true)") {
		t.Fatalf("reason reports configured constant instead of observation: %q", c.Reason)
	}
}

func trunc(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
