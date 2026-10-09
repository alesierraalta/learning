package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
)

// adaptiveFixture is a run on the production rules (adaptive diagnosis).
func adaptiveFixture(t *testing.T) *fixture {
	t.Helper()
	f := newFixture(t)
	opts := f.adaptiveOpts("init", "")
	if rep, code := f.run(t, opts); code != 0 || rep.Status != "accepted" {
		t.Fatalf("init: %q %d", rep.Status, code)
	}
	f.writePlan(t, defaultParts()...)
	f.adaptiveAdvanceOK(t, "preparation")
	return f
}

func (f *fixture) adaptiveOpts(cmd, stage string) Options {
	o := f.opts(cmd, stage)
	o.RulesPath = adaptiveRulesPath
	return o
}

func (f *fixture) adaptiveAdvanceOK(t *testing.T, stage string) Report {
	t.Helper()
	rep, code := f.run(t, f.adaptiveOpts("advance", stage))
	if code != 0 || (rep.Status != "accepted" && rep.Status != "completed") {
		t.Fatalf("advance %s: %q exit %d, checks %+v", stage, rep.Status, code, rep.Checks)
	}
	return rep
}

func (f *fixture) adaptiveStatus(t *testing.T) Report {
	t.Helper()
	rep, _ := f.run(t, f.adaptiveOpts("status", ""))
	return rep
}

// adaptiveQ builds one diagnostic question; topic level 0 means prerequisite.
func adaptiveQ(id string, round int, follows, subtema string, level int, answer string) diagQuestionWire {
	typ, nivel := "topic", map[int]string{1: "básico", 2: "medio", 3: "avanzado"}[level]
	if level == 0 {
		typ, nivel = "prerequisite", "básico"
	}
	return diagQuestionWire{
		ID: id, Round: round, Follows: follows, Type: typ, Level: level, Subtema: subtema, Nivel: nivel,
		Enunciado: "¿Qué resultado produce el caso " + id + "?",
		Pieza:     map[string]string{"tipo": "caso", "contenido": "Caso concreto " + id + " con datos."},
		Options:   optionSet(), Answer: answer,
	}
}

// writeAdaptive writes quiz.json, the learner's answers so far and quiz.md.
func (f *fixture) writeAdaptive(t *testing.T, qs []diagQuestionWire, answers map[string]string, complete bool) {
	t.Helper()
	f.writeJSON(t, "quiz.json", map[string]any{"questions": qs})
	if answers != nil {
		f.writeJSON(t, "quiz.answers.json", map[string]any{"answers": answers})
	}
	state, score := "pendiente", ""
	if complete {
		correct := 0
		for _, q := range qs {
			if answers[q.ID] == q.Answer {
				correct++
			}
		}
		state, score = "completado", fmt.Sprintf("%d/%d", correct, len(qs))
	}
	f.write(t, "quiz.md", diagnosticQuizNote(qs, state, score))
}

func failReason(rep Report, id string) string {
	c, ok := hasCheck(rep, id)
	if !ok || c.Status != "FAIL" {
		return ""
	}
	return c.Reason
}

// A round-by-round diagnosis: round 1 asks one basic topic question per area
// (up to roundSize), a right answer moves the area up a level, a wrong one
// moves it down to a foundation, and the chat owes the next round until every
// area is resolved or maxRounds is reached.
func TestAdaptiveDiagnosisRunsRoundByRound(t *testing.T) {
	f := adaptiveFixture(t)
	r1 := []diagQuestionWire{adaptiveQ("a1", 1, "", "T.p1", 1, "B"), adaptiveQ("a2", 1, "", "T.p2", 1, "C")}

	// Round 1 written, not answered: a pause for the learner.
	f.writeAdaptive(t, r1, nil, false)
	if rep := f.adaptiveStatus(t); rep.Status != "waiting" {
		t.Fatalf("round 1 unanswered: status %q, checks %+v", rep.Status, rep.Checks)
	}

	// Round 1 answered (a1 right, a2 wrong): round 2 is owed by the chat.
	ans := map[string]string{"a1": "B", "a2": "E"}
	f.writeAdaptive(t, r1, ans, false)
	rep := f.adaptiveStatus(t)
	if rep.Status != "blocked" || !strings.Contains(failReason(rep, "quiz-answers"), "round 2 is owed: write one follow-up question for each of a1, a2") {
		t.Fatalf("round 2 owed: status %q, quiz-answers %q", rep.Status, failReason(rep, "quiz-answers"))
	}

	// Round 2 follows the rule: a1 up to medio, a2 down to its foundation.
	r2 := append(append([]diagQuestionWire{}, r1...), adaptiveQ("a3", 2, "a1", "T.p1", 2, "A"), adaptiveQ("a4", 2, "a2", "P0.1", 0, "D"))
	f.writeAdaptive(t, r2, ans, false)
	if rep := f.adaptiveStatus(t); rep.Status != "waiting" {
		t.Fatalf("round 2 unanswered: status %q, checks %+v", rep.Status, rep.Checks)
	}

	// Round 2 answered: a3 right -> round 3 owed for T.p1 at avanzado; the
	// foundation a4 resolves its area.
	ans["a3"], ans["a4"] = "A", "D"
	f.writeAdaptive(t, r2, ans, false)
	rep = f.adaptiveStatus(t)
	if reason := failReason(rep, "quiz-answers"); !strings.Contains(reason, "round 3") || !strings.Contains(reason, "a3") || strings.Contains(reason, "a4") {
		t.Fatalf("round 3 owed only after a3: %q", reason)
	}

	// Round 3 answered: the diagnosis is complete after 5 questions.
	r3 := append(append([]diagQuestionWire{}, r2...), adaptiveQ("a5", 3, "a3", "T.p1", 3, "C"))
	ans["a5"] = "A"
	f.writeAdaptive(t, r3, ans, true)
	rep = f.adaptiveAdvanceOK(t, "diagnosis")
	if rep.Evidence["diagnosticScore"] != "3/5" {
		t.Fatalf("diagnosticScore = %v, want 3/5", rep.Evidence["diagnosticScore"])
	}
	if got := fmt.Sprint(rep.Evidence["diagnosticWrong"]); got != "[a2 a5]" {
		t.Fatalf("diagnosticWrong = %s, want [a2 a5]", got)
	}

	// Planning links the plan to the questions really asked.
	f.writePlanWith(t, "Base de T.p2 y avanzado de T.p1 por reforzar.", []string{"a2"}, defaultParts()...)
	f.adaptiveAdvanceOK(t, "planning")
}

// Every question the rule does not allow is rejected with a reason the chat
// can act on, and the run state does not change.
func TestAdaptiveDiagnosisRejectsQuestionsOutsideTheRule(t *testing.T) {
	r1 := []diagQuestionWire{adaptiveQ("a1", 1, "", "T.p1", 1, "B"), adaptiveQ("a2", 1, "", "T.p2", 1, "C")}
	ans := map[string]string{"a1": "B", "a2": "E"}
	cases := []struct {
		name    string
		qs      []diagQuestionWire
		answers map[string]string
		check   string
		reason  string
	}{
		{"round 1 must be basic topic questions", []diagQuestionWire{adaptiveQ("a1", 1, "", "T.p1", 2, "B"), r1[1]}, nil, "quiz-structure", "round 1"},
		{"round 1 covers one area per question", []diagQuestionWire{r1[0], adaptiveQ("a2", 1, "", "T.p1", 1, "C")}, nil, "quiz-structure", "round 1"},
		{"round 1 asks min(roundSize, areas) questions", r1[:1], nil, "quiz-structure", "round 1"},
		{"one follow-up per answer", append(append([]diagQuestionWire{}, r1...),
			adaptiveQ("b1", 2, "a1", "T.p1", 2, "A"), adaptiveQ("b2", 2, "a2", "P0.1", 0, "A"),
			adaptiveQ("b3", 2, "a1", "T.p1", 2, "A")), ans, "quiz-structure", "both follow a1"},
		{"no round past maxRounds", append(append([]diagQuestionWire{}, r1...), adaptiveQ("b1", 4, "a1", "T.p1", 2, "A")), ans, "quiz-structure", "rounds run from 1 to 3"},
		{"a right answer goes up, not down", append(append([]diagQuestionWire{}, r1...), adaptiveQ("b1", 2, "a1", "P0.1", 0, "A"), adaptiveQ("b2", 2, "a2", "P0.2", 0, "A")), ans, "quiz-answers", "b1 must move T.p1 up"},
		{"up one level at a time", append(append([]diagQuestionWire{}, r1...), adaptiveQ("b1", 2, "a1", "T.p1", 3, "A"), adaptiveQ("b2", 2, "a2", "P0.2", 0, "A")), ans, "quiz-answers", "b1 must move T.p1 up"},
		{"up within the same area", append(append([]diagQuestionWire{}, r1...), adaptiveQ("b1", 2, "a1", "T.p2", 2, "A"), adaptiveQ("b2", 2, "a2", "P0.2", 0, "A")), ans, "quiz-answers", "b1 must move T.p1 up"},
		{"a wrong basic goes down to a foundation", append(append([]diagQuestionWire{}, r1...), adaptiveQ("b1", 2, "a1", "T.p1", 2, "A"), adaptiveQ("b2", 2, "a2", "T.p2", 2, "A")), ans, "quiz-answers", "b2 must move T.p2 down"},
		{"a follow-up comes from the previous round", append(append([]diagQuestionWire{}, r1...),
			adaptiveQ("b1", 2, "a1", "T.p1", 2, "A"), adaptiveQ("b2", 2, "a2", "P0.1", 0, "A"), adaptiveQ("c1", 3, "a1", "T.p1", 2, "A")),
			map[string]string{"a1": "B", "a2": "E", "b1": "A", "b2": "A"}, "quiz-structure", "must follow a round 2 question"},
		{"the next round waits for the answers", append(append([]diagQuestionWire{}, r1...), adaptiveQ("b1", 2, "a1", "T.p1", 2, "A")), map[string]string{"a1": "B"}, "quiz-answers", "before round 1 was fully answered"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := adaptiveFixture(t)
			f.writeAdaptive(t, tc.qs, tc.answers, false)
			before := f.tryReadState(t)
			rep, code := f.run(t, f.adaptiveOpts("advance", "diagnosis"))
			if code != 1 || !strings.Contains(failReason(rep, tc.check), tc.reason) {
				t.Fatalf("exit %d, %s = %q, want FAIL naming %q (checks %+v)", code, tc.check, failReason(rep, tc.check), tc.reason, rep.Checks)
			}
			if string(f.tryReadState(t)) != string(before) {
				t.Fatal("rejected diagnosis mutated state")
			}
		})
	}
}

// The round limit comes from the rules: with maxRounds 2 a right answer in
// round 2 resolves its area instead of owing round 3.
func TestAdaptiveDiagnosisStopsAtMaxRounds(t *testing.T) {
	raw, err := os.ReadFile(adaptiveRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	short := strings.Replace(string(raw), `"maxRounds": 3`, `"maxRounds": 2`, 1)
	path := t.TempDir() + "/rules.json"
	if err := os.WriteFile(path, []byte(short), 0o644); err != nil {
		t.Fatal(err)
	}
	f := newFixture(t)
	opts := func(cmd, stage string) Options { o := f.opts(cmd, stage); o.RulesPath = path; return o }
	if _, code := f.run(t, opts("init", "")); code != 0 {
		t.Fatal("init failed")
	}
	f.writePlan(t, defaultParts()...)
	if _, code := f.run(t, opts("advance", "preparation")); code != 0 {
		t.Fatal("preparation failed")
	}
	qs := []diagQuestionWire{adaptiveQ("a1", 1, "", "T.p1", 1, "B"), adaptiveQ("a2", 1, "", "T.p2", 1, "C"),
		adaptiveQ("a3", 2, "a1", "T.p1", 2, "A"), adaptiveQ("a4", 2, "a2", "T.p2", 2, "D")}
	f.writeAdaptive(t, qs, map[string]string{"a1": "B", "a2": "C", "a3": "A", "a4": "D"}, true)
	if rep, code := f.run(t, opts("advance", "diagnosis")); code != 0 || rep.Status != "accepted" {
		t.Fatalf("diagnosis at maxRounds: %q exit %d, checks %+v", rep.Status, code, rep.Checks)
	}
}

// "De esto no sé nada": the learner skips the diagnosis; planning then starts
// from zero with no focus areas.
func TestAdaptiveDiagnosisCanBeSkipped(t *testing.T) {
	f := adaptiveFixture(t)
	f.writeJSON(t, "quiz.json", map[string]any{"skipped": true, "questions": []any{}})
	f.writeJSON(t, "quiz.answers.json", map[string]any{"answers": map[string]string{}})
	f.write(t, "quiz.md", "---\ntipo: quiz-diagnostico\nestado: completado\npuntaje: 0/0\n---\n# Diagnóstico omitido\n")
	rep := f.adaptiveAdvanceOK(t, "diagnosis")
	if rep.Evidence["diagnosticScore"] != "0/0" {
		t.Fatalf("diagnosticScore = %v, want 0/0", rep.Evidence["diagnosticScore"])
	}
	f.writePlanWith(t, "Diagnóstico omitido: el plan empieza desde cero.", nil, defaultParts()...)
	f.adaptiveAdvanceOK(t, "planning")
}

// An empty diagnosis is only valid when it is explicitly skipped.
func TestAdaptiveDiagnosisNeedsQuestionsUnlessSkipped(t *testing.T) {
	f := adaptiveFixture(t)
	f.writeJSON(t, "quiz.json", map[string]any{"questions": []any{}})
	f.write(t, "quiz.md", "---\ntipo: quiz-diagnostico\nestado: pendiente\n---\n# Diagnóstico\n")
	rep, _ := f.run(t, f.adaptiveOpts("validate", "diagnosis"))
	if !strings.Contains(failReason(rep, "quiz-structure"), "round 1") {
		t.Fatalf("quiz-structure = %q, want a round 1 requirement", failReason(rep, "quiz-structure"))
	}
}

// The fixed-format fixture only differs from production in the diagnostic
// thresholds, so the rest of the suite still exercises the production rules.
func TestFixedRulesFixtureMatchesProductionRules(t *testing.T) {
	load := func(path string) map[string]any {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var doc map[string]any
		if err := json.Unmarshal(raw, &doc); err != nil {
			t.Fatal(err)
		}
		delete(doc["thresholds"].(map[string]any), "diagnostic")
		return doc
	}
	if !reflect.DeepEqual(load(repoRulesPath), load(adaptiveRulesPath)) {
		t.Fatal("testdata/rules-fixed-diagnosis.json drifted from rules/deep.json outside thresholds.diagnostic")
	}
}
