package engine

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The #246 bench found 30 of 30 answer keys (diagnosis and mini-quiz) sitting in
// option A: a learner who always marks A passes everything, because the engine
// validated the option text and never where the correct option sits. The rule is
// declared by the rules file (options.varyAnswerKeys) and additive: a run
// enrolled before it keeps the keys it accepted.

// keysFixture drives a concept-mode run to the quiz stage with the given rules,
// so the same content can be measured under the current rules and under a
// frozen snapshot.
func keysFixture(t *testing.T, rulesPath string) *fixture {
	t.Helper()
	f := newFixture(t)
	f.rules = rulesPath
	f.initOK(t)
	f.writePlan(t, defaultParts()...)
	f.advanceOK(t, "preparation")
	qs := []diagQuestionWire{conceptQ("a1", 1, "T.p1", "B", "T.p1", "P0.1")}
	r := reasonsFor("a1")
	f.writeGuided(t, qs, map[string]string{"a1": "E"}, r, true)
	f.writeDiagVerdicts(t, coverAll(qs, r, nil)...)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades en T.p1.", []string{"a1"}, defaultParts()...)
	f.methodIfAsked(t)
	f.advanceOK(t, "planning")
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	return f
}

// keysQuiz is a concept mini-quiz of n questions with the given answer keys.
func keysQuiz(n int, keys ...string) []quizQuestionWire {
	qs := conceptQuiz(n)
	for i := range qs {
		if i < len(keys) {
			qs[i].Answer = keys[i]
		}
	}
	return qs
}

// frozenRulesWithoutAnswerKeys copies the production rules without the
// answer-key distribution key: what a run enrolled before the rule existed
// keeps through its snapshot.
func frozenRulesWithoutAnswerKeys(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(productionRulesPath)
	if err != nil {
		t.Fatalf("read %s: %v", productionRulesPath, err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("decode %s: %v", productionRulesPath, err)
	}
	thresholds, _ := doc["thresholds"].(map[string]any)
	options, _ := thresholds["options"].(map[string]any)
	delete(options, "varyAnswerKeys")
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatalf("encode frozen rules: %v", err)
	}
	path := filepath.Join(t.TempDir(), "frozen-rules.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatalf("write frozen rules: %v", err)
	}
	return path
}

// A mini-quiz whose correct option always sits in A is refused with a finding
// that tells the tutor what to do; varying the position is accepted.
func TestMiniQuizAnswerKeysMustVary(t *testing.T) {
	f := keysFixture(t, productionRulesPath)
	f.writeConceptQuiz(t, keysQuiz(3, "A", "A", "A"))
	rep := f.advanceExpectBlocked(t, "quiz", "mini-quiz-questions", "vary the position of the correct option")
	if reason := failReason(rep, "mini-quiz-questions"); !strings.Contains(reason, `all 3 questions`) || !strings.Contains(reason, "A") {
		t.Fatalf("mini-quiz-questions = %q, want the letter and how many questions share it", reason)
	}

	varied := keysQuiz(3, "A", "B", "C")
	f.writeConceptQuiz(t, varied)
	f.writeConceptAnswers(t, varied, nil, "q1")
	f.advanceOK(t, "quiz")
}

// A round of four or more questions may not put more than half of its keys in
// one letter, even when the other letters appear.
func TestMiniQuizAnswerKeysMayNotConcentrateInOneLetter(t *testing.T) {
	f := keysFixture(t, productionRulesPath)
	f.writeConceptQuiz(t, keysQuiz(5, "A", "A", "A", "B", "C"))
	f.advanceExpectBlocked(t, "quiz", "mini-quiz-questions", "more than half")

	// Half is allowed: two of four is not more than half.
	balanced := keysQuiz(4, "A", "A", "B", "C")
	f.writeConceptQuiz(t, balanced)
	f.writeConceptAnswers(t, balanced, nil, "q1")
	f.advanceOK(t, "quiz")
}

// The diagnosis round follows the same rule: three questions in the same letter
// are refused through the stage's own check, so the tutor reads it at turn end.
func TestDiagnosisAnswerKeysMustVary(t *testing.T) {
	f := newFixture(t)
	f.rules = productionRulesPath
	f.initOK(t)
	f.writePlan(t, defaultParts()...)
	f.advanceOK(t, "preparation")
	qs := []diagQuestionWire{
		conceptQ("a1", 1, "T.p1", "A", "T.p1", "P0.1"),
		conceptQ("a2", 1, "T.p2", "A", "T.p2", "P0.1"),
		conceptQ("a3", 1, "T.p1", "A", "T.p1", "P0.1"),
	}
	r := reasonsFor("a1", "a2", "a3")
	f.writeGuided(t, qs, map[string]string{"a1": "A", "a2": "A", "a3": "A"}, r, true)
	f.writeDiagVerdicts(t, coverAll(qs, r, nil)...)
	rep := f.advanceExpectBlocked(t, "diagnosis", "quiz-structure", "vary the position of the correct option")
	if reason := failReason(rep, "quiz-structure"); !strings.Contains(reason, "round 1") {
		t.Fatalf("quiz-structure = %q, want the round it refuses", reason)
	}
}

// A snapshot taken before the rule existed keeps accepting the keys it
// accepted: the rule is additive, never retroactive.
func TestFrozenRunKeepsAcceptingOneAnswerLetter(t *testing.T) {
	f := keysFixture(t, frozenRulesWithoutAnswerKeys(t))
	qs := keysQuiz(3, "A", "A", "A")
	f.writeConceptQuiz(t, qs)
	f.writeConceptAnswers(t, qs, nil, "q1")
	rep, code := f.run(t, f.opts("validate", "quiz"))
	if code != 0 {
		t.Fatalf("validate quiz under the frozen rules = %d (%+v)", code, rep.Checks)
	}
	c, ok := hasCheck(rep, "mini-quiz-questions")
	if !ok {
		t.Fatal("mini-quiz-questions missing from the validate")
	}
	if c.Status != "PASS" {
		t.Fatalf("mini-quiz-questions = %s (%s), want PASS under the frozen rules", c.Status, c.Reason)
	}
	if strings.Contains(c.Reason, "vary the position") {
		t.Fatalf("frozen rules applied a rule they never declared: %s", c.Reason)
	}
}
