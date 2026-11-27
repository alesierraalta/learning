package engine

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// Open-response artifacts are written through the same JSON surface the reader
// and tutor use. These helpers keep the assertions on the public Run report.

type openSpec struct {
	id, enunciado, operation, depth, centrality, kind string
	concepts, criteria                                []string
	central                                           bool
}

func openCriteria(ids ...string) []map[string]string {
	out := []map[string]string{}
	for _, id := range ids {
		out = append(out, map[string]string{"id": id, "rubric": "criterion " + id})
	}
	return out
}

func makeOpenItem(s openSpec) map[string]any {
	if s.enunciado == "" {
		s.enunciado = "¿Qué resultado produce este caso?"
	}
	if s.operation == "" {
		s.operation = "explain"
	}
	if s.depth == "" {
		s.depth = "core"
	}
	if s.centrality == "" {
		s.centrality = "supporting"
	}
	if s.kind == "" {
		s.kind = "text"
	}
	if len(s.concepts) == 0 {
		s.concepts = []string{"T.p1", "P0.1"}
	}
	return map[string]any{
		"id": s.id, "subtema": "T.p1", "nivel": "medio", "formato": s.operation, "enunciado": s.enunciado,
		"open": map[string]any{
			"version": 1, "kind": s.kind, "operation": s.operation, "depth": s.depth,
			"centrality": s.centrality, "concepts": s.concepts, "criteria": openCriteria(s.criteria...),
		},
	}
}

func openDiagItem(s openSpec, round int) map[string]any {
	q := makeOpenItem(s)
	q["round"] = round
	q["type"] = "topic"
	q["level"] = 1
	q["pieza"] = map[string]string{"tipo": "caso", "contenido": "Caso concreto " + s.id + " con datos."}
	return q
}

func openNote(qs []map[string]any, puntaje string) string {
	var body strings.Builder
	if puntaje == "" {
		body.WriteString("---\ntipo: quiz-diagnostico\nestado: pendiente\n---\n# Diagnóstico\n")
	} else {
		body.WriteString("---\ntipo: quiz-diagnostico\nestado: completado\npuntaje: " + puntaje + "\n---\n# Diagnóstico\n")
	}
	for _, q := range qs {
		fmt.Fprintf(&body, "\n## %s\n%s\n%s\nsubtema: %s\nnivel: %s\n", q["id"], q["enunciado"],
			q["pieza"].(map[string]string)["contenido"], q["subtema"], q["nivel"])
	}
	return body.String()
}

func makeTextAnswer(text, confidence string) map[string]any {
	return map[string]any{"kind": "text", "text": text, "confidence": confidence}
}

func noEvidenceAnswer() map[string]any { return map[string]any{"kind": "text", "noEvidence": true} }

func codeAnswer(code, explanation, submission, confidence string) map[string]any {
	return map[string]any{"kind": "code", "code": code, "explanation": explanation,
		"submission": submission, "confidence": confidence}
}

func criterionResult(id string, met bool, evidence string) map[string]any {
	return map[string]any{"id": id, "met": met, "evidence": evidence}
}

func criteriaMap(results ...map[string]any) map[string]any {
	out := map[string]any{}
	for _, result := range results {
		out[result["id"].(string)] = result
	}
	return out
}

func passageVerdict(v, evidence string, criteria ...map[string]any) map[string]any {
	return map[string]any{"verdict": v, "evidence": evidence, "criteria": criteriaMap(criteria...)}
}

func verdictFile(entries map[string]map[string]any) map[string]any {
	return map[string]any{"version": 1, "verdicts": entries}
}

func (f *fixture) writeOpenVerdicts(t *testing.T, rel string, entries map[string]map[string]any) {
	t.Helper()
	f.writeJSON(t, rel, verdictFile(entries))
}

func openQuizFingerprint(t *testing.T, qs []map[string]any) string {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"questions": qs})
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Questions []quizQuestion `json:"questions"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	return quizFingerprint(doc.Questions)
}

// openDiagnosisFixture drives a production-rules run through an all-open
// diagnosis and planning; the mini-quiz and final stages can then be exercised.
func openDiagnosisFixture(t *testing.T, parts ...partCfg) *fixture {
	t.Helper()
	if len(parts) == 0 {
		parts = defaultParts()
	}
	f := newFixture(t)
	f.rules = productionRulesPath
	f.initOK(t)
	f.writePlan(t, parts...)
	f.advanceOK(t, "preparation")
	qs := []map[string]any{
		openDiagItem(openSpec{id: "o1", operation: "explain", centrality: "central", criteria: []string{"c1"}}, 1),
		openDiagItem(openSpec{id: "o2", operation: "predict", criteria: []string{"c1"}}, 1),
		openDiagItem(openSpec{id: "o3", operation: "compare", criteria: []string{"c1"}}, 1),
	}
	text := "Cada réplica aplica la misma regla y conserva el orden de las entradas."
	f.writeJSON(t, "quiz.json", map[string]any{"questions": qs})
	f.writeJSON(t, "quiz.answers.json", map[string]any{"openAnswers": map[string]any{
		"o1": makeTextAnswer(text, "seguro"), "o2": makeTextAnswer(text, "seguro"), "o3": makeTextAnswer(text, "dudo"),
	}})
	f.writeOpenVerdicts(t, "quiz.verdicts.json", map[string]map[string]any{
		"o1": passageVerdict("correct", "conserva el orden", criterionResult("c1", true, "conserva el orden")),
		"o2": passageVerdict("partial", "aplica la misma regla", criterionResult("c1", false, "aplica la misma regla")),
		"o3": passageVerdict("incorrect", "Cada réplica", criterionResult("c1", false, "Cada réplica")),
	})
	f.writeJSON(t, "diagnostico-conceptos.json", map[string]any{"conceptos": []any{}})
	f.write(t, "quiz.md", openNote(qs, "1.5/3"))
	f.advanceOK(t, "diagnosis")
	f.methodIfAsked(t)
	f.writePlanWith(t, "El caso o3 queda pendiente.", []string{"o3"}, parts...)
	f.advanceOK(t, "planning")
	return f
}

// All-open diagnosis: the derived score and wrong ids come from the tutor
// verdicts, not from options or an answer key, and no option text is bound.
func TestOpenDiagnosisGradesVerdictsOnly(t *testing.T) {
	f := newFixture(t)
	f.rules = productionRulesPath
	f.initOK(t)
	f.writePlan(t, defaultParts()...)
	f.advanceOK(t, "preparation")
	qs := []map[string]any{openDiagItem(openSpec{id: "o1", criteria: []string{"c1"}}, 1)}
	text := "La réplica conserva el orden con una regla compartida."
	f.writeJSON(t, "quiz.json", map[string]any{"questions": qs})
	f.writeJSON(t, "quiz.answers.json", map[string]any{"openAnswers": map[string]any{"o1": makeTextAnswer(text, "seguro")}})
	f.writeOpenVerdicts(t, "quiz.verdicts.json", map[string]map[string]any{
		"o1": passageVerdict("partial", "conserva el orden", criterionResult("c1", false, "conserva el orden")),
	})
	f.writeJSON(t, "diagnostico-conceptos.json", map[string]any{"conceptos": []any{}})
	f.write(t, "quiz.md", openNote(qs, "0.5/1"))
	rep := f.advanceOK(t, "diagnosis")
	if got := rep.Evidence["diagnosticScore"]; got != "0.5/1" {
		t.Fatalf("diagnosticScore = %v, want 0.5/1 from the verdict", got)
	}
	if got := fmt.Sprint(rep.Evidence["diagnosticWrong"]); got != "[o1]" {
		t.Fatalf("diagnosticWrong = %s, want [o1] (partial is not full credit)", got)
	}
}

func (f *fixture) writeOpenQuiz(t *testing.T, qs []map[string]any, answers map[string]any, entries map[string]map[string]any) {
	t.Helper()
	f.writeJSON(t, "mini-quiz/p1.json", map[string]any{"questions": qs})
	f.writeJSON(t, "mini-quiz/p1.answers.json", map[string]any{
		"quiz": openQuizFingerprint(t, qs), "openAnswers": answers,
	})
	f.writeOpenVerdicts(t, "mini-quiz/p1.verdicts.json", entries)
}

func openQuizItems(n int) []map[string]any {
	specs := []openSpec{
		{id: "q1", operation: "explain", centrality: "central", criteria: []string{"c1", "c2"}},
		{id: "q2", operation: "debug", criteria: []string{"c1", "c2"}},
		{id: "q3", operation: "transfer", criteria: []string{"c1", "c2"}},
	}
	out := []map[string]any{}
	for _, s := range specs[:n] {
		out = append(out, makeOpenItem(s))
	}
	return out
}

const openText = "Cada réplica aplica la misma regla y conserva el orden de las entradas."

func openPassingVerdicts() map[string]map[string]any {
	return map[string]map[string]any{
		"q1": passageVerdict("correct", "conserva el orden", criterionResult("c1", true, "aplica la misma regla"), criterionResult("c2", true, "conserva el orden")),
		"q2": passageVerdict("correct", "conserva el orden", criterionResult("c1", true, "conserva el orden"), criterionResult("c2", true, "conserva el orden")),
		"q3": passageVerdict("incorrect", "Cada réplica", criterionResult("c1", false, "Cada réplica"), criterionResult("c2", false, "Cada réplica")),
	}
}

func openQuizAnswers() map[string]any {
	return map[string]any{"q1": makeTextAnswer(openText, "seguro"), "q2": makeTextAnswer(openText, "dudo"), "q3": makeTextAnswer(openText, "adivine")}
}

func openQuizFixture(t *testing.T) *fixture {
	t.Helper()
	f := openDiagnosisFixture(t)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	return f
}

// A 2/3 domain ratio passes when the central question is not a gap; partial
// credit is half a question and never reaches the boundary by itself.
func TestOpenMiniQuizScoringRatioAndCentralGap(t *testing.T) {
	t.Run("two thirds passes", func(t *testing.T) {
		f := openQuizFixture(t)
		f.writeOpenQuiz(t, openQuizItems(3), openQuizAnswers(), openPassingVerdicts())
		rep := f.advanceOK(t, "quiz")
		if rep.Evidence["quizPassed"] != true {
			t.Fatalf("2/3 open verdicts must pass: %+v", rep.Evidence)
		}
	})
	t.Run("one and a half thirds fails", func(t *testing.T) {
		f := openQuizFixture(t)
		verdicts := openPassingVerdicts()
		verdicts["q2"] = passageVerdict("partial", "conserva el orden", criterionResult("c1", true, "conserva el orden"), criterionResult("c2", false, "conserva el orden"))
		f.writeOpenQuiz(t, openQuizItems(3), openQuizAnswers(), verdicts)
		f.reviewPending(t, "quiz")
		rep, code := f.run(t, f.opts("advance", "quiz"))
		if code != 0 || rep.Evidence["quizPassed"] != false {
			t.Fatalf("1.5/3 must fail at the ratio: status %q exit %d evidence %+v checks %+v", rep.Status, code, rep.Evidence, rep.Checks)
		}
	})
	t.Run("central gap fails at two thirds", func(t *testing.T) {
		f := openQuizFixture(t)
		verdicts := openPassingVerdicts()
		verdicts["q1"] = verdicts["q3"]
		verdicts["q3"] = passageVerdict("correct", "Cada réplica", criterionResult("c1", true, "Cada réplica"), criterionResult("c2", true, "Cada réplica"))
		f.writeOpenQuiz(t, openQuizItems(3), openQuizAnswers(), verdicts)
		rep, code := f.run(t, f.opts("advance", "quiz"))
		if code != 1 || rep.Evidence["quizPassed"] != false {
			t.Fatalf("a wrong central open item must fail even at 2/3: status %q exit %d evidence %+v", rep.Status, code, rep.Evidence)
		}
	})
}

// The same developed answer with two different tutor verdicts must produce two
// different outcomes: no answer-key or accepted-variant equality is involved.
func TestOpenCorrectnessIsNeverAnswerKeyEquality(t *testing.T) {
	for _, tc := range []struct {
		name    string
		verdict string
		passed  bool
	}{
		{"tutor says correct", "correct", true},
		{"tutor says incorrect", "incorrect", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := openQuizFixture(t)
			entries := map[string]map[string]any{}
			for _, id := range []string{"q1", "q2", "q3"} {
				met := tc.verdict == "correct"
				entries[id] = passageVerdict(tc.verdict, "Cada réplica",
					criterionResult("c1", met, "aplica la misma regla"), criterionResult("c2", met, "Cada réplica"))
			}
			f.writeOpenQuiz(t, openQuizItems(3), openQuizAnswers(), entries)
			rep, code := f.run(t, f.opts("advance", "quiz"))
			got, _ := rep.Evidence["quizPassed"].(bool)
			if got != tc.passed {
				t.Fatalf("verdict %s: quizPassed = %v (exit %d), want %v; report %+v", tc.verdict, got, code, tc.passed, rep.Checks)
			}
		})
	}
}

// Verdicts only judge what the learner wrote: gaps in coverage, unknown ids,
// invented evidence and inconsistent criterion results all fail deterministically.
func TestOpenVerdictsMustCoverCriteriaAndQuoteTheLearner(t *testing.T) {
	cases := []struct {
		name, reason string
		change       func(map[string]map[string]any)
	}{
		{"missing verdict", "verdict", func(v map[string]map[string]any) { delete(v, "q2") }},
		{"unknown question", "unknown", func(v map[string]map[string]any) { v["q9"] = v["q1"] }},
		{"unknown verdict", "verdict", func(v map[string]map[string]any) { v["q1"]["verdict"] = "aceptable" }},
		{"forged evidence", "evidence", func(v map[string]map[string]any) { v["q1"]["evidence"] = "el alumno nunca escribió esto" }},
		{"missing criterion", "c2", func(v map[string]map[string]any) {
			v["q1"]["criteria"] = criteriaMap(criterionResult("c1", true, "aplica la misma regla"))
		}},
		{"unknown criterion", "c9", func(v map[string]map[string]any) {
			v["q1"]["criteria"] = criteriaMap(criterionResult("c1", true, "aplica la misma regla"), criterionResult("c2", true, "conserva el orden"), criterionResult("c9", true, "Cada réplica"))
		}},
		{"criterion evidence forged", "evidence", func(v map[string]map[string]any) {
			v["q1"]["criteria"] = criteriaMap(criterionResult("c1", true, "aplica la misma regla"), criterionResult("c2", true, "no está en la respuesta"))
		}},
		{"verdict contradicts criteria", "criterion", func(v map[string]map[string]any) {
			v["q1"] = passageVerdict("correct", "conserva el orden", criterionResult("c1", true, "aplica la misma regla"), criterionResult("c2", false, "conserva el orden"))
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := openQuizFixture(t)
			verdicts := openPassingVerdicts()
			tc.change(verdicts)
			f.writeOpenQuiz(t, openQuizItems(3), openQuizAnswers(), verdicts)
			rep := f.statusExpect(t, "blocked")
			if reason := failReason(rep, "mini-quiz-answers"); !strings.Contains(strings.ToLower(reason), strings.ToLower(tc.reason)) {
				t.Fatalf("%s: mini-quiz-answers = %q, want %q", tc.name, reason, tc.reason)
			}
		})
	}
}

func TestOpenConceptStatesUseTheDeclaredVocabulary(t *testing.T) {
	for _, tc := range []struct {
		name, state string
		passes      bool
	}{
		{"transferible is declared", "transferible", true},
		{"an undeclared state is refused", "dominado", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := openQuizFixture(t)
			qs := []map[string]any{makeOpenItem(openSpec{id: "q1", criteria: []string{"c1"}})}
			verdict := passageVerdict("correct", "conserva el orden", criterionResult("c1", true, "conserva el orden"))
			verdict["concepts"] = map[string]string{"T.p1": tc.state, "P0.1": "claro"}
			f.writeOpenQuiz(t, qs, map[string]any{"q1": makeTextAnswer(openText, "seguro")},
				map[string]map[string]any{"q1": verdict})
			if tc.passes {
				rep := f.advanceOK(t, "quiz")
				if rep.Evidence["quizPassed"] != true {
					t.Fatalf("declared state %s did not pass: %+v", tc.state, rep.Evidence)
				}
				return
			}
			rep, _ := f.run(t, f.opts("advance", "quiz"))
			if reason := failReason(rep, "mini-quiz-answers"); !strings.Contains(reason, "state") {
				t.Fatalf("undeclared state: mini-quiz-answers = %q", reason)
			}
		})
	}
}

// A learner who explicitly says they do not know yet does not have to invent
// text; the canonical phrase is the only evidence such a verdict can quote.
func TestOpenNoEvidenceAnswerNeedsNoInventedText(t *testing.T) {
	f := openQuizFixture(t)
	qs := openQuizItems(2)
	answers := map[string]any{"q1": makeTextAnswer(openText, "seguro"), "q2": noEvidenceAnswer()}
	f.writeOpenVerdicts(t, "mini-quiz/p1.verdicts.json", map[string]map[string]any{
		"q1": passageVerdict("correct", "conserva el orden", criterionResult("c1", true, "aplica la misma regla"), criterionResult("c2", true, "conserva el orden")),
		"q2": passageVerdict("no-evidence", "No sé todavía", criterionResult("c1", false, "No sé todavía"), criterionResult("c2", false, "No sé todavía")),
	})
	f.writeJSON(t, "mini-quiz/p1.json", map[string]any{"questions": qs})
	f.writeJSON(t, "mini-quiz/p1.answers.json", map[string]any{"quiz": openQuizFingerprint(t, qs), "openAnswers": answers})
	rep := f.advanceOK(t, "quiz")
	if rep.Evidence["quizPassed"] != false || fmt.Sprint(rep.Evidence["quizWrongIds"]) != "[q2]" {
		t.Fatalf("a no-evidence answer is graded zero, so 1/2 misses 2/3: %+v", rep.Evidence)
	}
}

// Code items keep their executable submission route and add a separate
// explanation verdict; neither the code nor the tests grade semantic quality.
func TestOpenCodeAnswerRequiresSubmissionAndExplanationVerdict(t *testing.T) {
	f := openQuizFixture(t)
	codeItem := makeOpenItem(openSpec{id: "q1", kind: "code", operation: "build", criteria: []string{"c1"}})
	qs := []map[string]any{codeItem}
	answer := codeAnswer("return ordered", "La exploración ordenada evita revisar estados ya vistos.", "codigo/q1/entregas/001.json", "dudo")
	verdict := passageVerdict("correct", "return ordered", criterionResult("c1", true, "return ordered"))
	verdict["explanation"] = passageVerdict("correct", "evita revisar estados ya vistos")
	f.writeJSON(t, "mini-quiz/p1.json", map[string]any{"questions": qs})
	f.writeJSON(t, "mini-quiz/p1.answers.json", map[string]any{"quiz": openQuizFingerprint(t, qs), "openAnswers": map[string]any{"q1": answer}})

	f.writeJSON(t, "codigo/q1/entregas/001.json", map[string]any{"numero": 1, "codigo": "return ordered", "aprobados": 2, "total": 2})
	f.writeOpenVerdicts(t, "mini-quiz/p1.verdicts.json", map[string]map[string]any{"q1": verdict})
	if rep := f.advanceOK(t, "quiz"); rep.Evidence["quizPassed"] != true {
		t.Fatalf("a code submission with an explanation verdict passes: %+v", rep.Evidence)
	}

	f = openQuizFixture(t)
	f.writeJSON(t, "mini-quiz/p1.json", map[string]any{"questions": qs})
	f.writeJSON(t, "mini-quiz/p1.answers.json", map[string]any{"quiz": openQuizFingerprint(t, qs), "openAnswers": map[string]any{"q1": answer}})
	f.writeJSON(t, "codigo/q1/entregas/001.json", map[string]any{"numero": 1, "codigo": "return ordered", "aprobados": 2, "total": 2})
	without := passageVerdict("correct", "return ordered", criterionResult("c1", true, "return ordered"))
	f.writeOpenVerdicts(t, "mini-quiz/p1.verdicts.json", map[string]map[string]any{"q1": without})
	rep := f.statusExpect(t, "blocked")
	if reason := failReason(rep, "mini-quiz-answers"); !strings.Contains(strings.ToLower(reason), "explanation") {
		t.Fatalf("a code item without an explanation verdict: %q", reason)
	}
}

// A code item's overall verdict also binds the executable result and the
// separate explanation verdict: neither can contradict full credit.
func TestOpenCodeVerdictConsistency(t *testing.T) {
	cases := []struct {
		name, overall, explanation, reason string
		testsPassed, blocked, passed       bool
	}{
		{"all tests pass and correct explanation", "correct", "correct", "", true, false, true},
		{"failed tests with correct overall", "correct", "correct", "every declared test passed", false, true, false},
		{"correct overall with partial explanation", "correct", "partial", "explanation", true, true, false},
		{"correct overall with incorrect explanation", "correct", "incorrect", "explanation", true, true, false},
		{"partial overall with incorrect explanation", "partial", "incorrect", "explanation", true, true, false},
		{"partial overall with no-evidence explanation", "partial", "no-evidence", "explanation", true, true, false},
		{"partial overall with partial explanation", "partial", "partial", "", true, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := openQuizFixture(t)
			qs := []map[string]any{makeOpenItem(openSpec{id: "q1", kind: "code", operation: "build", criteria: []string{"c1"}})}
			answer := codeAnswer("return ordered", "La exploración ordenada evita revisar estados ya vistos.", "codigo/q1/entregas/001.json", "dudo")
			criterionMet := tc.overall == "correct"
			verdict := passageVerdict(tc.overall, "return ordered", criterionResult("c1", criterionMet, "return ordered"))
			verdict["explanation"] = passageVerdict(tc.explanation, "evita revisar estados ya vistos")
			approved, total := 1, 2
			if tc.testsPassed {
				approved = 2
			}
			f.writeJSON(t, "codigo/q1/entregas/001.json", map[string]any{"numero": 1, "codigo": "return ordered", "aprobados": approved, "total": total})
			f.writeOpenQuiz(t, qs, map[string]any{"q1": answer}, map[string]map[string]any{"q1": verdict})
			if tc.blocked {
				rep := f.statusExpect(t, "blocked")
				if reason := failReason(rep, "mini-quiz-answers"); !strings.Contains(strings.ToLower(reason), tc.reason) {
					t.Fatalf("%s: mini-quiz-answers = %q, want %q", tc.name, reason, tc.reason)
				}
				return
			}
			rep := f.advanceOK(t, "quiz")
			if rep.Evidence["quizPassed"] != tc.passed {
				t.Fatalf("%s: quizPassed = %v, want %v (%+v)", tc.name, rep.Evidence["quizPassed"], tc.passed, rep.Evidence)
			}
		})
	}
}

// An explicit no-evidence code answer needs no invented text, code, tests or
// submission; when it is central it is also a central gap.
func TestOpenCodeNoEvidenceAnswerNeedsNoArtifacts(t *testing.T) {
	for _, tc := range []struct {
		name, centrality string
		centralGap       bool
	}{
		{"supporting", "supporting", false},
		{"central", "central", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := openQuizFixture(t)
			qs := []map[string]any{makeOpenItem(openSpec{id: "q1", kind: "code", operation: "build", centrality: tc.centrality, criteria: []string{"c1"}})}
			verdict := passageVerdict("no-evidence", "No sé todavía", criterionResult("c1", false, "No sé todavía"))
			f.writeOpenQuiz(t, qs, map[string]any{"q1": map[string]any{"kind": "code", "noEvidence": true}},
				map[string]map[string]any{"q1": verdict})
			rep := f.advanceOK(t, "quiz")
			misses, _ := rep.Evidence["quizCentralMisses"].([]string)
			if rep.Evidence["quizPassed"] != false || (len(misses) > 0) != tc.centralGap {
				t.Fatalf("code no-evidence: passed=%v centralMisses=%v (%+v)", rep.Evidence["quizPassed"], misses, rep.Evidence)
			}
		})
	}
}

func TestOpenCodeNoEvidenceRejectsInventedContent(t *testing.T) {
	f := openQuizFixture(t)
	qs := []map[string]any{makeOpenItem(openSpec{id: "q1", kind: "code", operation: "build", criteria: []string{"c1"}})}
	answer := codeAnswer("return ordered", "La exploración ordenada evita revisar estados ya vistos.", "codigo/q1/entregas/001.json", "dudo")
	answer["noEvidence"] = true
	verdict := passageVerdict("no-evidence", "No sé todavía", criterionResult("c1", false, "No sé todavía"))
	f.writeOpenQuiz(t, qs, map[string]any{"q1": answer}, map[string]map[string]any{"q1": verdict})
	rep := f.statusExpect(t, "blocked")
	if reason := failReason(rep, "mini-quiz-answers"); !strings.Contains(reason, "answer content") {
		t.Fatalf("a no-evidence answer with content: %q", reason)
	}
}

// The open contract names its formats and carries their metadata explicitly;
// unsupported names or missing metadata are refused at the question gate.
func TestOpenItemsRequireDeclaredMetadata(t *testing.T) {
	cases := []struct {
		name, reason string
		change       func(map[string]any)
	}{
		{"unknown operation", "invent", func(q map[string]any) { q["open"].(map[string]any)["operation"] = "invent" }},
		{"unknown depth", "depth", func(q map[string]any) { q["open"].(map[string]any)["depth"] = "mystery" }},
		{"unknown centrality", "centrality", func(q map[string]any) { q["open"].(map[string]any)["centrality"] = "edge" }},
		{"unknown kind", "kind", func(q map[string]any) { q["open"].(map[string]any)["kind"] = "voice" }},
		{"wrong version", "version", func(q map[string]any) { q["open"].(map[string]any)["version"] = 2 }},
		{"no concepts", "conceptos", func(q map[string]any) { q["open"].(map[string]any)["concepts"] = []string{} }},
		{"no criteria", "criteria", func(q map[string]any) { q["open"].(map[string]any)["criteria"] = []map[string]string{} }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := openQuizFixture(t)
			q := makeOpenItem(openSpec{id: "q1", criteria: []string{"c1"}})
			tc.change(q)
			f.writeJSON(t, "mini-quiz/p1.json", map[string]any{"questions": []map[string]any{q}})
			rep := f.statusExpect(t, "blocked")
			if reason := failReason(rep, "mini-quiz-questions"); !strings.Contains(strings.ToLower(reason), strings.ToLower(tc.reason)) {
				t.Fatalf("%s: mini-quiz-questions = %q, want %q", tc.name, reason, tc.reason)
			}
		})
	}
	// A subset of the declared formats is enough: nothing requires every format.
	f := openQuizFixture(t)
	f.writeOpenQuiz(t, openQuizItems(2), map[string]any{"q1": makeTextAnswer(openText, "seguro"), "q2": makeTextAnswer(openText, "seguro")},
		map[string]map[string]any{
			"q1": passageVerdict("correct", "conserva el orden", criterionResult("c1", true, "aplica la misma regla"), criterionResult("c2", true, "conserva el orden")),
			"q2": passageVerdict("correct", "conserva el orden", criterionResult("c1", true, "conserva el orden"), criterionResult("c2", true, "conserva el orden")),
		})
	f.advanceOK(t, "quiz")
}

// The confidence travels beside the answer, never inside the verdict, and is
// validated separately from the semantic judgment.
func TestOpenConfidenceIsSeparateFromTheVerdict(t *testing.T) {
	f := openQuizFixture(t)
	answers := openQuizAnswers()
	answers["q1"] = map[string]any{"kind": "text", "text": openText, "confidence": "adivine"}
	f.writeOpenQuiz(t, openQuizItems(3), answers, openPassingVerdicts())
	rep := f.advanceOK(t, "quiz")
	if rep.Evidence["quizPassed"] != true {
		t.Fatalf("a guessed-looking confidence does not change the tutor verdict: %+v", rep.Evidence)
	}

	f = openQuizFixture(t)
	bad := openQuizAnswers()
	bad["q1"] = map[string]any{"kind": "text", "text": openText, "confidence": "maybe"}
	f.writeOpenQuiz(t, openQuizItems(3), bad, openPassingVerdicts())
	rep = f.statusExpect(t, "blocked")
	if reason := failReason(rep, "mini-quiz-answers"); !strings.Contains(strings.ToLower(reason), "confidence") {
		t.Fatalf("an undeclared confidence: %q", reason)
	}
}

func openFinalFixture(t *testing.T) *fixture {
	t.Helper()
	f := openDiagnosisFixture(t, partCfg{id: "p1", ex: true, vis: true, title: "Replicación"})
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeOpenQuiz(t, openQuizItems(3), openQuizAnswers(), openPassingVerdicts())
	f.advanceOK(t, "quiz")
	f.ownWordsUnderstood(t, "p1")
	f.writeFeedback(t, "p1", true)
	f.advanceOK(t, "feedback")
	f.writePlanWith(t, "Actualizada tras el feedback.", []string{"o3"}, partCfg{id: "p1", ex: true, vis: true, title: "Replicación"})
	f.advanceOK(t, "planning")
	f.advanceOK(t, "adaptation")
	f.write(t, "ejercicios.md", "---\ntipo: ejercicios\n---\n# Ejercicios\n\n## Ejercicio 1\nAplica el caso.\n")
	f.advanceOK(t, "exercises")
	return f
}

// A final assessment may be entirely open; the score still comes from verdicts
// and the hidden criteria never need to appear in the learner-facing note.
func TestAllOpenFinalAssessmentGradesVerdicts(t *testing.T) {
	f := openFinalFixture(t)
	qs := []map[string]any{
		makeOpenItem(openSpec{id: "f1", operation: "explain", criteria: []string{"c1"}, concepts: []string{"T.p1", "P0.1"}}),
		makeOpenItem(openSpec{id: "f2", operation: "transfer", centrality: "central", criteria: []string{"c1"}, concepts: []string{"T.p1", "P0.2"}}),
	}
	text := "Explico el caso con la regla compartida y el orden de las entradas."
	f.writeJSON(t, "cuestionario-final.json", map[string]any{"questions": qs})
	f.writeJSON(t, "cuestionario-final.answers.json", map[string]any{"openAnswers": map[string]any{
		"f1": makeTextAnswer(text, "seguro"), "f2": makeTextAnswer(text, "dudo"),
	}})
	f.writeOpenVerdicts(t, "cuestionario-final.verdicts.json", map[string]map[string]any{
		"f1": passageVerdict("partial", "la regla compartida", criterionResult("c1", false, "la regla compartida")),
		"f2": passageVerdict("correct", "el orden de las entradas", criterionResult("c1", true, "el orden de las entradas")),
	})
	var note strings.Builder
	note.WriteString("---\ntipo: cuestionario-final\nestado: completado\npuntaje: 1.5/2\n---\n# Final\n")
	for _, q := range qs {
		fmt.Fprintf(&note, "\n## %s\n%s\n", q["id"], q["enunciado"])
	}
	f.write(t, "cuestionario-final.md", note.String())
	rep := f.advanceOK(t, "final_quiz")
	if got := rep.Evidence["finalQuizScore"]; got != "1.5/2" {
		t.Fatalf("finalQuizScore = %v, want 1.5/2 from the verdicts", got)
	}
}

// --- preserved legacy behaviour -------------------------------------------

// A frozen rules snapshot keeps the original five-question quiz and its exact
// answer-key score. This test passed before open-response existed and must not
// change when the new contract is added.
func TestLegacyAnsweredQuizKeepsItsScore(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 4)
	rep := f.advanceOK(t, "quiz")
	if rep.Evidence["quizScore"] != 4 || rep.Evidence["quizTotal"] != 5 || rep.Evidence["quizPassed"] != true {
		t.Fatalf("legacy quiz score changed: %+v", rep.Evidence)
	}
}

// Under the new rules, a question that still declares options and a key is
// still graded by that key: the open contract is additive, not a replacement.
func TestLegacyMCQStillScoresByKeyUnderOpenRules(t *testing.T) {
	f := throughConceptPlanning(t)
	qs := conceptQuiz(3)
	f.writeConceptQuiz(t, qs)
	f.writeConceptAnswers(t, qs, nil, "q1", "q2")
	rep := f.advanceOK(t, "quiz")
	if rep.Evidence["quizScore"] != 2 || rep.Evidence["quizPassed"] != true {
		t.Fatalf("legacy 2/3 under the new rules changed: %+v", rep.Evidence)
	}
}
