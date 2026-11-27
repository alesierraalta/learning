package engine

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// E470R2-* holds the round-2 witnesses for the last source correction. The
// round-1 witnesses are left byte-identical; every assertion goes through the
// public Run/Report boundary.

func r2CodeFixture(t *testing.T, answerCode, recordedCode string) *fixture {
	t.Helper()
	f := openQuizFixture(t)
	qs := []map[string]any{makeOpenItem(openSpec{id: "q1", kind: "code", operation: "build", criteria: []string{"c1"}})}
	answer := codeAnswer(answerCode, "La exploración ordenada evita revisar estados ya vistos.", "codigo/q1/entregas/001.json", "dudo")
	verdict := passageVerdict("correct", answerCode, criterionResult("c1", true, answerCode))
	verdict["explanation"] = passageVerdict("correct", "evita revisar estados ya vistos")
	f.writeOpenQuiz(t, qs, map[string]any{"q1": answer}, map[string]map[string]any{"q1": verdict})
	if recordedCode != "" {
		f.writeJSON(t, "codigo/q1/entregas/001.json", map[string]any{
			"codigo": recordedCode, "aprobados": 2, "total": 2,
		})
	}
	return f
}

func r2AdvanceQuiz(t *testing.T, f *fixture) Report {
	t.Helper()
	f.reviewPending(t, "quiz")
	rep, _ := f.run(t, f.opts("advance", "quiz"))
	return rep
}

func r2WantCheck(t *testing.T, rep Report, wantPass bool, reasonSub string) {
	t.Helper()
	c, ok := hasCheck(rep, "mini-quiz-answers")
	if !ok {
		t.Fatalf("mini-quiz-answers missing: %+v", rep.Checks)
	}
	if (c.Status == "PASS") != wantPass {
		t.Fatalf("mini-quiz-answers = %q (%q), want pass=%v", c.Status, c.Reason, wantPass)
	}
	if reasonSub != "" && !strings.Contains(strings.ToLower(c.Reason), reasonSub) {
		t.Fatalf("mini-quiz-answers reason = %q, want %q", c.Reason, reasonSub)
	}
}

func r2EvidenceReason(wantPass bool) string {
	if wantPass {
		return ""
	}
	return "evidence"
}

func TestTSP470R2CodeBindingIsExact(t *testing.T) {
	for _, tc := range []struct {
		name, answer, recorded string
		wantPass               bool
	}{
		{"unicode code matches", "return café() // ñandú", "return café() // ñandú", true},
		{"newline code matches", "return 1\nreturn 2", "return 1\nreturn 2", true},
		{"newline replaced by space", "return 1\nreturn 2", "return 1 return 2", false},
		{"internal spaces collapsed", "return   spaced()", "return spaced()", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rep := r2AdvanceQuiz(t, r2CodeFixture(t, tc.answer, tc.recorded))
			reason := ""
			if !tc.wantPass {
				reason = "submission"
			}
			r2WantCheck(t, rep, tc.wantPass, reason)
		})
	}
}

func TestTSP470R2ResolvedSymlinkContainment(t *testing.T) {
	t.Run("symlink resolving inside the workspace still grades", func(t *testing.T) {
		f := r2CodeFixture(t, "return ordered", "")
		dir := filepath.Join(f.ws, "codigo/q1/entregas")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		real := filepath.Join(dir, "real.json")
		if err := os.WriteFile(real, []byte(`{"codigo":"return ordered","aprobados":2,"total":2}`), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink("real.json", filepath.Join(dir, "001.json")); err != nil {
			t.Fatal(err)
		}
		r2WantCheck(t, r2AdvanceQuiz(t, f), true, "")
	})
	t.Run("symlink with a missing target is refused", func(t *testing.T) {
		f := r2CodeFixture(t, "return ordered", "")
		target := filepath.Join(f.ws, "codigo/q1/entregas/001.json")
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink("absent.json", target); err != nil {
			t.Fatal(err)
		}
		r2WantCheck(t, r2AdvanceQuiz(t, f), false, "submission")
	})
}

func r2EvidenceFixture(t *testing.T, site, text, verdictEvidence, criterionEvidence, explanationEvidence string) Report {
	t.Helper()
	f := openQuizFixture(t)
	if site == "explanation" {
		answer := codeAnswer("return ordered", text, "codigo/q1/entregas/001.json", "dudo")
		f.writeJSON(t, "codigo/q1/entregas/001.json", map[string]any{
			"codigo": "return ordered", "aprobados": 2, "total": 2,
		})
		v := passageVerdict("correct", "return ordered", criterionResult("c1", true, "return ordered"))
		v["explanation"] = passageVerdict("correct", explanationEvidence)
		f.writeOpenQuiz(t, []map[string]any{makeOpenItem(openSpec{id: "q1", kind: "code", operation: "build", criteria: []string{"c1"}})},
			map[string]any{"q1": answer}, map[string]map[string]any{"q1": v})
		return r2AdvanceQuiz(t, f)
	}
	qs := []map[string]any{makeOpenItem(openSpec{id: "q1", criteria: []string{"c1"}})}
	v := passageVerdict("correct", verdictEvidence, criterionResult("c1", true, criterionEvidence))
	f.writeOpenQuiz(t, qs, map[string]any{"q1": makeTextAnswer(text, "seguro")}, map[string]map[string]any{"q1": v})
	return r2AdvanceQuiz(t, f)
}

func TestTSP470R2EvidenceIsLiteralAtEveryCallSite(t *testing.T) {
	for _, tc := range []struct {
		name, site, text, verdict, criterion, explanation string
		wantPass                                          bool
	}{
		{"verdict outer trim", "verdict", "Cada réplica aplica", "  Cada réplica aplica\n\t", "Cada réplica aplica", "", true},
		{"verdict internal spaces", "verdict", "Cada  réplica aplica", "Cada réplica aplica", "Cada  réplica aplica", "", false},
		{"verdict decomposed unicode", "verdict", "Café hecho", "Cafe\u0301 hecho", "Café hecho", "", false},
		{"verdict case differs", "verdict", "Cada réplica", "cada réplica", "Cada réplica", "", false},
		{"criterion outer trim", "criterion", "Cada réplica aplica", "Cada réplica aplica", "\n Cada réplica aplica \t", "", true},
		{"criterion internal spaces", "criterion", "Cada  réplica aplica", "Cada  réplica aplica", "Cada réplica aplica", "", false},
		{"explanation outer trim", "explanation", "La exploración ordenada\nevita revisar estados ya vistos.", "", "", "  evita revisar estados ya vistos.\n", true},
		{"explanation internal spaces", "explanation", "La exploración ordenada\nevita revisar estados ya vistos.", "", "", "evita revisar estados  ya vistos.", false},
		{"explanation case differs", "explanation", "La exploración ordenada\nevita revisar estados ya vistos.", "", "", "Evita revisar", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rep := r2EvidenceFixture(t, tc.site, tc.text, tc.verdict, tc.criterion, tc.explanation)
			r2WantCheck(t, rep, tc.wantPass, r2EvidenceReason(tc.wantPass))
		})
	}
}

func TestTSP470R2NoEvidencePhraseStaysLiteral(t *testing.T) {
	for _, tc := range []struct {
		name, evidence string
		wantPass       bool
	}{
		{"outer whitespace", "  No sé todavía \n", true},
		{"internal repeated spaces", "No  sé todavía", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := openQuizFixture(t)
			qs := []map[string]any{makeOpenItem(openSpec{id: "q1", criteria: []string{"c1"}})}
			v := passageVerdict("no-evidence", tc.evidence, criterionResult("c1", false, "No sé todavía"))
			f.writeOpenQuiz(t, qs, map[string]any{"q1": noEvidenceAnswer()}, map[string]map[string]any{"q1": v})
			rep := r2AdvanceQuiz(t, f)
			r2WantCheck(t, rep, tc.wantPass, r2EvidenceReason(tc.wantPass))
		})
	}
}

func TestTSP470R2LegacyConceptVerdictsKeepWhitespaceNormalization(t *testing.T) {
	f := conceptFixture(t)
	qs := []diagQuestionWire{conceptQ("a1", 1, "T.p1", "B", "T.p1", "P0.1")}
	answers := map[string]string{"a1": "B"}
	reasons := reasonsFor("a1")
	reasons["a1"] = why{"entendí que a1 pide el caso", "porque en   a1   el valor existe"}
	f.writeGuided(t, qs, answers, reasons, true)
	entries := coverAll(qs, reasons, nil)
	entries[0]["evidencia"] = "porque en a1 el valor existe"
	f.writeDiagVerdicts(t, entries...)
	rep := f.advanceOK(t, "diagnosis")
	c, ok := hasCheck(rep, "concept-verdicts")
	if !ok || c.Status != "PASS" {
		t.Fatalf("legacy concept verdicts must keep accepting whitespace-folded quotes: %+v", rep.Checks)
	}
}
