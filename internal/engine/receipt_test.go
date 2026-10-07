package engine

import (
	"strings"
	"testing"
)

func TestLearnerNoteReceiptsAreScoped(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "first explanation")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	before := string(f.tryReadState(t))
	// Submitting another area must not invalidate the recorded first area.
	f.writeOwnWordsText(t, "p2", "My second-part response.")
	rep := f.statusExpect(t, "accepted")
	if rep.NextStage != "quiz" || rep.Part != "p1" {
		t.Fatalf("unexpected frontier: %+v", rep)
	}
	if string(f.tryReadState(t)) != before {
		t.Fatal("status mutated stored state")
	}
	// Editing the recorded response must still invalidate its receipt.
	f.writeOwnWordsText(t, "p1", "Changed first-part response.")
	rep = f.statusExpect(t, "blocked")
	c, ok := hasCheck(rep, "receipts-fresh")
	if !ok || !strings.Contains(c.Reason, "own_words/p1") {
		t.Fatalf("missing stale first-area receipt: %+v", rep)
	}
	if string(f.tryReadState(t)) != before {
		t.Fatal("rejected status mutated stored state")
	}
}

func TestLearnerNoteSkeletonEditsRemainStale(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	before := string(f.tryReadState(t))
	raw := string(f.read(t, "mis-palabras.md"))
	changed := strings.Replace(raw, "## Parte 1", "## Changed part 1", 1)
	if changed == raw {
		t.Fatal("fixture skeleton was not changed")
	}
	f.write(t, "mis-palabras.md", changed)
	rep := f.statusExpect(t, "blocked")
	c, ok := hasCheck(rep, "receipts-fresh")
	if !ok || !strings.Contains(c.Reason, "planning") {
		t.Fatalf("missing stale skeleton receipt: %+v", rep)
	}
	if string(f.tryReadState(t)) != before {
		t.Fatal("rejected status mutated stored state")
	}
}

func TestOtherLearnerAreaDoesNotInvalidateQuizJudgment(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "first explanation")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 5)
	f.advanceOK(t, "quiz")
	before := string(f.tryReadState(t))
	f.writeOwnWordsText(t, "p2", "Independent second-part response.")
	rep := f.statusExpect(t, "accepted")
	if rep.NextStage != "feedback" || rep.Part != "p1" {
		t.Fatalf("unexpected frontier: %+v", rep)
	}
	if string(f.tryReadState(t)) != before {
		t.Fatal("status mutated stored state")
	}
}

// A changed learner response re-opens the judgments bound to it: after the
// own-words repair, the quiz is re-judged against the new response.
func TestChangedLearnerResponseRequiresQuizRejudgment(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "first explanation")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 5)
	f.advanceOK(t, "quiz")

	f.writeOwnWordsText(t, "p1", "Revised first-part response after the quiz.")
	f.advanceOK(t, "own_words")
	rep := f.statusExpect(t, "blocked")
	if c, _ := hasCheck(rep, "semantic-receipts"); !strings.Contains(c.Reason, "distractor-quality") {
		t.Fatalf("semantic-receipts = %q, want stale quiz judgment", c.Reason)
	}
	if rep.NextStage != "quiz" || rep.Part != "p1" {
		t.Fatalf("repair frontier = %s/%s, want quiz/p1", rep.NextStage, rep.Part)
	}
	// advanceOK re-records the stale distractor-quality review first.
	f.advanceOK(t, "quiz")
	f.statusExpect(t, "accepted")
}
