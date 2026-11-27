package engine

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// E470-* pins observations from the TSP of the versioned open-response
// contract. Each test drives the public Run/Report boundary with the same
// artifacts the reader and tutor write; none asserts an internal helper.

func tsp470CodeQuiz(t *testing.T, submission, submittedCode string) *fixture {
	t.Helper()
	f := openQuizFixture(t)
	qs := []map[string]any{makeOpenItem(openSpec{id: "q1", kind: "code", operation: "build", centrality: "central", criteria: []string{"c1"}})}
	answer := codeAnswer("return ordered", "La exploración ordenada evita revisar estados ya vistos.", submission, "dudo")
	verdict := passageVerdict("correct", "return ordered", criterionResult("c1", true, "return ordered"))
	verdict["explanation"] = passageVerdict("correct", "evita revisar estados ya vistos")
	f.writeOpenQuiz(t, qs, map[string]any{"q1": answer}, map[string]map[string]any{"q1": verdict})
	if submittedCode != "" {
		f.writeJSON(t, submission, map[string]any{
			"numero": 1, "codigo": submittedCode, "aprobados": 2, "total": 2,
		})
	}
	return f
}

func tsp470AdvanceQuiz(t *testing.T, f *fixture) Report {
	t.Helper()
	f.reviewPending(t, "quiz")
	rep, _ := f.run(t, f.opts("advance", "quiz"))
	return rep
}

func tsp470WantFail(t *testing.T, rep Report, id, substring string) {
	t.Helper()
	c, ok := hasCheck(rep, id)
	if !ok {
		t.Fatalf("check %q missing: %+v", id, rep.Checks)
	}
	if c.Status != "FAIL" {
		t.Fatalf("check %q status = %q, want FAIL (reason %q)", id, c.Status, c.Reason)
	}
	if !strings.Contains(strings.ToLower(c.Reason), strings.ToLower(substring)) {
		t.Fatalf("check %q reason = %q, want %q", id, c.Reason, substring)
	}
}

// E470-1: a correct code verdict must bind the executable submission, not just
// any passing record with a nonempty code field.
func TestTSP470CodeVerdictBindsTheExecutedSubmission(t *testing.T) {
	f := tsp470CodeQuiz(t, "codigo/q1/entregas/001.json", "return something_else")
	rep := tsp470AdvanceQuiz(t, f)
	tsp470WantFail(t, rep, "mini-quiz-answers", "submission")
}

// E470-2: the declared submission is a workspace artifact: a symlink out of
// the workspace cannot supply the executable result.
func TestTSP470CodeSubmissionRejectsSymlinkOutsideWorkspace(t *testing.T) {
	f := tsp470CodeQuiz(t, "codigo/q1/entregas/001.json", "")
	outside := filepath.Join(f.base, "not-in-workspace.json")
	if err := os.WriteFile(outside, []byte(`{"codigo":"return ordered","aprobados":2,"total":2}`), 0o644); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(f.ws, "codigo/q1/entregas/001.json")
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, target); err != nil {
		t.Fatal(err)
	}
	rep := tsp470AdvanceQuiz(t, f)
	tsp470WantFail(t, rep, "mini-quiz-answers", "escape")
}

// E470-3: a verdict may only quote a verbatim span of the learner's answer;
// whitespace-collapsed lookalikes are not evidence.
func TestTSP470VerdictEvidenceIsVerbatim(t *testing.T) {
	f := openQuizFixture(t)
	qs := []map[string]any{makeOpenItem(openSpec{id: "q1", criteria: []string{"c1"}})}
	text := "Cada  réplica  aplica la regla."
	entries := map[string]map[string]any{
		"q1": passageVerdict("correct", "Cada réplica aplica",
			criterionResult("c1", true, "Cada réplica aplica")),
	}
	f.writeOpenQuiz(t, qs, map[string]any{"q1": makeTextAnswer(text, "seguro")}, entries)
	rep := tsp470AdvanceQuiz(t, f)
	tsp470WantFail(t, rep, "mini-quiz-answers", "evidence")
}

// E470-4: a verdict document from a different contract version is not a
// verdict for this artifact (N/N-1 skew in the answer/verdict pair).
func TestTSP470VerdictDocumentVersionIsChecked(t *testing.T) {
	f := openQuizFixture(t)
	f.writeOpenQuiz(t, openQuizItems(3), openQuizAnswers(), openPassingVerdicts())
	f.writeJSON(t, "mini-quiz/p1.verdicts.json", map[string]any{
		"version": 2, "verdicts": openPassingVerdicts(),
	})
	rep := tsp470AdvanceQuiz(t, f)
	tsp470WantFail(t, rep, "mini-quiz-answers", "version")
}

// E470-5: an explicit no-evidence answer in the final assessment scores zero
// and keeps the central gap; it needs no invented code or explanation.
func TestTSP470FinalNoEvidenceScoresZero(t *testing.T) {
	f := openFinalFixture(t)
	qs := []map[string]any{makeOpenItem(openSpec{
		id: "f1", centrality: "central", criteria: []string{"c1"},
		concepts: []string{"T.p1", "P0.1"},
	})}
	f.writeJSON(t, "cuestionario-final.json", map[string]any{"questions": qs})
	f.writeJSON(t, "cuestionario-final.answers.json", map[string]any{
		"openAnswers": map[string]any{"f1": noEvidenceAnswer()},
	})
	f.writeOpenVerdicts(t, "cuestionario-final.verdicts.json", map[string]map[string]any{
		"f1": passageVerdict("no-evidence", "No sé todavía",
			criterionResult("c1", false, "No sé todavía")),
	})
	f.write(t, "cuestionario-final.md", "---\ntipo: cuestionario-final\nestado: completado\npuntaje: 0/1\n---\n# Final\n\n## f1\n"+qs[0]["enunciado"].(string)+"\n")
	rep := f.advanceOK(t, "final_quiz")
	if got := rep.Evidence["finalQuizScore"]; got != "0/1" {
		t.Fatalf("finalQuizScore = %v, want 0/1 from the no-evidence verdict", got)
	}
}
