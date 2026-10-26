package engine

import (
	"fmt"
	"slices"
	"strings"

	"learning/internal/rules"
)

// Concept diagnosis: integrative questions declare the concepts they need,
// every answer carries the learner's reasoning, and the chat records one
// verdict per concept whose evidence is quoted from that reasoning.

// reasoning is the learner's thought about a question: one drain text in new
// records, the older pair of prompts in files written before they were merged.
type reasoning struct {
	Razonamiento string `json:"razonamiento"`
	Entendi      string `json:"entendi"`
	Porque       string `json:"porque"`
}

func (r reasoning) text() string {
	if thought := strings.TrimSpace(r.Razonamiento); thought != "" {
		return thought
	}
	parts := []string{}
	for _, part := range []string{r.Entendi, r.Porque} {
		if part = strings.TrimSpace(part); part != "" {
			parts = append(parts, part)
		}
	}
	return strings.Join(parts, "\n\n")
}

func (r reasoning) complete() bool {
	if strings.TrimSpace(r.Razonamiento) != "" {
		return true
	}
	// A record from before the prompts were merged always carried both texts;
	// a half-written one stays a learner wait instead of passing as a thought.
	return strings.TrimSpace(r.Entendi) != "" && strings.TrimSpace(r.Porque) != ""
}

// loadReasoning reads the razonamientos of an answers file; a missing file or
// field has none.
func loadReasoning(ws, rel string) (map[string]reasoning, error) {
	if answerFileMissing(ws, rel) {
		return map[string]reasoning{}, nil
	}
	var doc struct {
		Razonamientos map[string]reasoning `json:"razonamientos"`
	}
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return nil, fmt.Errorf("razonamientos unreadable: %w", err)
	}
	if doc.Razonamientos == nil {
		return map[string]reasoning{}, nil
	}
	return doc.Razonamientos, nil
}

// pendingAnswers lists the ids still owed by the learner: no answer, or an
// answer without both reasoning fields.
func pendingAnswers(ids []string, answers map[string]string, why map[string]reasoning) []string {
	var out []string
	for _, id := range ids {
		if strings.TrimSpace(answers[id]) == "" || !why[id].complete() {
			out = append(out, id)
		}
	}
	return out
}

func validateConceptos(id string, codes []string, planSubs map[string]bool, c *rules.ConceptThresholds) error {
	if len(codes) < c.MinPerQuestion || len(codes) > c.MaxPerQuestion {
		return fmt.Errorf("question %s declares %d conceptos, want %d-%d", id, len(codes), c.MinPerQuestion, c.MaxPerQuestion)
	}
	seen := map[string]bool{}
	for _, code := range codes {
		switch {
		case strings.TrimSpace(code) == "":
			return fmt.Errorf("question %s has an empty conceptos code", id)
		case seen[code]:
			return fmt.Errorf("question %s conceptos repeated %q", id, code)
		case !planSubs[code] && !strings.HasPrefix(code, "P0."):
			return fmt.Errorf("question %s conceptos code %q is neither a plan subtema nor a P0.x foundation", id, code)
		}
		seen[code] = true
	}
	return nil
}

// validateGuidedDiagnostic checks a diagnosis whose rounds the model sizes:
// valid questions in contiguous rounds from 1, each declaring its concepts,
// within the total bound.
func validateGuidedDiagnostic(qs []diagQuestion, plan *planDoc, th rules.Thresholds) error {
	c := th.Concepts
	if len(qs) == 0 {
		return fmt.Errorf("the diagnosis has no questions")
	}
	if len(qs) > c.DiagnosisMaxQuestions {
		return fmt.Errorf("the diagnosis asks %d questions; at most %d", len(qs), c.DiagnosisMaxQuestions)
	}
	planSubs := map[string]bool{}
	if plan != nil {
		planSubs = planSubtemas(*plan)
	}
	seen := map[string]bool{}
	last := 1
	for _, q := range qs {
		if err := validateDiagQuestion(q, seen, planSubs, th); err != nil {
			return err
		}
		switch {
		case q.Round < 1:
			return fmt.Errorf("question %s needs a round of 1 or more", q.ID)
		case q.Round < last:
			return fmt.Errorf("question %s (round %d) comes after a round %d question: list rounds in order", q.ID, q.Round, last)
		case q.Round > last+1:
			return fmt.Errorf("question %s jumps to round %d after round %d", q.ID, q.Round, last)
		}
		last = q.Round
		if err := validateConceptos(q.ID, q.Conceptos, planSubs, c); err != nil {
			return err
		}
	}
	return nil
}

// guidedFlow allows a round only after the previous one is fully answered.
func guidedFlow(qs []diagQuestion, answers map[string]string, why map[string]reasoning) error {
	for _, q := range qs {
		for _, p := range qs {
			if p.Round == q.Round-1 && len(pendingAnswers([]string{p.ID}, answers, why)) > 0 {
				return fmt.Errorf("round %d question %s was written before round %d was fully answered (%s is unanswered)", q.Round, q.ID, p.Round, p.ID)
			}
		}
	}
	return nil
}

type conceptQuestion struct {
	ID        string   `json:"id"`
	Round     int      `json:"round"`
	Central   bool     `json:"central"`
	Answer    string   `json:"answer"`
	Conceptos []string `json:"conceptos"`
}

func loadConceptQuestions(ws, rel string) ([]conceptQuestion, error) {
	var doc struct {
		Questions []conceptQuestion `json:"questions"`
	}
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return nil, err
	}
	return doc.Questions, nil
}

type conceptVerdict struct {
	Codigo    string `json:"codigo"`
	Estado    string `json:"estado"`
	Pregunta  string `json:"pregunta"`
	Evidencia string `json:"evidencia"`
}

// loadVerdicts reads the conceptos list of a verdict file; present reports
// whether the file exists and declares the list.
func loadVerdicts(ws, rel string) (verdicts []conceptVerdict, present bool, err error) {
	if answerFileMissing(ws, rel) {
		return nil, false, nil
	}
	var doc struct {
		Conceptos *[]conceptVerdict `json:"conceptos"`
	}
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return nil, false, err
	}
	if doc.Conceptos == nil {
		return nil, false, nil
	}
	return *doc.Conceptos, true, nil
}

// evalConceptVerdicts proves the chat judged every concept of every answered
// round from the learner's own reasoning, and derives the laguna evidence that
// re-teaching and planning read.
func evalConceptVerdicts(c *evalCtx, decl rules.CheckDecl) Check {
	if !c.r.Thresholds.ConceptMode() {
		return skipCheck(decl.ID, "concept diagnosis is not enabled by these rules")
	}
	ct := c.r.Thresholds.Concepts
	qRel, aRel, vRel := substPart(decl.Questions, c.part), substPart(decl.Answers, c.part), substPart(decl.Path, c.part)
	qs, err := loadConceptQuestions(c.ws, qRel)
	if err != nil {
		return skipCheck(decl.ID, "questions unavailable; verdicts cannot be checked: "+err.Error())
	}
	if len(qs) == 0 {
		return passCheck(decl.ID, "no questions asked: there is nothing to judge")
	}
	answers := map[string]string{}
	if !answerFileMissing(c.ws, aRel) {
		if answers, err = loadAnswers(c.ws, aRel); err != nil {
			return skipCheck(decl.ID, "answers unavailable; verdicts cannot be checked: "+err.Error())
		}
	}
	why, err := loadReasoning(c.ws, aRel)
	if err != nil {
		return failCheck(decl.ID, err.Error())
	}
	verdicts, present, err := loadVerdicts(c.ws, vRel)
	if err != nil {
		return failCheck(decl.ID, "concept verdicts unreadable: "+err.Error())
	}
	byID := map[string]conceptQuestion{}
	answered := map[string]bool{}
	for _, q := range qs {
		byID[q.ID] = q
		answered[q.ID] = len(pendingAnswers([]string{q.ID}, answers, why)) == 0
	}

	covered := map[string]bool{}
	gaps := map[string]bool{}
	var centralGaps []string
	for _, v := range verdicts {
		q, ok := byID[v.Pregunta]
		key := v.Pregunta + "/" + v.Codigo
		switch {
		case !ok || !answered[v.Pregunta]:
			return failCheck(decl.ID, fmt.Sprintf("verdict %s names pregunta %q, which is not an answered question", key, v.Pregunta))
		case !slices.Contains(q.Conceptos, v.Codigo):
			return failCheck(decl.ID, fmt.Sprintf("verdict %s: %q is not one of the conceptos %v of %s", key, v.Codigo, q.Conceptos, q.ID))
		case !slices.Contains(ct.States, v.Estado):
			return failCheck(decl.ID, fmt.Sprintf("verdict %s uses estado %q outside %v", key, v.Estado, ct.States))
		case strings.TrimSpace(v.Evidencia) == "" || !containsNorm(why[v.Pregunta].text(), v.Evidencia):
			return failCheck(decl.ID, fmt.Sprintf(
				"verdict %s evidencia is not quoted from the learner's reasoning for %s", key, v.Pregunta))
		}
		covered[key] = true
		if v.Estado == ct.GapState {
			gaps[v.Pregunta] = true
			if q.Central && !slices.Contains(centralGaps, key) {
				centralGaps = append(centralGaps, key)
			}
		}
	}

	rounds := map[int][]conceptQuestion{}
	maxRound := 0
	for _, q := range qs {
		r := max(q.Round, 1)
		rounds[r] = append(rounds[r], q)
		maxRound = max(maxRound, r)
	}
	for r := 1; r <= maxRound; r++ {
		var owed []string
		complete := true
		for _, q := range rounds[r] {
			if !answered[q.ID] {
				complete = false
				break
			}
			for _, code := range q.Conceptos {
				if !covered[q.ID+"/"+code] {
					owed = append(owed, q.ID+"/"+code)
				}
			}
		}
		if !complete || len(owed) == 0 {
			continue
		}
		list := strings.Join(owed, ", ")
		switch {
		case r < maxRound:
			return failCheck(decl.ID, fmt.Sprintf("round %d was written before the concept verdicts for round %d: %s owed in %s", maxRound, r, list, vRel))
		case c.part == "":
			return failCheck(decl.ID, fmt.Sprintf("concept verdicts owed for round %d in %s: %s", r, vRel, list))
		case !present:
			return failCheck(decl.ID, fmt.Sprintf("%s has no conceptos: concept verdicts owed for %s", vRel, list))
		default:
			return failCheck(decl.ID, fmt.Sprintf("concept verdicts owed in %s: %s", vRel, list))
		}
	}

	var gapList, focus []string
	for _, q := range qs {
		if gaps[q.ID] {
			gapList = append(gapList, q.ID)
		}
		if answered[q.ID] && (answers[q.ID] != q.Answer || gaps[q.ID]) {
			focus = append(focus, q.ID)
		}
	}
	c.evidence["conceptGaps"] = gapList
	c.evidence["centralConceptGaps"] = centralGaps
	if c.part == "" {
		c.evidence["diagnosticFocus"] = focus
	}
	return passCheck(decl.ID, fmt.Sprintf("%d concept verdicts quoted from the learner's reasoning in %s (laguna on %v, central %v)",
		len(verdicts), vRel, gapList, centralGaps))
}

// lagunaQuestions lists the questions with a gapState verdict in a verdict file.
func lagunaQuestions(ws, rel string, th rules.Thresholds) ([]string, error) {
	verdicts, _, err := loadVerdicts(ws, rel)
	if err != nil {
		return nil, err
	}
	var out []string
	for _, v := range verdicts {
		if v.Estado == th.Concepts.GapState && !slices.Contains(out, v.Pregunta) {
			out = append(out, v.Pregunta)
		}
	}
	return out, nil
}
