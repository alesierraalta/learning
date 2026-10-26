package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
)

// Concept diagnosis (production rules): integrative questions declare the
// concepts they need, every answer carries the learner's reasoning, and the
// chat records per-concept verdicts whose evidence is quoted from it.

func conceptFixture(t *testing.T) *fixture {
	t.Helper()
	f := newFixture(t)
	f.rules = productionRulesPath
	f.initOK(t)
	f.writePlan(t, defaultParts()...)
	f.advanceOK(t, "preparation")
	return f
}

func conceptQ(id string, round int, subtema, answer string, conceptos ...string) diagQuestionWire {
	q := adaptiveQ(id, round, "", subtema, 1, answer)
	q.Conceptos = conceptos
	return q
}

type why struct{ entendi, porque string }

func reasonsFor(ids ...string) map[string]why {
	out := map[string]why{}
	for _, id := range ids {
		out[id] = why{"entendí que " + id + " pide el caso", "porque en " + id + " el valor existe"}
	}
	return out
}

func reasoningWire(r map[string]why) map[string]any {
	out := map[string]any{}
	for id, w := range r {
		out[id] = map[string]string{"entendi": w.entendi, "porque": w.porque}
	}
	return out
}

// writeGuided writes quiz.json, quiz.md and the answers with their reasoning.
func (f *fixture) writeGuided(t *testing.T, qs []diagQuestionWire, answers map[string]string, r map[string]why, complete bool) {
	t.Helper()
	f.writeAdaptive(t, qs, answers, complete)
	if answers != nil {
		f.writeJSON(t, "quiz.answers.json", map[string]any{"answers": answers, "razonamientos": reasoningWire(r)})
	}
}

func verdict(codigo, estado, pregunta, evidencia string) map[string]string {
	return map[string]string{"codigo": codigo, "estado": estado, "pregunta": pregunta, "evidencia": evidencia}
}

func (f *fixture) writeDiagVerdicts(t *testing.T, entries ...map[string]string) {
	t.Helper()
	f.writeJSON(t, "diagnostico-conceptos.json", map[string]any{"conceptos": entries})
}

func coverAll(qs []diagQuestionWire, r map[string]why, estado map[string]string) []map[string]string {
	var out []map[string]string
	for _, q := range qs {
		w, ok := r[q.ID]
		if !ok {
			continue
		}
		for _, c := range q.Conceptos {
			e := estado[q.ID+"/"+c]
			if e == "" {
				e = "claro"
			}
			out = append(out, verdict(c, e, q.ID, w.porque))
		}
	}
	return out
}

func pendingRules(rep Report) []string {
	var out []string
	for _, p := range pendingListOf(rep.Evidence) {
		if s, ok := p["rule"].(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// The model chooses how many questions each round has; the engine only
// demands answers with reasoning and the verdicts of a round before the next.
func TestConceptDiagnosisRoundsAreChosenByTheModel(t *testing.T) {
	f := conceptFixture(t)
	r1 := []diagQuestionWire{
		conceptQ("a1", 1, "T.p1", "B", "T.p1", "P0.1"),
		conceptQ("a2", 1, "T.p2", "C", "T.p2", "T.p1"),
	}

	f.writeGuided(t, r1, nil, nil, false)
	f.statusExpect(t, "waiting")

	ans := map[string]string{"a1": "B", "a2": "E"}
	r := reasonsFor("a1", "a2")
	r["a2"] = why{"entendí que a2 pide el caso", "   "}
	f.writeGuided(t, r1, ans, r, false)
	f.statusExpect(t, "waiting")
	val, _ := f.run(t, f.opts("validate", "diagnosis"))
	if reason := failReason(val, "quiz-answers"); !strings.Contains(reason, "a2") || !strings.Contains(reason, "reasoning") || !strings.Contains(reason, "(waiting for learner input)") {
		t.Fatalf("an answer without both reasoning fields must be a learner wait naming a2: %q", reason)
	}

	r = reasonsFor("a1", "a2")
	f.writeGuided(t, r1, ans, r, false)
	rep := f.statusExpect(t, "blocked")
	if reason := failReason(rep, "concept-verdicts"); !strings.Contains(reason, "concept verdicts owed for round 1") {
		t.Fatalf("verdicts owed after round 1: %q (checks %+v)", reason, rep.Checks)
	}

	r2 := append(append([]diagQuestionWire{}, r1...), conceptQ("a3", 2, "T.p2", "A", "T.p2", "P0.1"))
	f.writeGuided(t, r2, ans, r, false)
	rep = f.statusExpect(t, "blocked")
	if reason := failReason(rep, "concept-verdicts"); !strings.Contains(reason, "round 2 was written before the concept verdicts for round 1") {
		t.Fatalf("a round before the previous verdicts: %q", reason)
	}

	f.writeGuided(t, r1, ans, r, false)
	invented := coverAll(r1, r, nil)
	invented[2]["evidencia"] = "texto que la persona nunca escribió"
	f.writeDiagVerdicts(t, invented...)
	rep = f.statusExpect(t, "blocked")
	if reason := failReason(rep, "concept-verdicts"); !strings.Contains(reason, "evidencia") || !strings.Contains(reason, "a2") {
		t.Fatalf("evidence must be quoted from the reasoning: %q", reason)
	}

	partial := coverAll(r1, r, nil)
	f.writeDiagVerdicts(t, partial[:3]...)
	rep = f.statusExpect(t, "blocked")
	if reason := failReason(rep, "concept-verdicts"); !strings.Contains(reason, "T.p1") || !strings.Contains(reason, "a2") {
		t.Fatalf("every concept of every answered question needs a verdict: %q", reason)
	}

	wrongState := coverAll(r1, r, nil)
	wrongState[0]["estado"] = "regular"
	f.writeDiagVerdicts(t, wrongState...)
	rep = f.statusExpect(t, "blocked")
	if reason := failReason(rep, "concept-verdicts"); !strings.Contains(reason, "regular") {
		t.Fatalf("estado outside the declared states: %q", reason)
	}

	// a1 is right but its foundation P0.1 is a laguna.
	gaps := map[string]string{"a1/P0.1": "laguna"}
	f.writeDiagVerdicts(t, coverAll(r1, r, gaps)...)
	f.writeGuided(t, r2, ans, r, false)
	f.statusExpect(t, "waiting")

	ans["a3"] = "A"
	r = reasonsFor("a1", "a2", "a3")
	f.writeGuided(t, r2, ans, r, true)
	rep = f.statusExpect(t, "blocked")
	if reason := failReason(rep, "concept-verdicts"); !strings.Contains(reason, "concept verdicts owed for round 2") {
		t.Fatalf("verdicts owed after round 2: %q", reason)
	}

	f.writeDiagVerdicts(t, coverAll(r2, r, gaps)...)
	val, _ = f.run(t, f.opts("validate", "diagnosis"))
	if got := pendingRules(val); !strings.Contains(strings.Join(got, ","), "diagnosis-sufficiency") {
		t.Fatalf("the diagnosis needs the recorded sufficiency review, pending %v (checks %+v)", got, val.Checks)
	}
	f.recordReview(t, "diagnosis", "diagnosis-sufficiency", "FAIL", "falta evidencia sobre T.p2 avanzado")
	before := f.tryReadState(t)
	f.advanceExpectBlocked(t, "diagnosis", "diagnosis-sufficiency", "")
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("an insufficient diagnosis must not change state")
	}
	f.recordReview(t, "diagnosis", "diagnosis-sufficiency", "PASS", "las tres preguntas cubren cada área del plan")
	rep = f.advanceOK(t, "diagnosis")
	if got := fmt.Sprint(rep.Evidence["diagnosticFocus"]); got != "[a1 a2]" {
		t.Fatalf("diagnosticFocus = %s, want [a1 a2] (a2 wrong, a1 right with a laguna)", got)
	}

	// Planning must focus on a wrong answer or a laguna question.
	f.writePlanWith(t, "Base P0.1 por reforzar.", nil, defaultParts()...)
	f.advanceExpectBlocked(t, "planning", "planning-link", "laguna")
	f.writePlanWith(t, "Base P0.1 por reforzar.", []string{"a1"}, defaultParts()...)
	f.advanceOK(t, "planning")
}

func TestConceptQuestionsDeclareTwoOrThreePlanConcepts(t *testing.T) {
	cases := []struct {
		name      string
		conceptos []string
		reason    string
	}{
		{"one concept", []string{"T.p1"}, "a1"},
		{"four concepts", []string{"T.p1", "T.p2", "P0.1", "P0.2"}, "a1"},
		{"repeated concept", []string{"T.p1", "T.p1"}, "repeated"},
		{"unknown code", []string{"T.p1", "X.9"}, "X.9"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := conceptFixture(t)
			f.writeGuided(t, []diagQuestionWire{conceptQ("a1", 1, "T.p1", "B", tc.conceptos...)}, nil, nil, false)
			rep := f.statusExpect(t, "blocked")
			if reason := failReason(rep, "quiz-structure"); !strings.Contains(reason, "conceptos") || !strings.Contains(reason, tc.reason) {
				t.Fatalf("%s: quiz-structure reason %q", tc.name, reason)
			}
		})
	}
	f := conceptFixture(t)
	f.writeGuided(t, []diagQuestionWire{conceptQ("a1", 1, "T.p1", "B", "T.p1", "T.p2", "P0.1")}, nil, nil, false)
	f.statusExpect(t, "waiting")

	var many []diagQuestionWire
	for i := 1; i <= 16; i++ {
		many = append(many, conceptQ(fmt.Sprintf("a%d", i), 1, "T.p1", "B", "T.p1", "P0.1"))
	}
	f.writeGuided(t, many, nil, nil, false)
	rep := f.statusExpect(t, "blocked")
	if reason := failReason(rep, "quiz-structure"); !strings.Contains(reason, "15") {
		t.Fatalf("a diagnosis over 15 questions: %q", reason)
	}
}

// throughConceptPlanning answers a one-question diagnosis and plans the parts.
func throughConceptPlanning(t *testing.T) *fixture {
	t.Helper()
	f := conceptFixture(t)
	qs := []diagQuestionWire{conceptQ("a1", 1, "T.p1", "B", "T.p1", "P0.1")}
	r := reasonsFor("a1")
	f.writeGuided(t, qs, map[string]string{"a1": "E"}, r, true)
	f.writeDiagVerdicts(t, coverAll(qs, r, nil)...)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades en T.p1.", []string{"a1"}, defaultParts()...)
	f.advanceOK(t, "planning")
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	return f
}

func conceptQuiz(n int) []quizQuestionWire {
	qs := buildQuizQuestions("p1")
	for len(qs) < n {
		extra := qs[len(qs)%5]
		extra.ID = fmt.Sprintf("q%d", len(qs)+1)
		extra.Central = false
		qs = append(qs, extra)
	}
	qs = qs[:n]
	for i := range qs {
		qs[i].Central = i == 0
		qs[i].Conceptos = []string{"T.p1", "P0.1"}
	}
	return qs
}

func (f *fixture) writeConceptQuiz(t *testing.T, qs []quizQuestionWire) {
	t.Helper()
	f.writeJSON(t, "mini-quiz/p1.json", map[string]any{"questions": qs})
}

// writeConceptAnswers answers the listed ids right and the rest "No sé".
func (f *fixture) writeConceptAnswers(t *testing.T, qs []quizQuestionWire, r map[string]why, right ...string) {
	t.Helper()
	answers := map[string]string{}
	for _, q := range qs {
		answers[q.ID] = "E"
	}
	for _, id := range right {
		for _, q := range qs {
			if q.ID == id {
				answers[id] = q.Answer
			}
		}
	}
	f.writeJSON(t, "mini-quiz/p1.answers.json", map[string]any{"answers": answers, "razonamientos": reasoningWire(r)})
}

func (f *fixture) writeConceptFeedback(t *testing.T, entries ...map[string]string) {
	t.Helper()
	f.writeJSON(t, "feedback/p1.json", map[string]any{
		"partId": "p1", "difficultyDetected": true, "notes": "resultado y razonamiento revisados", "conceptos": entries,
	})
}

func quizVerdicts(qs []quizQuestionWire, r map[string]why, gap string) []map[string]string {
	var out []map[string]string
	for _, q := range qs {
		for _, c := range q.Conceptos {
			estado := "claro"
			if q.ID+"/"+c == gap {
				estado = "laguna"
			}
			out = append(out, verdict(c, estado, q.ID, r[q.ID].entendi))
		}
	}
	return out
}

func TestConceptMiniQuizSizeIsChosenByTheModel(t *testing.T) {
	f := throughConceptPlanning(t)
	f.writeConceptQuiz(t, conceptQuiz(13))
	f.advanceExpectBlocked(t, "quiz", "mini-quiz-questions", "12")

	missing := conceptQuiz(3)
	missing[2].Conceptos = nil
	f.writeConceptQuiz(t, missing)
	f.advanceExpectBlocked(t, "quiz", "mini-quiz-questions", "q3")

	qs := conceptQuiz(1)
	f.writeConceptQuiz(t, qs)
	f.statusExpect(t, "waiting")
	r := reasonsFor("q1")
	r["q1"] = why{"", "porque sí"}
	f.writeConceptAnswers(t, qs, r, "q1")
	f.statusExpect(t, "waiting")
	val, _ := f.run(t, f.opts("validate", "quiz"))
	if reason := failReason(val, "mini-quiz-answers"); !strings.Contains(reason, "q1") || !strings.Contains(reason, "reasoning") || !strings.Contains(reason, "(waiting for learner input)") {
		t.Fatalf("mini-quiz answer without reasoning: %q", reason)
	}
	f.writeConceptAnswers(t, qs, reasonsFor("q1"), "q1")
	rep := f.advanceOK(t, "quiz")
	if rep.Evidence["quizPassed"] != true {
		t.Fatalf("a one-question quiz answered right passes: %+v", rep.Evidence)
	}
}

// The current page asks for one thought instead of two prompts: the engine
// reads that single text as the learner's reasoning, and a verdict may quote it.
func TestConceptReasoningAcceptsOneThought(t *testing.T) {
	f := throughConceptPlanning(t)
	qs := conceptQuiz(1)
	f.writeConceptQuiz(t, qs)
	record := func(thought string) {
		f.writeJSON(t, "mini-quiz/p1.answers.json", map[string]any{
			"answers":       map[string]string{"q1": qs[0].Answer},
			"razonamientos": map[string]any{"q1": map[string]string{"razonamiento": thought}},
		})
	}
	record("   ")
	f.statusExpect(t, "waiting")

	record("Pienso que q1 me pide el caso, y elijo esta opción porque el valor existe.")
	f.writeConceptFeedback(t,
		verdict("T.p1", "claro", "q1", "el valor existe"),
		verdict("P0.1", "claro", "q1", "elijo esta opción"),
	)
	rep := f.advanceOK(t, "quiz")
	if rep.Evidence["quizPassed"] != true {
		t.Fatalf("a one-thought answer with quoted verdicts passes: %+v", rep.Evidence)
	}
}

func TestConceptMiniQuizPassesAtTwoThirds(t *testing.T) {
	f := throughConceptPlanning(t)
	qs := conceptQuiz(3)
	f.writeConceptQuiz(t, qs)
	f.writeConceptAnswers(t, qs, reasonsFor("q1", "q2", "q3"), "q1")
	rep := f.advanceOK(t, "quiz")
	if rep.NextStage != "explanation" {
		t.Fatalf("1/3 re-teaches the part: nextStage %q", rep.NextStage)
	}

	f = throughConceptPlanning(t)
	f.writeConceptQuiz(t, qs)
	f.writeConceptAnswers(t, qs, reasonsFor("q1", "q2", "q3"), "q1", "q2")
	rep = f.advanceOK(t, "quiz")
	if rep.Evidence["quizPassed"] != true || rep.NextStage != "feedback" {
		t.Fatalf("2/3 without a central miss passes: passed=%v next=%q", rep.Evidence["quizPassed"], rep.NextStage)
	}
}

// A laguna on a concept of a central question re-teaches the part; on a
// non-central question it is recorded without blocking.
func TestConceptLagunaOnACentralQuestionReteaches(t *testing.T) {
	qs := conceptQuiz(3)
	r := reasonsFor("q1", "q2", "q3")
	pass := func(t *testing.T) *fixture {
		f := throughConceptPlanning(t)
		f.writeConceptQuiz(t, qs)
		f.writeConceptAnswers(t, qs, r, "q1", "q2", "q3")
		f.advanceOK(t, "quiz")
		return f
	}

	f := pass(t)
	f.writeFeedback(t, "p1", true)
	f.advanceExpectBlocked(t, "feedback", "concept-verdicts", "conceptos")

	f.writeConceptFeedback(t, quizVerdicts(qs, r, "q3/P0.1")...)
	if rep := f.advanceOK(t, "feedback"); rep.NextStage == "explanation" {
		t.Fatal("a laguna on a non-central question must not re-teach")
	}

	f = pass(t)
	f.writeConceptFeedback(t, quizVerdicts(qs, r, "q1/P0.1")...)
	rep := f.advanceOK(t, "feedback")
	if rep.NextStage != "explanation" || rep.Part != "p1" {
		t.Fatalf("a central laguna re-teaches: next %q part %q", rep.NextStage, rep.Part)
	}
	p1 := f.state(t)["parts"].(map[string]any)["p1"].(map[string]any)
	if rounds := p1["reteachRounds"].(float64); rounds != 1 {
		t.Fatalf("reteachRounds = %v, want 1", rounds)
	}
	if _, ok := p1["stages"].(map[string]any)["feedback"]; ok {
		t.Fatal("feedback must not be recorded when a central laguna re-teaches")
	}
}

func TestOldRunsKeepTheirQuizRules(t *testing.T) {
	f := newFixture(t)
	f.rules = adaptiveRulesPath
	f.initOK(t)
	f.writePlan(t, defaultParts()...)
	f.advanceOK(t, "preparation")
	f.writeAdaptive(t, []diagQuestionWire{adaptiveQ("a1", 1, "", "T.p1", 1, "B"), adaptiveQ("a2", 1, "", "T.p2", 1, "C")}, nil, false)
	f.statusExpect(t, "waiting")
}

// Runs started before concept diagnosis keep testdata/rules-adaptive-diagnosis.json;
// production differs only by the concept-diagnosis additions.
func TestAdaptiveRulesFixtureMatchesProductionRules(t *testing.T) {
	load := func(path string) map[string]any {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var doc map[string]any
		if err := json.Unmarshal(raw, &doc); err != nil {
			t.Fatal(err)
		}
		return doc
	}
	prod := load(productionRulesPath)
	delete(prod["thresholds"].(map[string]any), "concepts")
	checks := prod["checks"].(map[string]any)
	for stage, list := range checks {
		var keep []any
		for _, item := range list.([]any) {
			decl := item.(map[string]any)
			if decl["kind"] == "concept_verdicts" {
				continue
			}
			delete(decl, "verdicts")
			keep = append(keep, decl)
		}
		checks[stage] = keep
	}
	var rubrics []any
	for _, item := range prod["rubrics"].([]any) {
		if item.(map[string]any)["id"] != "diagnosis-sufficiency" {
			rubrics = append(rubrics, item)
		}
	}
	prod["rubrics"] = rubrics
	if !reflect.DeepEqual(load(adaptiveRulesPath), prod) {
		t.Fatal("testdata/rules-adaptive-diagnosis.json drifted from rules/deep.json outside the concept-diagnosis additions")
	}
}
