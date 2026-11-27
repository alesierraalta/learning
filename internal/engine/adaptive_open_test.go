package engine

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// T3 exercises the adaptive knowledge map through Run/Report: the artifacts are
// the same JSON the reader and tutor write, and every assertion is on a report
// verdict or on evidence a consumer can see.

func t3Parts(n int) []partCfg {
	out := make([]partCfg, 0, n)
	for i := 1; i <= n; i++ {
		out = append(out, partCfg{id: fmt.Sprintf("p%d", i), title: fmt.Sprintf("Parte %d", i)})
	}
	return out
}

func t3Teaching(areas, operations []string, depth string) map[string]any {
	teaching := map[string]any{"version": 1}
	if areas != nil {
		teaching["areas"] = areas
	}
	if operations != nil {
		teaching["operations"] = operations
	}
	if depth != "" {
		teaching["depth"] = depth
	}
	return teaching
}

func t3DiagItem(id string, round int, subtema, operation, depth, centrality, follows string) map[string]any {
	q := openDiagItem(openSpec{id: id, operation: operation, depth: depth, centrality: centrality, criteria: []string{"c1"}}, round)
	q["subtema"] = subtema
	if follows != "" {
		q["follows"] = follows
	}
	return q
}

func t3Fixture(t *testing.T, parts ...partCfg) *fixture {
	t.Helper()
	f := newFixture(t)
	f.rules = productionRulesPath
	f.initOK(t)
	f.writePlan(t, parts...)
	f.advanceOK(t, "preparation")
	return f
}

func t3Verdict(v, evidence string, concepts map[string]string, teaching map[string]any) map[string]any {
	entry := passageVerdict(v, evidence, criterionResult("c1", v == "correct", evidence))
	if concepts != nil {
		entry["concepts"] = concepts
	}
	if teaching != nil {
		entry["teaching"] = teaching
	}
	return entry
}

func t3TeachingEntry(errorType, evidence, action string) map[string]any {
	out := map[string]any{"action": action, "rationale": "Razón breve para el alumno.", "next": "Próximo paso concreto."}
	if errorType != "" {
		out["errorType"] = errorType
		out["evidence"] = evidence
	}
	return out
}

func t3Score(verdicts map[string]string) string {
	points := 0
	for _, v := range verdicts {
		switch v {
		case "correct":
			points += 2
		case "partial":
			points++
		}
	}
	if points%2 == 0 {
		return fmt.Sprintf("%d/%d", points/2, len(verdicts))
	}
	return fmt.Sprintf("%d.5/%d", points/2, len(verdicts))
}

func t3WriteDiagnosis(t *testing.T, f *fixture, qs []map[string]any, teaching map[string]any, answers map[string]any, verdicts map[string]map[string]any) {
	t.Helper()
	doc := map[string]any{"questions": qs}
	if teaching != nil {
		doc["teaching"] = teaching
	}
	f.writeJSON(t, "quiz.json", doc)
	f.writeJSON(t, "quiz.answers.json", map[string]any{"openAnswers": answers})
	f.writeOpenVerdicts(t, "quiz.verdicts.json", verdicts)
	raw := map[string]string{}
	for id, verdict := range verdicts {
		raw[id] = t3String(verdict["verdict"])
	}
	f.write(t, "quiz.md", openNote(qs, t3Score(raw)))
	f.writeJSON(t, "diagnostico-conceptos.json", map[string]any{"conceptos": []any{}})
}

func t3String(v any) string {
	s, _ := v.(string)
	return s
}

func t3Failures(rep Report) string {
	var out []string
	for _, check := range rep.Checks {
		if check.Status == "FAIL" {
			out = append(out, check.ID+": "+check.Reason)
		}
	}
	return strings.Join(out, " | ")
}

func t3EvidenceList(rep Report, key string) []map[string]any {
	raw, ok := rep.Evidence[key]
	if !ok {
		return nil
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return nil
	}
	var out []map[string]any
	if err := json.Unmarshal(encoded, &out); err != nil {
		return nil
	}
	return out
}

func t3QuizFixture(t *testing.T, qs []map[string]any, teaching map[string]any, answers map[string]any, verdicts map[string]map[string]any) (*fixture, Report) {
	t.Helper()
	f := openQuizFixture(t)
	doc := map[string]any{"questions": qs}
	if teaching != nil {
		doc["teaching"] = teaching
	}
	f.writeJSON(t, "mini-quiz/p1.json", doc)
	f.writeJSON(t, "mini-quiz/p1.answers.json", map[string]any{"quiz": openQuizFingerprint(t, qs), "openAnswers": answers})
	f.writeOpenVerdicts(t, "mini-quiz/p1.verdicts.json", verdicts)
	f.reviewPending(t, "quiz")
	rep, _ := f.run(t, f.opts("advance", "quiz"))
	return f, rep
}

func t3KnowledgeState(rep Report, code string) string {
	for _, entry := range t3EvidenceList(rep, "knowledgeMap") {
		if entry["code"] == code {
			return t3String(entry["state"])
		}
	}
	return ""
}

func TestOpenKnowledgeStatesFollowTheVerdict(t *testing.T) {
	for _, tc := range []struct {
		name, verdict, state, operation, depth, reason string
	}{
		{"incorrect cannot transfer", "incorrect", "transferible", "explain", "core", "transferible"},
		{"no evidence cannot be clear", "no-evidence", "claro", "apply", "core", "claro"},
		{"partial cannot transfer", "partial", "transferible", "transfer", "frontier", "transferible"},
		{"transfer needs transfer evidence", "correct", "transferible", "explain", "core", "transferible"},
		{"transfer with a transfer item", "correct", "transferible", "transfer", "frontier", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			item := makeOpenItem(openSpec{id: "q1", operation: tc.operation, depth: tc.depth, criteria: []string{"c1"}})
			entry := t3Verdict(tc.verdict, openText, map[string]string{"T.p1": tc.state}, nil)
			answer := map[string]any{"q1": makeTextAnswer(openText, "seguro")}
			if tc.verdict == "no-evidence" {
				answer = map[string]any{"q1": noEvidenceAnswer()}
				entry = t3Verdict("no-evidence", "No sé todavía", map[string]string{"T.p1": tc.state}, nil)
			}
			_, rep := t3QuizFixture(t, []map[string]any{item}, t3Teaching(nil, nil, ""), answer, map[string]map[string]any{"q1": entry})
			if tc.reason == "" {
				if rep.Evidence["quizPassed"] != true {
					t.Fatalf("a coherent open state must keep T1 scoring: %+v checks %+v", rep.Evidence, rep.Checks)
				}
				if got := t3KnowledgeState(rep, "T.p1"); got != "transferible" {
					t.Fatalf("knowledgeMap state = %q, want transferible", got)
				}
				return
			}
			if reason := failReason(rep, "mini-quiz-answers"); !strings.Contains(strings.ToLower(reason), strings.ToLower(tc.reason)) {
				t.Fatalf("%s: mini-quiz-answers = %q, want %q (checks %+v)", tc.name, reason, tc.reason, rep.Checks)
			}
		})
	}
}

func TestOpenTeachingMapsEveryErrorToItsAction(t *testing.T) {
	for _, tc := range []struct {
		name, verdict, errorType, action, operation, depth string
		state                                              string
	}{
		{"missing foundation", "no-evidence", "missing-knowledge", "prerequisite-review", "explain", "core", "laguna"},
		{"misconception", "incorrect", "misconception", "corrective-explanation", "explain", "core", "laguna"},
		{"incomplete reasoning", "partial", "incomplete-reasoning", "guided-practice", "explain", "core", "dudoso"},
		{"application gap", "partial", "application-failure", "guided-practice", "apply", "core", "dudoso"},
		{"transfer gap", "incorrect", "transfer-failure", "transfer-work", "transfer", "frontier", "dudoso"},
		{"advance", "correct", "", "advance", "explain", "core", "claro"},
		{"claro still needs transfer", "correct", "", "transfer-work", "transfer", "frontier", "claro"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			item := makeOpenItem(openSpec{id: "q1", operation: tc.operation, depth: tc.depth, criteria: []string{"c1"}})
			text := openText
			if tc.verdict == "no-evidence" {
				text = "No sé todavía"
			}
			teaching := t3TeachingEntry(tc.errorType, text, tc.action)
			entry := t3Verdict(tc.verdict, text, map[string]string{"T.p1": tc.state}, teaching)
			answer := map[string]any{"q1": makeTextAnswer(openText, "seguro")}
			if tc.verdict == "no-evidence" {
				answer = map[string]any{"q1": noEvidenceAnswer()}
			}
			_, rep := t3QuizFixture(t, []map[string]any{item}, t3Teaching(nil, nil, tc.depth), answer, map[string]map[string]any{"q1": entry})
			if rep.Status == "blocked" {
				t.Fatalf("coherent %s/%s was refused: %+v (checks %+v)", tc.errorType, tc.action, rep.Evidence, rep.Checks)
			}
			entries := t3EvidenceList(rep, "knowledgeMap")
			if len(entries) != 1 || t3String(entries[0]["errorType"]) != tc.errorType || entries[0]["action"] != tc.action || entries[0]["subtema"] != "T.p1" {
				t.Fatalf("knowledgeMap = %+v, want %s/%s on T.p1", entries, tc.errorType, tc.action)
			}
		})
	}
}

func TestOpenTeachingRejectsInconsistentVocabularyAndEvidence(t *testing.T) {
	for _, tc := range []struct {
		name, verdict, reason string
		teaching              map[string]any
	}{
		{"wrong action for a gap", "no-evidence", "action", t3TeachingEntry("missing-knowledge", "No sé todavía", "advance")},
		{"advance after an error", "incorrect", "action", t3TeachingEntry("misconception", openText, "advance")},
		{"unknown error", "incorrect", "errorType", t3TeachingEntry("confusion", openText, "guided-practice")},
		{"unknown action", "incorrect", "action", t3TeachingEntry("misconception", openText, "reteach")},
		{"forged error evidence", "incorrect", "evidence", t3TeachingEntry("misconception", "nunca escrito", "corrective-explanation")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			item := makeOpenItem(openSpec{id: "q1", criteria: []string{"c1"}})
			entry := t3Verdict(tc.verdict, openText, nil, tc.teaching)
			if tc.verdict == "no-evidence" {
				entry = t3Verdict("no-evidence", "No sé todavía", nil, tc.teaching)
			}
			answer := map[string]any{"q1": makeTextAnswer(openText, "seguro")}
			if tc.verdict == "no-evidence" {
				answer = map[string]any{"q1": noEvidenceAnswer()}
			}
			_, rep := t3QuizFixture(t, []map[string]any{item}, t3Teaching(nil, nil, ""), answer, map[string]map[string]any{"q1": entry})
			if reason := failReason(rep, "mini-quiz-answers"); !strings.Contains(strings.ToLower(reason), strings.ToLower(tc.reason)) {
				t.Fatalf("%s: mini-quiz-answers = %q, want %q", tc.name, reason, tc.reason)
			}
		})
	}
}

func TestOpenConfidenceIsCalibratedOutsideTheScore(t *testing.T) {
	item := makeOpenItem(openSpec{id: "q1", criteria: []string{"c1"}})
	entry := t3Verdict("correct", openText, map[string]string{"T.p1": "claro"}, t3TeachingEntry("", "", "advance"))
	answer := map[string]any{"q1": makeTextAnswer(openText, "adivine")}
	_, rep := t3QuizFixture(t, []map[string]any{item}, t3Teaching(nil, nil, ""), answer, map[string]map[string]any{"q1": entry})
	entries := t3EvidenceList(rep, "knowledgeMap")
	if len(entries) != 1 || entries[0]["confidence"] != "adivine" || t3String(entries[0]["calibration"]) == "" || t3String(entries[0]["calibration"]) == "aligned" {
		t.Fatalf("confidence must be reported and calibrated separately: %+v", entries)
	}
	if rep.Evidence["quizPassed"] != true || rep.Evidence["quizScore"] != 1 {
		t.Fatalf("confidence must not change the score: %+v", rep.Evidence)
	}
	bare := passageVerdict("correct", openText, criterionResult("c1", true, openText))
	_, legacy := t3QuizFixture(t, []map[string]any{item}, nil, answer, map[string]map[string]any{"q1": bare})
	if legacy.Evidence["quizPassed"] != true || t3EvidenceList(legacy, "knowledgeMap") != nil {
		t.Fatalf("a verdict without teaching keeps T1 behaviour: %+v", legacy.Evidence)
	}
}

func TestOpenDiagnosisInitialRoundCoversDeclaredAreas(t *testing.T) {
	areas := []string{"T.p1", "T.p2", "T.p3", "T.p4", "T.p5"}
	qs := []map[string]any{}
	for i, area := range areas[:4] {
		qs = append(qs, t3DiagItem(fmt.Sprintf("d%d", i+1), 1, area, "explain", "core", "central", ""))
	}
	f := t3Fixture(t, t3Parts(5)...)
	t3WriteDiagnosis(t, f, qs, t3Teaching(areas, nil, ""), nil, nil)
	rep, _ := f.run(t, f.opts("validate", "diagnosis"))
	if reason := failReason(rep, "quiz-answers"); !strings.Contains(strings.ToLower(reason), "coverage") {
		t.Fatalf("an initial round that leaves an area out: %q", reason)
	}

	qs = append(qs, t3DiagItem("d5", 1, areas[4], "apply", "core", "supporting", ""))
	t3WriteDiagnosis(t, f, qs, t3Teaching(areas, nil, ""), nil, nil)
	rep, _ = f.run(t, f.opts("validate", "diagnosis"))
	if hasFailID(rep, "quiz-structure") || strings.Contains(strings.ToLower(failReason(rep, "quiz-answers")), "coverage") {
		t.Fatalf("a broad first round must pass structure: checks %+v", rep.Checks)
	}

	qs = append(qs, t3DiagItem("d6", 1, areas[0], "transfer", "frontier", "supporting", ""), t3DiagItem("d7", 1, areas[1], "compare", "core", "supporting", ""))
	t3WriteDiagnosis(t, f, qs, t3Teaching(areas, nil, ""), nil, nil)
	rep, _ = f.run(t, f.opts("validate", "diagnosis"))
	if reason := failReason(rep, "quiz-answers"); !strings.Contains(strings.ToLower(reason), "coverage needs") {
		t.Fatalf("initial breadth keeps its bound: %q", reason)
	}
}

func TestOpenDiagnosisFollowupsNeedAnswersVerdictsAndJustification(t *testing.T) {
	areas := []string{"T.p1", "T.p2", "T.p3", "T.p4"}
	f := t3Fixture(t, t3Parts(4)...)
	qs := []map[string]any{
		t3DiagItem("d1", 1, areas[0], "explain", "core", "central", ""),
		t3DiagItem("d2", 1, areas[1], "apply", "core", "supporting", ""),
		t3DiagItem("d3", 1, areas[2], "predict", "core", "supporting", ""),
		t3DiagItem("d4", 1, areas[3], "transfer", "frontier", "supporting", ""),
	}
	answers := map[string]any{}
	verdicts := map[string]map[string]any{}
	for i, id := range []string{"d1", "d2", "d3", "d4"} {
		answers[id] = makeTextAnswer(openText, "seguro")
		v := "correct"
		if i == 0 {
			v = "incorrect"
		}
		verdicts[id] = t3Verdict(v, openText, nil, nil)
	}
	follow := t3DiagItem("d5", 2, areas[0], "explain", "core", "central", "d1")
	withFollow := append(append([]map[string]any{}, qs...), follow)

	t3WriteDiagnosis(t, f, withFollow, t3Teaching(areas, nil, ""), nil, nil)
	rep, _ := f.run(t, f.opts("validate", "diagnosis"))
	if reason := failReason(rep, "quiz-answers"); !strings.Contains(strings.ToLower(reason), "round") {
		t.Fatalf("a new round before the previous answers: %q", reason)
	}

	t3WriteDiagnosis(t, f, withFollow, t3Teaching(areas, nil, ""), answers, nil)
	rep, _ = f.run(t, f.opts("validate", "diagnosis"))
	if reason := failReason(rep, "quiz-answers"); !strings.Contains(strings.ToLower(reason), "verdict") {
		t.Fatalf("answers without verdicts do not open the next round: %q", reason)
	}

	answers["d5"] = makeTextAnswer(openText, "seguro")
	verdicts["d5"] = t3Verdict("correct", openText, nil, nil)
	t3WriteDiagnosis(t, f, withFollow, t3Teaching(areas, nil, ""), answers, verdicts)
	rep, code := f.run(t, f.opts("validate", "diagnosis"))
	if code != 0 || hasFailID(rep, "quiz-answers") {
		t.Fatalf("quiz-answers: %s (exit %d)", failReason(rep, "quiz-answers"), code)
	}

	unjustified := t3DiagItem("d5", 2, areas[0], "explain", "core", "central", "d2")
	t3WriteDiagnosis(t, f, append(append([]map[string]any{}, qs...), unjustified), t3Teaching(areas, nil, ""), answers, verdicts)
	rep, _ = f.run(t, f.opts("validate", "diagnosis"))
	if reason := failReason(rep, "quiz-answers"); !strings.Contains(strings.ToLower(reason), "follow") {
		t.Fatalf("a follow-up must name uncertain evidence: %q", reason)
	}
}

func TestOpenDiagnosisStopsOnSufficiencyNotAroundCount(t *testing.T) {
	areas := []string{"T.p1", "T.p2", "T.p3", "T.p4"}
	f := t3Fixture(t, t3Parts(4)...)
	qs := []map[string]any{
		t3DiagItem("d1", 1, areas[0], "explain", "core", "central", ""),
		t3DiagItem("d2", 1, areas[1], "apply", "core", "supporting", ""),
		t3DiagItem("d3", 1, areas[2], "predict", "core", "supporting", ""),
		t3DiagItem("d4", 1, areas[3], "transfer", "frontier", "supporting", ""),
	}
	answers := map[string]any{}
	verdicts := map[string]map[string]any{}
	for _, id := range []string{"d1", "d2", "d3", "d4"} {
		answers[id] = makeTextAnswer(openText, "seguro")
		verdicts[id] = t3Verdict("correct", openText, nil, nil)
	}
	verdicts["d1"] = t3Verdict("incorrect", openText, map[string]string{"T.p1": "laguna"}, t3TeachingEntry("misconception", openText, "corrective-explanation"))
	follow := t3DiagItem("d5", 2, areas[0], "apply", "core", "central", "d1")
	all := append(append([]map[string]any{}, qs...), follow)
	answers["d5"] = makeTextAnswer("Ahora aplico la regla al caso con otro ejemplo.", "dudo")
	verdicts["d5"] = t3Verdict("correct", "Ahora aplico la regla", map[string]string{"T.p1": "claro"}, t3TeachingEntry("", "", "advance"))

	t3WriteDiagnosis(t, f, all, t3Teaching(areas, nil, ""), answers, verdicts)
	if before, code := f.run(t, f.opts("validate", "diagnosis")); code != 0 {
		t.Fatalf("objective: %s (exit %d)", failReason(before, "quiz-answers"), code)
	}
	f.recordReview(t, "diagnosis", "diagnosis-sufficiency", "PASS", "todas las áreas tienen evidencia y el central se resolvió")
	rep := f.advanceOK(t, "diagnosis")
	states := t3EvidenceList(rep, "knowledgeMap")
	if len(states) == 0 || rep.Evidence["teachingPlan"] == nil {
		t.Fatalf("the diagnosis must publish its knowledge map and teaching plan: %+v", rep.Evidence)
	}
	if fmt.Sprint(rep.Evidence["diagnosisCoverage"]) != fmt.Sprint(areas) {
		t.Fatalf("diagnosisCoverage = %v, want %v", rep.Evidence["diagnosisCoverage"], areas)
	}
	for _, entry := range states {
		if entry["code"] == "T.p1" && entry["state"] != "claro" {
			t.Fatalf("a resolved central concept must move past laguna: %+v", entry)
		}
	}

	// An unresolved central question still has room for a follow-up: diagnosis blocks.
	f2 := t3Fixture(t, t3Parts(4)...)
	t3WriteDiagnosis(t, f2, qs, t3Teaching(areas, nil, ""), answersFor(qs, openText), map[string]map[string]any{
		"d1": t3Verdict("incorrect", openText, nil, nil),
		"d2": t3Verdict("correct", openText, nil, nil),
		"d3": t3Verdict("correct", openText, nil, nil),
		"d4": t3Verdict("correct", openText, nil, nil),
	})
	rep, _ = f2.run(t, f2.opts("validate", "diagnosis"))
	if reason := failReason(rep, "quiz-answers"); !strings.Contains(strings.ToLower(reason), "central") {
		t.Fatalf("an unresolved central question owes a follow-up: %q", reason)
	}
}

func TestOpenDiagnosisLeavesUnresolvedLagunaToTheTeachingPlanAtTheMaximum(t *testing.T) {
	areas := []string{"T.p1", "T.p2", "T.p3", "T.p4"}
	f := t3Fixture(t, t3Parts(4)...)
	qs := []map[string]any{
		t3DiagItem("d1", 1, areas[0], "explain", "core", "central", ""),
		t3DiagItem("d2", 1, areas[1], "apply", "core", "supporting", ""),
		t3DiagItem("d3", 1, areas[2], "predict", "core", "supporting", ""),
		t3DiagItem("d4", 1, areas[3], "transfer", "frontier", "supporting", ""),
	}
	answers := answersFor(qs, openText)
	verdicts := map[string]map[string]any{
		"d1": t3Verdict("incorrect", openText, map[string]string{"T.p1": "laguna"}, t3TeachingEntry("misconception", openText, "corrective-explanation")),
		"d2": t3Verdict("correct", openText, nil, nil),
		"d3": t3Verdict("correct", openText, nil, nil),
		"d4": t3Verdict("correct", openText, nil, nil),
	}
	for i := range 11 {
		id := fmt.Sprintf("f%d", i+1)
		round := 2 + i/5
		qs = append(qs, t3DiagItem(id, round, areas[0], "apply", "core", "supporting", "d1"))
		answers[id] = makeTextAnswer(openText, "dudo")
		verdicts[id] = t3Verdict("partial", openText, nil, nil)
	}
	if len(qs) != 15 {
		t.Fatalf("prepared %d questions, want the diagnosis maximum", len(qs))
	}
	t3WriteDiagnosis(t, f, qs, t3Teaching(areas, nil, ""), answers, verdicts)
	f.recordReview(t, "diagnosis", "diagnosis-sufficiency", "PASS", "las áreas están cubiertas; la laguna central restante va al plan")
	rep := f.advanceOK(t, "diagnosis")
	plan, _ := rep.Evidence["teachingPlan"].([]string)
	if !strings.Contains(strings.Join(plan, ","), "T.p1: corrective-explanation") {
		t.Fatalf("an unresolved laguna must become teaching-plan input: %v (%+v)", plan, rep.Evidence)
	}
	for _, entry := range t3EvidenceList(rep, "knowledgeMap") {
		if entry["code"] == "T.p1" && entry["state"] != "laguna" {
			t.Fatalf("an unresolved concept must not be promoted: %+v", entry)
		}
	}
}

func answersFor(qs []map[string]any, text string) map[string]any {
	out := map[string]any{}
	for _, q := range qs {
		out[t3String(q["id"])] = makeTextAnswer(text, "seguro")
	}
	return out
}

func TestOpenMiniQuizRequiresTheDeclaredOperationMix(t *testing.T) {
	item := func(id, operation string) map[string]any {
		return makeOpenItem(openSpec{id: id, operation: operation, depth: "frontier", criteria: []string{"c1"}})
	}
	mix := []string{"explain", "apply", "predict", "transfer"}
	qs := []map[string]any{item("q1", "explain")}
	answers := map[string]any{"q1": makeTextAnswer(openText, "seguro")}
	verdicts := map[string]map[string]any{"q1": t3Verdict("correct", openText, nil, nil)}
	_, rep := t3QuizFixture(t, qs, t3Teaching(nil, mix, "frontier"), answers, verdicts)
	if reason := failReason(rep, "mini-quiz-answers"); !strings.Contains(strings.ToLower(reason), "apply") {
		t.Fatalf("a declared mix must include own words and application: %q", reason)
	}

	qs = []map[string]any{item("q1", "explain"), item("q2", "apply"), item("q3", "predict"), item("q4", "transfer")}
	answers = map[string]any{}
	verdicts = map[string]map[string]any{}
	for _, q := range qs {
		id := t3String(q["id"])
		answers[id] = makeTextAnswer(openText, "seguro")
		verdicts[id] = t3Verdict("correct", openText, nil, nil)
	}
	_, rep = t3QuizFixture(t, qs, t3Teaching(nil, mix, "frontier"), answers, verdicts)
	if rep.Status == "blocked" {
		t.Fatalf("the declared operation mix was refused: %+v", rep.Checks)
	}
}
