package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"learning/internal/rules"
)

// The strict university flow closes a part only when the learner passed its
// mini-quiz AND the tutor judged their own words as understood. A failed part
// stays closed as failed and owes a remedial part: declared right after it in
// plan.json with "remedia" (the part it remedies) and "analisis" (why the
// learner failed and what they did understand), taught with a mini-quiz whose
// questions differ from every earlier attempt. There is no retry cap.
const (
	stageRemedial       = "remedial"
	minRemedialAnalysis = 40
)

// strictPlan is the plan's view of the part sequence: the parts in plan order
// and, for remedial parts, the part they remedy.
type strictPlan struct {
	order   []string
	remedia map[string]string
	parts   map[string]planPartDoc
}

func loadStrictPlan(r *rules.Rules, st *State, ws string) strictPlan {
	sp := strictPlan{order: st.PartOrder, remedia: map[string]string{}, parts: map[string]planPartDoc{}}
	if !r.Thresholds.StrictFlow {
		return sp
	}
	plan, err := loadPlan(ws, declPathByKind(r, "preparation", "file_exists"))
	if err != nil {
		return sp
	}
	enrolled := map[string]bool{}
	for _, id := range st.PartOrder {
		enrolled[id] = true
	}
	seen := map[string]bool{}
	var order []string
	for _, p := range plan.Parts {
		sp.parts[p.ID] = p
		if p.Remedia != "" {
			sp.remedia[p.ID] = p.Remedia
		}
		if enrolled[p.ID] || p.Remedia != "" {
			order = append(order, p.ID)
			seen[p.ID] = true
		}
	}
	for _, id := range st.PartOrder {
		if !seen[id] {
			order = append(order, id)
		}
	}
	sp.order = order
	return sp
}

// root is the planned part a remedial chain belongs to.
func (sp strictPlan) root(id string) string {
	if r, ok := sp.remedia[id]; ok {
		return r
	}
	return id
}

// remedialOwed reports whether a failed part still lacks the remedial part that
// must follow it in the order.
func (sp strictPlan) remedialOwed(at int) bool {
	if at+1 >= len(sp.order) {
		return true
	}
	next := sp.order[at+1]
	r, ok := sp.remedia[next]
	return !ok || r != sp.root(sp.order[at])
}

func remedialPending(part string) Check {
	return failCheck("remedial-part", fmt.Sprintf(
		"part %s failed: declare its remedial part right after it in plan.json, with \"remedia\" (the part it remedies) and \"analisis\" (why the learner failed and what they did understand)", part))
}

// strictChecks are the strict flow's own obligations for one stage of one part.
func strictChecks(r *rules.Rules, st *State, ws, stage, part string, evidence map[string]any) []Check {
	if !r.Thresholds.StrictFlow || part == "" {
		return nil
	}
	sp := loadStrictPlan(r, st, ws)
	_, remedial := sp.remedia[part]
	switch {
	case stage == "explanation" && remedial:
		if n := len(strings.TrimSpace(sp.parts[part].Analisis)); n < minRemedialAnalysis {
			return []Check{failCheck("remedial-analysis", fmt.Sprintf(
				"remedial part %s needs its analisis in plan.json (%d characters, want at least %d): why the learner failed and what they did understand", part, n, minRemedialAnalysis))}
		}
		return []Check{passCheck("remedial-analysis", "remedial part "+part+" declares why the learner failed")}
	case stage == "quiz" && remedial:
		return []Check{freshQuiz(r, ws, sp, part)}
	case stage == "own_words":
		check, understood := ownWordsVerdict(ws, part)
		if check.Status == "PASS" && evidence != nil {
			evidence["ownWordsUnderstood"] = understood
		}
		return []Check{check}
	}
	return nil
}

// freshQuiz refuses a remedial mini-quiz that repeats a question of an earlier
// attempt of the same planned part.
func freshQuiz(r *rules.Rules, ws string, sp strictPlan, part string) Check {
	rel, _ := declQA(r, "quiz")
	own, err := loadQuizQuestions(ws, substPart(rel, part))
	if err != nil {
		return failCheck("fresh-quiz", "mini-quiz unreadable: "+err.Error())
	}
	asked := map[string]string{}
	for _, id := range sp.order {
		if id == part {
			break
		}
		if sp.root(id) != sp.root(part) {
			continue
		}
		earlier, err := loadQuizQuestions(ws, substPart(rel, id))
		if err != nil {
			continue
		}
		for _, q := range earlier {
			asked[strings.ToLower(norm(q.Enunciado))] = id
		}
	}
	for _, q := range own {
		if from, ok := asked[strings.ToLower(norm(q.Enunciado))]; ok {
			return failCheck("fresh-quiz", fmt.Sprintf(
				"question %s repeats a question of %s: a remedial mini-quiz asks new questions", q.ID, from))
		}
	}
	return passCheck("fresh-quiz", fmt.Sprintf("%d new question(s), none asked in an earlier attempt", len(own)))
}

// ownWordsVerdict reads the tutor's verdict on the learner's own words for a
// part: vuelco/<part>.json with "entendio" and its "evidencia".
func ownWordsVerdict(ws, part string) (Check, bool) {
	rel := "vuelco/" + part + ".json"
	var doc struct {
		Entendio  *bool  `json:"entendio"`
		Evidencia string `json:"evidencia"`
	}
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return failCheck("own-words-verdict", fmt.Sprintf(
			"the tutor's verdict %s is missing or unreadable: write {\"entendio\": true|false, \"evidencia\": \"...\"} after judging the learner's own words", rel)), false
	}
	if doc.Entendio == nil {
		return failCheck("own-words-verdict", rel+" must declare entendio as true or false"), false
	}
	if strings.TrimSpace(doc.Evidencia) == "" {
		return failCheck("own-words-verdict", rel+" needs its evidencia: what in the learner's words shows (or not) that they understood"), false
	}
	if *doc.Entendio {
		return passCheck("own-words-verdict", "the tutor judged the own words understood: "+truncate(doc.Evidencia, 160)), true
	}
	return passCheck("own-words-verdict", "the tutor judged the own words not understood: "+truncate(doc.Evidencia, 160)), false
}

// strictFailure names why a strict-flow part fails at this stage, or "".
func strictFailure(r *rules.Rules, st *State, stage, part string, evidence map[string]any) string {
	if !r.Thresholds.StrictFlow || part == "" {
		return ""
	}
	switch stage {
	case "quiz":
		if !evidenceBool(evidence, "quizPassed") {
			return "the mini-quiz failed"
		}
	case "own_words":
		if understood, ok := evidence["ownWordsUnderstood"].(bool); ok && !understood {
			return "the own words show the learner did not understand"
		}
	case "feedback":
		if gap, _ := assessmentGap(r, st, stage, part); gap {
			return "a central gap persists"
		}
		if gaps := evidenceStrings(evidence, "centralConceptGaps"); len(gaps) > 0 {
			return "a laguna persists on a central concept (" + strings.Join(gaps, ", ") + ")"
		}
	}
	return ""
}

// failPart closes a strict-flow part as failed: no retry cap, the next step is
// the remedial part it owes.
func failPart(r *rules.Rules, st *State, ws, stage, part, failure string, res evalResult, checks []Check) (Report, int) {
	ps := ensurePart(st, part)
	if stage == "quiz" {
		ps.QuizAttempts = append(ps.QuizAttempts, QuizAttempt{
			Score: evidenceInt(res.evidence, "quizScore"), Passed: false, At: time.Now().UTC(),
			WrongIDs: evidenceStrings(res.evidence, "quizWrongIds"),
		})
	}
	ps.Failed = true
	ps.FailedBecause = failure
	st.PartOrder = loadStrictPlan(r, st, ws).order
	st.Counters.SuccessfulAdvances++
	if err := saveState(ws, st); err != nil {
		return errorReport(err.Error()), ExitOperational
	}
	next, nextPart, _ := frontier(r, st, ws)
	checks = append(checks, passCheck("part-failed", "part "+part+" failed: "+failure+"; it owes a remedial part"))
	return Report{Status: "accepted", Stage: stage, NextStage: next, Part: nextPart, Checks: checks, Evidence: res.evidence}, ExitOK
}

// planReceipt hashes the plan without its remedial parts.
func planReceipt(ws, rel string) (string, error) {
	raw, err := os.ReadFile(absPath(ws, rel))
	if err != nil {
		return "", err
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return hashBytes(raw), nil
	}
	if parts, ok := doc["parts"].([]any); ok {
		kept := make([]any, 0, len(parts))
		for _, p := range parts {
			if m, ok := p.(map[string]any); ok && m["remedia"] != nil {
				continue
			}
			kept = append(kept, p)
		}
		doc["parts"] = kept
	}
	canonical, err := json.Marshal(doc)
	if err != nil {
		return "", err
	}
	return hashBytes(canonical), nil
}
