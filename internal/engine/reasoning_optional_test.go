package engine

import (
	"strings"
	"testing"
)

// answersOnly writes the guided round answers without a razonamientos field at
// all, the way a view that never asked for one would.
func answersOnly(t *testing.T, f *fixture, answers map[string]string) {
	t.Helper()
	f.writeJSON(t, "quiz.answers.json", map[string]any{"answers": answers})
}

// The promise is that reasoning is optional, including the field: an answers
// file that simply does not mention it must not keep the round open.
func TestConceptDiagnosisAnswersWithoutReasoningFieldAdvance(t *testing.T) {
	f := conceptFixture(t)
	qs := []diagQuestionWire{
		conceptQ("a1", 1, "T.p1", "B", "T.p1", "P0.1"),
		conceptQ("a2", 1, "T.p2", "C", "T.p2", "T.p1"),
	}
	f.writeGuided(t, qs, nil, nil, false)
	f.statusExpect(t, "waiting")

	answersOnly(t, f, map[string]string{"a1": "B", "a2": "C"})
	rep := f.statusExpect(t, "blocked")
	if reason := failReason(rep, "quiz-answers"); strings.Contains(reason, "waiting for learner input") || strings.Contains(strings.ToLower(reason), "razonamiento") {
		t.Fatalf("a file with no reasoning must not keep the round open: %q", reason)
	}
}

// A razonamientos field that is null reads as "none" instead of an unreadable
// payload.
func TestConceptNullReasoningIsNoReasoning(t *testing.T) {
	f := conceptFixture(t)
	qs := []diagQuestionWire{
		conceptQ("a1", 1, "T.p1", "B", "T.p1", "P0.1"),
		conceptQ("a2", 1, "T.p2", "C", "T.p2", "T.p1"),
	}
	f.writeGuided(t, qs, nil, nil, false)
	f.statusExpect(t, "waiting")

	f.writeJSON(t, "quiz.answers.json", map[string]any{
		"answers":       map[string]string{"a1": "B", "a2": "C"},
		"razonamientos": nil,
	})
	rep := f.statusExpect(t, "blocked")
	if reason := failReason(rep, "quiz-answers"); reason != "" && (strings.Contains(reason, "unreadable") || strings.Contains(strings.ToLower(reason), "razonamiento")) {
		t.Fatalf("null razonamientos must be treated as absent: %q", reason)
	}
}

// A verdict's evidence must come from its own question: quoting the text a
// different question produced is not evidence about this concept.
func TestConceptVerdictsRefuseBorrowedEvidence(t *testing.T) {
	f := conceptFixture(t)
	qs := []diagQuestionWire{
		conceptQ("a1", 1, "T.p1", "B", "T.p1", "P0.1"),
		conceptQ("a2", 1, "T.p2", "C", "T.p2", "T.p1"),
	}
	f.writeGuided(t, qs, nil, nil, false)
	ans := map[string]string{"a1": "B", "a2": "C"}
	r := reasonsFor("a1", "a2")
	f.writeGuided(t, qs, ans, r, false)
	f.statusExpect(t, "blocked")

	f.writeDiagVerdicts(t, verdict("T.p1", "claro", "a1", "porque en a2 el valor existe"))
	rep := f.statusExpect(t, "blocked")
	reason := failReason(rep, "concept-verdicts")
	if !strings.Contains(reason, "evidencia") || !strings.Contains(reason, "a1") {
		t.Fatalf("borrowed evidence must be refused naming the verdict: %q", reason)
	}
}
