package engine

import "testing"

// status is what the chat's settle gate reads at the end of every turn. A stage
// the chat already started writing but left failing must surface as blocked,
// while a stage nobody started yet and a stage waiting only for the learner
// stay passing pauses.
func TestStatusBlocksAStartedFailingFrontierStage(t *testing.T) {
	parts := defaultParts()
	f := newFixture(t)
	f.initOK(t)
	f.writePlanWith(t, "", nil, parts...)
	f.advanceOK(t, "preparation")

	// Not started: only plan.json exists, the chat may still be talking.
	f.statusExpect(t, "accepted")

	// Started but failing: quiz.md written without its quiz.json.
	f.write(t, "quiz.md", diagnosticQuizNote(buildDiagQuestions(6, 6, parts...), "pending", ""))
	before := f.tryReadState(t)
	rep := f.statusExpect(t, "blocked")
	if c, ok := hasCheck(rep, "quiz-structure"); !ok || c.Status != "FAIL" {
		t.Fatalf("started diagnosis must report its failing check, got %+v", rep.Checks)
	}
	if rep.NextStage != "diagnosis" {
		t.Fatalf("nextStage = %q, want diagnosis", rep.NextStage)
	}
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("status mutated state")
	}

	// Complete except the learner's answers: a legitimate wait.
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6, parts...))
	f.statusExpect(t, "waiting")
	f.writeDiagAnswersFor(t, parts, 2, 6)
	f.advanceOK(t, "diagnosis")

	// Diagnosis recorded, planning not started: the files planning reads are
	// all covered by earlier receipts, so the chat may still ask a question.
	f.statusExpect(t, "accepted")

	// Planning written but incomplete, as in the real session: no dump areas.
	f.writePreparationBundle(t, parts)
	f.write(t, "explicacion.md", indexNote(parts))
	f.writePlanWith(t, "Dificultades detectadas.", []string{"d3"}, parts...)
	f.write(t, "mis-palabras.md", "---\ntipo: mis-palabras\n---\n# Vuelcos\n")
	rep = f.statusExpect(t, "blocked")
	if c, ok := hasCheck(rep, "mis-palabras-skeleton"); !ok || c.Status != "FAIL" {
		t.Fatalf("started planning must report mis-palabras-skeleton, got %+v", rep.Checks)
	}

	// Repaired: planning passes again, status is a passing pause.
	f.write(t, "mis-palabras.md", fixtureMisPalabras(parts))
	f.statusExpect(t, "accepted")
	f.advanceOK(t, "planning")

	// Explanation recorded, own words not sent yet: waiting on the learner only.
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.statusExpect(t, "accepted")
}
