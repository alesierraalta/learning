package engine

import (
	"fmt"
	"os"
	"slices"
	"strings"

	"learning/internal/rules"
)

type evalResult struct {
	checks   []Check
	evidence map[string]any
}

type evalCtx struct {
	r        *rules.Rules
	st       *State
	ws       string
	stage    string
	part     string
	plan     *planDoc
	planErr  error
	evidence map[string]any
}

// evalStage runs every deterministic check declared for a stage. Objective
// inputs only: real notes, quantitative structure, recorded learner answers.
func evalStage(r *rules.Rules, st *State, ws, stage, part string) evalResult {
	res := evalResult{evidence: map[string]any{}}
	if err := validateDeclaredConditions(r); err != nil {
		res.checks = append(res.checks, failCheck("rules-invalid", err.Error()))
		return res
	}
	planRel := declPathByKind(r, "preparation", "file_exists")
	plan, perr := loadPlan(ws, planRel)
	ctx := evalCtx{r: r, st: st, ws: ws, stage: stage, part: part, plan: &plan, planErr: perr, evidence: res.evidence}
	for _, decl := range r.ChecksFor(stage) {
		res.checks = append(res.checks, evalCheck(&ctx, decl))
	}
	res.checks = append(res.checks, validateReceiptInputs(r, ws, stage)...)
	for _, cond := range r.Conditions {
		if cond.OnStage != stage {
			continue
		}
		for _, path := range cond.Require.Paths {
			hash, err := hashFile(absPath(ws, path))
			if err != nil {
				res.checks = append(res.checks, failCheck(cond.ID, "cannot snapshot conditional artifact: "+path))
				continue
			}
			res.evidence[condSnapshotKey(cond.ID, path)] = hash
		}
	}
	return res
}

func validateReceiptInputs(r *rules.Rules, ws, stage string) []Check {
	if stage != "planning" {
		return nil
	}
	var out []Check
	for _, path := range []string{"mis-palabras.md"} {
		if _, err := os.Stat(absPath(ws, path)); err == nil {
			out = append(out, passCheck("planning-receipt-inputs", path+" present"))
		}
	}
	return out
}

// partFile resolves the contract filename of the current part.
func (c *evalCtx) partFile() (string, error) {
	if c.planErr != nil {
		return "", c.planErr
	}
	tmpl := declPathByKind(c.r, "explanation", "part_file")
	return partRel(c.plan, tmpl, c.part)
}

func validateDeclaredConditions(r *rules.Rules) error {
	for _, condition := range r.Conditions {
		if condition.Require.Kind != "changed_after_feedback" && condition.Require.Kind != "changed_after" {
			return fmt.Errorf("condition %q uses unknown require kind %q", condition.ID, condition.Require.Kind)
		}
	}
	return nil
}

func evalCheck(c *evalCtx, decl rules.CheckDecl) Check {
	switch decl.Kind {
	case "file_exists":
		rel := decl.Path
		if _, err := os.ReadFile(absPath(c.ws, rel)); err != nil {
			return failCheck(decl.ID, "missing artifact: "+rel)
		}
		return passCheck(decl.ID, rel+" is present")

	case "mermaid_graph":
		return evalMermaidGraph(c, decl)

	case "plan_valid":
		if c.planErr != nil {
			return failCheck(decl.ID, c.planErr.Error())
		}
		if err := validatePlanStructure(*c.plan); err != nil {
			return failCheck(decl.ID, "plan invalid: "+err.Error())
		}
		var ids []string
		for _, p := range c.plan.Parts {
			ids = append(ids, p.ID)
		}
		return passCheck(decl.ID, fmt.Sprintf("plan declares topic %q and %d part(s): %s",
			c.plan.Topic, len(c.plan.Parts), strings.Join(ids, ",")))

	case "planning_link":
		return evalPlanningLink(c, decl)

	case "diagnostic_questions":
		return evalDiagnosticQuestions(c, decl)

	case "diagnostic_answers":
		return evalDiagnosticAnswers(c, decl)

	case "planificador_sections":
		return evalPlanificador(c, decl)

	case "index_note":
		return evalIndexNote(c, decl)

	case "mis_palabras_structure":
		return evalMisPalabrasStructure(c, decl)

	case "mis_palabras_area":
		return evalMisPalabrasArea(c, decl)

	case "part_file":
		rel, err := c.partFile()
		if err != nil {
			return failCheck(decl.ID, err.Error())
		}
		b, err := os.ReadFile(absPath(c.ws, rel))
		if err != nil {
			return failCheck(decl.ID, "missing artifact: "+rel)
		}
		if strings.TrimSpace(string(b)) == "" {
			return failCheck(decl.ID, "artifact is empty: "+rel)
		}
		return passCheck(decl.ID, fmt.Sprintf("%s present (%d bytes)", rel, len(b)))

	case "explanation_content":
		return evalExplanationContent(c, decl)

	case "changed_after_failed_quiz":
		return evalChangedAfterFailedQuiz(c, decl)

	case "part_has_mini_quiz":
		return evalPartHasMiniQuiz(c)

	case "quiz_questions":
		return evalMiniQuizQuestions(c, decl)

	case "quiz_answers":
		return evalMiniQuizAnswers(c, decl)

	case "quiz_passed":
		if c.part == "" {
			return failCheck(decl.ID, "no part context for quiz evaluation")
		}
		ps := c.st.Parts[c.part]
		if ps == nil {
			return failCheck(decl.ID, "quiz not passed for part "+c.part)
		}
		rec, ok := ps.Stages["quiz"]
		if !ok || !evidenceBool(rec.Evidence, "quizPassed") {
			return failCheck(decl.ID, fmt.Sprintf("quiz not passed for part %s (no passing attempt recorded)", c.part))
		}
		return passCheck(decl.ID, fmt.Sprintf("quiz passed for part %s with derived score %d/%d",
			c.part, evidenceInt(rec.Evidence, "quizScore"), evidenceInt(rec.Evidence, "quizTotal")))

	case "feedback_valid":
		return evalFeedback(c, decl)

	case "feedback_evidence":
		return evalFeedbackEvidence(c, decl)

	case "feedback_condition":
		return evalFeedbackCondition(c)

	case "exercises_note":
		return evalExercisesNote(c, decl)

	case "final_quiz_note":
		return evalFinalQuizNote(c, decl)

	case "all_current":
		return evalAllCurrent(c.r, c.st, c.ws)
	}
	// Unreachable: rules.Load rejects unknown kinds (fail closed).
	return failCheck(decl.ID, "unknown check kind "+decl.Kind)
}

// evalPlanningLink proves the plan was really updated after the diagnostic
// and that every join key travels into the planificador note (B1).
func evalPlanningLink(c *evalCtx, decl rules.CheckDecl) Check {
	if c.planErr != nil {
		return failCheck(decl.ID, c.planErr.Error())
	}
	if err := validatePlanStructure(*c.plan); err != nil {
		return failCheck(decl.ID, "plan invalid: "+err.Error())
	}
	if strings.TrimSpace(c.plan.DiagnosisSummary) == "" {
		return failCheck(decl.ID, "plan has no diagnosisSummary: the plan was not updated after the diagnostic")
	}
	qs, err := loadDiagQuestions(c.ws, decl.Questions)
	if err != nil {
		return failCheck(decl.ID, "diagnostic questions unavailable: "+err.Error())
	}
	if err := validateDiagnostic(qs, c.plan, c.r.Thresholds); err != nil {
		return failCheck(decl.ID, "diagnostic questions invalid: "+err.Error())
	}
	answers, err := loadAnswers(c.ws, decl.Answers)
	if err != nil {
		return failCheck(decl.ID, "diagnostic answers unavailable: "+err.Error())
	}
	var ids []string
	for _, q := range qs {
		ids = append(ids, q.ID)
	}
	if err := checkCoverage(ids, answers, c.r.Thresholds.Options); err != nil {
		return failCheck(decl.ID, "diagnostic answers invalid: "+err.Error())
	}
	noteBytes, err := os.ReadFile(absPath(c.ws, decl.Note))
	if err != nil {
		return failCheck(decl.ID, "planificador note unavailable: "+decl.Note)
	}
	note := string(noteBytes)
	score := scoreDiag(qs, answers)
	wrong := map[string]bool{}
	for _, id := range score.WrongIDs {
		wrong[id] = true
	}
	known := map[string]bool{}
	for _, id := range ids {
		known[id] = true
	}
	for _, f := range c.plan.FocusAreas {
		if !known[f] {
			return failCheck(decl.ID, fmt.Sprintf("focusAreas reference unknown diagnostic question %q", f))
		}
	}
	if len(score.WrongIDs) == 0 {
		if len(c.plan.FocusAreas) > 0 {
			return failCheck(decl.ID, "focusAreas declared but every diagnostic answer was correct")
		}
	} else {
		linked := false
		for _, f := range c.plan.FocusAreas {
			if wrong[f] {
				linked = true
			}
		}
		if !linked {
			return failCheck(decl.ID, fmt.Sprintf(
				"focusAreas do not include any wrongly answered question (wrong: %s)",
				strings.Join(score.WrongIDs, ",")))
		}
	}
	// Join keys must travel quiz -> planificador: every subtema referenced by
	// the diagnostic and every part subtema appears in the note.
	for _, q := range qs {
		if !strings.Contains(note, q.Subtema) {
			return failCheck(decl.ID, fmt.Sprintf("diagnostic subtema %q is missing from %s", q.Subtema, decl.Note))
		}
	}
	for _, p := range c.plan.Parts {
		if !strings.Contains(note, p.Subtema) {
			return failCheck(decl.ID, fmt.Sprintf("plan subtema %q is missing from %s", p.Subtema, decl.Note))
		}
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"plan linked to diagnostic results (summary, focus %v among wrong %v) and all subtema join keys appear in %s",
		c.plan.FocusAreas, score.WrongIDs, decl.Note))
}

// evalDiagnosticQuestions checks real question structure and binds every
// enunciado, option, tag and piece to the actual quiz.md output (B1).
func evalDiagnosticQuestions(c *evalCtx, decl rules.CheckDecl) Check {
	qs, err := loadDiagQuestions(c.ws, decl.Path)
	if err != nil {
		return failCheck(decl.ID, err.Error())
	}
	if err := validateDiagnostic(qs, c.plan, c.r.Thresholds); err != nil {
		return failCheck(decl.ID, "diagnostic questions invalid: "+err.Error())
	}
	noteBytes, err := os.ReadFile(absPath(c.ws, decl.Note))
	if err != nil {
		return failCheck(decl.ID, "quiz note unavailable: "+decl.Note)
	}
	note := string(noteBytes)
	fm := parseFrontmatter(note)
	if fm["tipo"] != "quiz-diagnostico" {
		return failCheck(decl.ID, fmt.Sprintf("%s frontmatter tipo = %q, want quiz-diagnostico", decl.Note, fm["tipo"]))
	}
	for _, q := range qs {
		if !containsNorm(note, q.Enunciado) {
			return failCheck(decl.ID, fmt.Sprintf("question %s enunciado is not present in %s", q.ID, decl.Note))
		}
		if !containsNorm(note, q.Pieza.Contenido) {
			return failCheck(decl.ID, fmt.Sprintf(
				"question %s working piece is not present in %s: copy pieza.contenido into the note verbatim (only whitespace may differ)",
				q.ID, decl.Note))
		}
		if !strings.Contains(note, q.Subtema) {
			return failCheck(decl.ID, fmt.Sprintf("question %s subtema tag %q is not visible in %s", q.ID, q.Subtema, decl.Note))
		}
		if !strings.Contains(note, q.Nivel) {
			return failCheck(decl.ID, fmt.Sprintf("question %s nivel tag %q is not visible in %s", q.ID, q.Nivel, decl.Note))
		}
		for _, key := range c.r.Thresholds.Options.AnswerKeys {
			if !containsNorm(note, q.Options[key]) {
				return failCheck(decl.ID, fmt.Sprintf("question %s option %s text is not present in %s", q.ID, key, decl.Note))
			}
		}
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"%d questions with enunciado, A-%s choices, subtema/nivel tags and working pieces bound to %s",
		len(qs), c.r.Thresholds.Options.AnswerKeys[len(c.r.Thresholds.Options.AnswerKeys)-1], decl.Note))
}

// evalDiagnosticAnswers derives the score from answers and keys and binds it
// to the quiz.md frontmatter (recorded answers and scores -> actual output).
func evalDiagnosticAnswers(c *evalCtx, decl rules.CheckDecl) Check {
	qs, err := loadDiagQuestions(c.ws, decl.Questions)
	if err != nil {
		return skipCheck(decl.ID, "questions invalid; answers cannot be checked: "+err.Error())
	}
	if err := validateDiagnostic(qs, c.plan, c.r.Thresholds); err != nil {
		return skipCheck(decl.ID, "questions invalid; answers cannot be checked: "+err.Error())
	}
	if answerFileMissing(c.ws, decl.Answers) {
		return failCheck(decl.ID, fmt.Sprintf(
			"learner answers not yet recorded in %s (waiting for learner input)", decl.Answers))
	}
	answers, err := loadAnswers(c.ws, decl.Answers)
	if err != nil {
		return failCheck(decl.ID, "answers invalid: "+err.Error())
	}
	var ids []string
	for _, q := range qs {
		ids = append(ids, q.ID)
	}
	if err := checkCoverage(ids, answers, c.r.Thresholds.Options); err != nil {
		return failCheck(decl.ID, "answers invalid: "+err.Error())
	}
	score := scoreDiag(qs, answers)
	wantPuntaje := fmt.Sprintf("%d/%d", score.Correct, len(qs))
	noteBytes, err := os.ReadFile(absPath(c.ws, decl.Note))
	if err != nil {
		return failCheck(decl.ID, "quiz note unavailable: "+decl.Note)
	}
	fm := parseFrontmatter(string(noteBytes))
	if fm["estado"] != "completado" {
		return failCheck(decl.ID, fmt.Sprintf("%s frontmatter estado = %q, want completado after recording answers",
			decl.Note, fm["estado"]))
	}
	if fm["puntaje"] != wantPuntaje {
		return failCheck(decl.ID, fmt.Sprintf("%s frontmatter puntaje = %q, derived score is %q",
			decl.Note, fm["puntaje"], wantPuntaje))
	}
	c.evidence["diagnosticScore"] = wantPuntaje
	c.evidence["diagnosticWrong"] = score.WrongIDs
	return passCheck(decl.ID, fmt.Sprintf("%d/%d answers recorded; derived score %s (bound to %s puntaje)",
		len(qs), len(qs), wantPuntaje, decl.Note))
}

// evalPlanificador enforces the mandated planificador.md structure: every
// required section nonempty, dependency map, bibliography verification,
// per-part visual rows, route and exercise declaration (B1).
func evalPlanificador(c *evalCtx, decl rules.CheckDecl) Check {
	raw, err := os.ReadFile(absPath(c.ws, decl.Path))
	if err != nil {
		return failCheck(decl.ID, "missing artifact: "+decl.Path)
	}
	text := string(raw)
	for _, phrase := range c.r.Thresholds.PlanSections {
		body, ok := findSection(text, phrase)
		if !ok {
			return failCheck(decl.ID, fmt.Sprintf("required section %q missing from %s", phrase, decl.Path))
		}
		if strings.TrimSpace(body) == "" {
			return failCheck(decl.ID, fmt.Sprintf("required section %q is empty in %s", phrase, decl.Path))
		}
	}
	mapBody, _ := findSection(text, "mapa de dependencias")
	if !strings.Contains(mapBody, "```mermaid") {
		return failCheck(decl.ID, "dependency map section has no mermaid graph")
	}
	biblio, _ := findSection(text, "bibliografía")
	if !strings.Contains(biblio, "✅ verificado") {
		return failCheck(decl.ID, "bibliography has no verified (✅ verificado) claim row")
	}
	exBody, _ := findSection(text, "ejercicios")
	if countLines(exBody, isPipeLine) < 1 {
		return failCheck(decl.ID, "exercise declaration table is missing from the plan")
	}
	visual, _ := findSection(text, c.r.Thresholds.PlanVisualHead)
	wantRows := len(c.planParts()) + 2 // header + separator + one row per part
	if got := countLines(visual, isPipeLine); got < wantRows {
		return failCheck(decl.ID, fmt.Sprintf("plan visual has %d table lines, want at least %d (one row per part)", got, wantRows))
	}
	ruta, ok := findSection(text, "ruta")
	if !ok || countLines(ruta, isNumberedItem) < 1 {
		return failCheck(decl.ID, "numbered route is missing from the plan")
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"%d required sections present; mermaid map, verified bibliography, %d visual row(s), route and exercise table verified",
		len(c.r.Thresholds.PlanSections), len(c.planParts())))
}

func (c *evalCtx) planParts() []planPartDoc {
	if c.plan == nil || c.planErr != nil {
		return nil
	}
	return c.plan.Parts
}

func evalIndexNote(c *evalCtx, decl rules.CheckDecl) Check {
	raw, err := os.ReadFile(absPath(c.ws, decl.Path))
	if err != nil {
		return failCheck(decl.ID, "missing artifact: "+decl.Path)
	}
	if strings.TrimSpace(string(raw)) == "" {
		return failCheck(decl.ID, "index note is empty: "+decl.Path)
	}
	if !strings.Contains(string(raw), "[[explicaciones/") {
		return failCheck(decl.ID, "index has no resolving links to explicaciones/")
	}
	return passCheck(decl.ID, decl.Path+" is a nonempty index linking the parts")
}

func evalMisPalabrasStructure(c *evalCtx, decl rules.CheckDecl) Check {
	raw, err := os.ReadFile(absPath(c.ws, decl.Path))
	if err != nil {
		return failCheck(decl.ID, "missing artifact: "+decl.Path)
	}
	areas := misPalabrasAreas(string(raw), c.r.Thresholds.MisPalabrasHdr)
	want := len(c.planParts())
	if len(areas) != want {
		return failCheck(decl.ID, fmt.Sprintf("%s declares %d dump area(s), want exactly %d (one per part)",
			decl.Path, len(areas), want))
	}
	return passCheck(decl.ID, fmt.Sprintf("%s declares %d dump area(s), one per part", decl.Path, len(areas)))
}

// evalMisPalabrasArea checks the learner's own-words submission for the
// current part. Structural only: presence is distinguished from absence, the
// length of a nonempty utterance is never graded (B2).
func evalMisPalabrasArea(c *evalCtx, decl rules.CheckDecl) Check {
	raw, err := os.ReadFile(absPath(c.ws, decl.Path))
	if err != nil {
		return failCheck(decl.ID, "missing artifact: "+decl.Path)
	}
	areas := misPalabrasAreas(string(raw), c.r.Thresholds.MisPalabrasHdr)
	parts := c.planParts()
	idx := -1
	for i, p := range parts {
		if p.ID == c.part {
			idx = i
			break
		}
	}
	if idx < 0 || idx >= len(areas) {
		return failCheck(decl.ID, fmt.Sprintf("no dump area %d for part %s in %s (found %d area(s))",
			idx+1, c.part, decl.Path, len(areas)))
	}
	body := strings.TrimSpace(areas[idx])
	if body == "" {
		return failCheck(decl.ID, fmt.Sprintf(
			"no own-words submission in area %d/%d for part %s (waiting for learner input)",
			idx+1, len(parts), c.part))
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"own-words area %d/%d for part %s has a learner submission (content not graded)",
		idx+1, len(parts), c.part))
}

func evalExplanationContent(c *evalCtx, decl rules.CheckDecl) Check {
	rel, err := c.partFile()
	if err != nil {
		return failCheck(decl.ID, err.Error())
	}
	data, err := os.ReadFile(absPath(c.ws, rel))
	if err != nil {
		return failCheck(decl.ID, "missing artifact: "+rel)
	}
	text := string(data)
	fm := parseFrontmatter(text)
	if fm["tipo"] != "explicacion" {
		return failCheck(decl.ID, fmt.Sprintf("%s frontmatter tipo = %q, want explicacion", rel, fm["tipo"]))
	}
	p := planPartByID(*c.plan, c.part)
	if p == nil {
		return failCheck(decl.ID, fmt.Sprintf("part %q is not declared in the plan", c.part))
	}
	if fm["nodo"] != p.Subtema {
		return failCheck(decl.ID, fmt.Sprintf("%s frontmatter nodo = %q, want subtema join key %q", rel, fm["nodo"], p.Subtema))
	}
	if err := validateNivel(fm["nivel"], c.r.Thresholds); err != nil {
		return failCheck(decl.ID, fmt.Sprintf("%s frontmatter: %v", rel, err))
	}
	if !strings.Contains(text, "**Fuente**") {
		return failCheck(decl.ID, rel+" misses the mandatory **Fuente** traceability line")
	}
	if !hasHeading(text) {
		return failCheck(decl.ID, rel+" has no markdown heading")
	}
	lower := strings.ToLower(text)
	if p.ExamplesPlanned != nil && *p.ExamplesPlanned && !strings.Contains(lower, "ejemplo") && !strings.Contains(lower, "example") {
		return failCheck(decl.ID, fmt.Sprintf("part %s planned an example but %s contains none", c.part, rel))
	}
	th := c.r.Thresholds
	if p.VisualsPlanned != nil && *p.VisualsPlanned && !hasVisual(text, th.VisualBlocks, th.VisualElements) {
		return failCheck(decl.ID, fmt.Sprintf(
			"part %s planned a visual but %s has no embed (![...]), no nonempty visual block (%s) and no inline visual element (%s)",
			c.part, rel, strings.Join(th.VisualBlocks, ", "), strings.Join(th.VisualElements, ", ")))
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"%s: frontmatter joined to %s, Fuente traceability, heading, example %s, visual %s", rel, p.Subtema,
		obligationLabel(p.ExamplesPlanned, "verified", "not planned"),
		obligationLabel(p.VisualsPlanned, "verified", "not planned")))
}

// hasVisual reports an embed, a nonempty fenced block whose language is a
// declared visual format, or a declared inline element outside code blocks.
// It proves a visual is present, not that it helps: that is the visual-value
// rubric's judgment.
func hasVisual(text string, blocks, elements []string) bool {
	if strings.Contains(text, "![") {
		return true
	}
	open, visual, body := false, false, 0
	var prose strings.Builder
	for line := range strings.SplitSeq(text, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "```") {
			if !open {
				prose.WriteString(line)
				prose.WriteByte('\n')
			} else if visual && trimmed != "" {
				body++
			}
			continue
		}
		if open { // closing fence
			if visual && body > 0 {
				return true
			}
			open, visual = false, false
			continue
		}
		open, body = true, 0
		if fields := strings.Fields(strings.TrimPrefix(trimmed, "```")); len(fields) > 0 {
			visual = slices.Contains(blocks, strings.ToLower(fields[0]))
		}
	}
	return hasInlineElement(prose.String(), elements)
}

// hasInlineElement reports a closed element from elements, such as
// <svg ...><circle/></svg>, that contains at least one child element.
func hasInlineElement(text string, elements []string) bool {
	lower := strings.ToLower(text)
	for _, el := range elements {
		rest := lower
		for {
			i := strings.Index(rest, "<"+el)
			if i < 0 {
				break
			}
			rest = rest[i+1+len(el):]
			if rest == "" || !strings.ContainsRune("> \t\n", rune(rest[0])) {
				continue
			}
			gt := strings.IndexByte(rest, '>')
			end := strings.Index(rest, "</"+el+">")
			if gt < 0 || end < gt {
				break
			}
			if strings.Contains(rest[gt+1:end], "<") {
				return true
			}
			rest = rest[end:]
		}
	}
	return false
}

// evalChangedAfterFailedQuiz enforces re-teaching: after a failed attempt the
// explanation must genuinely change; byte-identical replays are rejected (B4).
func evalChangedAfterFailedQuiz(c *evalCtx, decl rules.CheckDecl) Check {
	ps := c.st.Parts[c.part]
	if ps == nil || ps.FailedExplanationHash == "" {
		return skipCheck(decl.ID, "no failed attempt yet for part "+c.part)
	}
	rel, err := c.partFile()
	if err != nil {
		return failCheck(decl.ID, err.Error())
	}
	current, err := hashFile(absPath(c.ws, rel))
	if err != nil {
		return failCheck(decl.ID, "missing artifact: "+rel)
	}
	if current == ps.FailedExplanationHash {
		return failCheck(decl.ID, fmt.Sprintf(
			"%s is byte-identical to the failed attempt: re-teaching must actually change the explanation", rel))
	}
	return passCheck(decl.ID, rel+" changed after the failed attempt (re-teaching revision present)")
}

func evalPartHasMiniQuiz(c *evalCtx) Check {
	rel, err := c.partFile()
	if err != nil {
		return failCheck("part-mini-quiz-section", err.Error())
	}
	data, err := os.ReadFile(absPath(c.ws, rel))
	if err != nil {
		return failCheck("part-mini-quiz-section", "missing artifact: "+rel)
	}
	for _, line := range strings.Split(string(data), "\n") {
		if headingLevel(line) > 0 && strings.Contains(strings.ToLower(line), "mini-quiz") {
			return passCheck("part-mini-quiz-section", rel+" carries its mini-quiz section")
		}
	}
	return failCheck("part-mini-quiz-section", rel+" has no mini-quiz section heading")
}

func evalMiniQuizQuestions(c *evalCtx, decl rules.CheckDecl) Check {
	rel := substPart(decl.Path, c.part)
	qs, err := loadQuizQuestions(c.ws, rel)
	if err != nil {
		return failCheck(decl.ID, err.Error())
	}
	p := planPartByID(*c.plan, c.part)
	if p == nil {
		return failCheck(decl.ID, "part not in plan")
	}
	if err := validateQuizQuestions(qs, p.Subtema, c.r.Thresholds); err != nil {
		return failCheck(decl.ID, "mini-quiz questions invalid: "+err.Error())
	}
	partFile, err := c.partFile()
	if err != nil {
		return failCheck(decl.ID, err.Error())
	}
	note, err := os.ReadFile(absPath(c.ws, partFile))
	if err != nil {
		return failCheck(decl.ID, "missing artifact: "+partFile)
	}
	for _, q := range qs {
		if !containsNorm(string(note), q.Enunciado) {
			return failCheck(decl.ID, fmt.Sprintf("mini-quiz question %s enunciado is not present in %s", q.ID, partFile))
		}
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"%d mini-quiz questions with enunciado bound to %s, subtema %q inherited",
		len(qs), partFile, p.Subtema))
}

func evalMiniQuizAnswers(c *evalCtx, decl rules.CheckDecl) Check {
	qRel := substPart(decl.Questions, c.part)
	aRel := substPart(decl.Answers, c.part)
	qs, err := loadQuizQuestions(c.ws, qRel)
	if err != nil {
		return skipCheck(decl.ID, "questions invalid; answers cannot be checked: "+err.Error())
	}
	p := planPartByID(*c.plan, c.part)
	if p == nil {
		return failCheck(decl.ID, "part not in plan")
	}
	if err := validateQuizQuestions(qs, p.Subtema, c.r.Thresholds); err != nil {
		return skipCheck(decl.ID, "questions invalid; answers cannot be checked: "+err.Error())
	}
	if answerFileMissing(c.ws, aRel) {
		return failCheck(decl.ID, fmt.Sprintf(
			"learner answers not yet recorded in %s (waiting for learner input)", aRel))
	}
	answers, err := loadAnswers(c.ws, aRel)
	if err != nil {
		return failCheck(decl.ID, "answers invalid: "+err.Error())
	}
	var ids []string
	for _, q := range qs {
		ids = append(ids, q.ID)
	}
	if err := checkCoverage(ids, answers, c.r.Thresholds.Options); err != nil {
		return failCheck(decl.ID, "answers invalid: "+err.Error())
	}
	score := scoreQuiz(qs, answers)
	passed := score.Correct >= c.r.Thresholds.Quiz.MinPassingScore && len(score.CentralMisses) == 0
	central := "none"
	if len(score.CentralMisses) > 0 {
		central = strings.Join(score.CentralMisses, ",")
	}
	c.evidence["quizScore"] = score.Correct
	c.evidence["quizTotal"] = len(qs)
	c.evidence["quizCentralMisses"] = score.CentralMisses
	c.evidence["quizWrongIds"] = score.WrongIDs
	c.evidence["quizPassed"] = passed
	return passCheck(decl.ID, fmt.Sprintf(
		"%d/%d answers recorded; derived score %d/%d (pass threshold %d, central misses: %s)",
		len(qs), len(qs), score.Correct, len(qs), c.r.Thresholds.Quiz.MinPassingScore, central))
}

func evalFeedback(c *evalCtx, decl rules.CheckDecl) Check {
	rel := substPart(decl.Path, c.part)
	fb, err := loadFeedback(c.ws, rel)
	if err != nil {
		return failCheck(decl.ID, err.Error())
	}
	if fb.PartID != c.part {
		return failCheck(decl.ID, fmt.Sprintf("feedback targets part %q, expected %q", fb.PartID, c.part))
	}
	if fb.DifficultyDetected == nil {
		return failCheck(decl.ID, "feedback misses difficultyDetected")
	}
	if strings.TrimSpace(fb.Notes) == "" {
		return failCheck(decl.ID, "feedback notes are empty: results must be recorded")
	}
	return passCheck(decl.ID, fmt.Sprintf("feedback recorded for %s (difficultyDetected=%v)",
		c.part, *fb.DifficultyDetected))
}

// evalFeedbackEvidence blocks a declared difficultyDetected=false that is
// contradicted by recorded wrong answers: the obligation derives from
// evidence, never from the producer's boolean alone (B5).
func evalFeedbackEvidence(c *evalCtx, decl rules.CheckDecl) Check {
	rel := substPart(decl.Path, c.part)
	fb, err := loadFeedback(c.ws, rel)
	if err != nil {
		return failCheck(decl.ID, err.Error())
	}
	wrongs := partWrongAnswers(c.st, c.part)
	declared := fb.DifficultyDetected != nil && *fb.DifficultyDetected
	if !declared && len(wrongs) > 0 {
		return failCheck(decl.ID, fmt.Sprintf(
			"observed difficultyDetected=false contradicts recorded wrong answers: %s",
			strings.Join(wrongs, ",")))
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"observed difficultyDetected=%v with %d recorded wrong answer(s) (%s)",
		declared, len(wrongs), strings.Join(wrongs, ",")))
}

// evalFeedbackCondition verifies the conditional obligation at its stage.
func evalFeedbackCondition(c *evalCtx) Check {
	for i := range c.r.Conditions {
		cond := &c.r.Conditions[i]
		if verifyStageFor(c.r, cond) != c.stage {
			continue
		}
		triggered, sources, violated, detail := evaluateCondition(c.r, c.st, c.ws, cond, c.part)
		switch {
		case !triggered:
			return skipCheck("feedback-condition", detail)
		case violated:
			return failCheck("feedback-condition", detail)
		default:
			return passCheck("feedback-condition", fmt.Sprintf(
				"condition %s triggered by %s; %s", cond.ID, strings.Join(sources, "; "), detail))
		}
	}
	return skipCheck("feedback-condition", "no conditional rule declared")
}

func evalExercisesNote(c *evalCtx, decl rules.CheckDecl) Check {
	raw, err := os.ReadFile(absPath(c.ws, decl.Path))
	if err != nil {
		return failCheck(decl.ID, "missing artifact: "+decl.Path)
	}
	text := string(raw)
	fm := parseFrontmatter(text)
	if fm["tipo"] != "ejercicios" {
		return failCheck(decl.ID, fmt.Sprintf("%s frontmatter tipo = %q, want ejercicios", decl.Path, fm["tipo"]))
	}
	body := stripFrontmatter(text)
	if strings.TrimSpace(body) == "" {
		return failCheck(decl.ID, decl.Path+" has no exercise content")
	}
	if countLines(body, func(l string) bool { return headingLevel(l) > 0 }) < 1 {
		return failCheck(decl.ID, decl.Path+" declares no exercise sections")
	}
	return passCheck(decl.ID, decl.Path+" carries nonempty exercise sections after the topic loop")
}

// evalFinalQuizNote binds the closing quiz: every planned node covered,
// enunciados in the actual note, recorded answers and the derived score in
// the note frontmatter (B1). Choice items are scored by key; open items are
// required free text and are never graded by string match.
func evalFinalQuizNote(c *evalCtx, decl rules.CheckDecl) Check {
	mdBytes, err := os.ReadFile(absPath(c.ws, decl.Path))
	if err != nil {
		return failCheck(decl.ID, "missing artifact: "+decl.Path)
	}
	md := string(mdBytes)
	fm := parseFrontmatter(md)
	if fm["tipo"] != "cuestionario-final" {
		return failCheck(decl.ID, fmt.Sprintf("%s frontmatter tipo = %q, want cuestionario-final", decl.Path, fm["tipo"]))
	}
	qs, err := loadFinalQuestions(c.ws, decl.Questions)
	if err != nil {
		return failCheck(decl.ID, err.Error())
	}
	if len(qs) == 0 {
		return failCheck(decl.ID, decl.Questions+" declares no questions")
	}
	planBytes, err := os.ReadFile(absPath(c.ws, decl.Note))
	if err != nil {
		return failCheck(decl.ID, "planificador note unavailable: "+decl.Note)
	}
	if _, ok := findSection(string(planBytes), "ruta"); !ok {
		return failCheck(decl.ID, "route section missing from "+decl.Note)
	}
	planSubs := map[string]bool{}
	if c.planErr == nil {
		planSubs = planSubtemas(*c.plan)
	}
	seen := map[string]bool{}
	covered := map[string]bool{}
	var choiceIDs, openIDs []string
	for _, q := range qs {
		if q.ID == "" || seen[q.ID] {
			return failCheck(decl.ID, fmt.Sprintf("question ids must be present and unique (got %q)", q.ID))
		}
		seen[q.ID] = true
		if strings.TrimSpace(q.Enunciado) == "" {
			return failCheck(decl.ID, fmt.Sprintf("question %s has an empty enunciado", q.ID))
		}
		if !planSubs[q.Subtema] {
			return failCheck(decl.ID, fmt.Sprintf("question %s references subtema %q outside the plan", q.ID, q.Subtema))
		}
		if err := validateNivel(q.Nivel, c.r.Thresholds); err != nil {
			return failCheck(decl.ID, fmt.Sprintf("question %s: %v", q.ID, err))
		}
		if strings.TrimSpace(q.Formato) == "" {
			return failCheck(decl.ID, fmt.Sprintf("question %s misses its formato", q.ID))
		}
		if isMCQFormat(q.Formato) {
			choiceIDs = append(choiceIDs, q.ID)
		} else {
			openIDs = append(openIDs, q.ID)
		}
		covered[q.Subtema] = true
		if !containsNorm(md, q.Enunciado) {
			return failCheck(decl.ID, fmt.Sprintf("question %s enunciado is not present in %s", q.ID, decl.Path))
		}
	}
	for _, p := range c.planParts() {
		if !covered[p.Subtema] {
			return failCheck(decl.ID, fmt.Sprintf("planned node %s has no final-quiz question: coverage must be total", p.Subtema))
		}
	}
	if len(choiceIDs) == 0 || len(openIDs) == 0 {
		return failCheck(decl.ID, "cuestionario-final needs both choice and open questions; the contract requires mixed formats")
	}
	if answerFileMissing(c.ws, decl.Answers) {
		return failCheck(decl.ID, fmt.Sprintf(
			"learner answers not yet recorded in %s (waiting for learner input)", decl.Answers))
	}
	answers, err := loadAnswers(c.ws, decl.Answers)
	if err != nil {
		return failCheck(decl.ID, "answers invalid: "+err.Error())
	}
	if err := checkCoverage(choiceIDs, choiceAnswers(answers, choiceIDs), c.r.Thresholds.Options); err != nil {
		return failCheck(decl.ID, "answers invalid: "+err.Error())
	}
	for id := range answers {
		if !seen[id] {
			return failCheck(decl.ID, "answers invalid: unknown question id "+id)
		}
	}
	for _, id := range openIDs {
		if strings.TrimSpace(answers[id]) == "" {
			return failCheck(decl.ID, fmt.Sprintf(
				"open answer %s is empty in %s (waiting for learner input)", id, decl.Answers))
		}
	}
	byID := map[string]finalQuestion{}
	for _, q := range qs {
		byID[q.ID] = q
	}
	correct := 0
	for _, id := range choiceIDs {
		if strings.EqualFold(norm(answers[id]), norm(byID[id].Respuesta)) {
			correct++
		}
	}
	wantPuntaje := fmt.Sprintf("%d/%d", correct, len(choiceIDs))
	if fm["estado"] != "completado" {
		return failCheck(decl.ID, fmt.Sprintf("%s frontmatter estado = %q, want completado", decl.Path, fm["estado"]))
	}
	if fm["puntaje"] != wantPuntaje {
		return failCheck(decl.ID, fmt.Sprintf("%s frontmatter puntaje = %q, derived score is %q",
			decl.Path, fm["puntaje"], wantPuntaje))
	}
	c.evidence["finalQuizScore"] = wantPuntaje
	c.evidence["finalOpenAnswers"] = len(openIDs)
	return passCheck(decl.ID, fmt.Sprintf(
		"%d question(s) cover all %d planned node(s), enunciados bound to %s; choice score %s bound to frontmatter; %d open answer(s) recorded, not auto-graded",
		len(qs), len(c.planParts()), decl.Path, wantPuntaje, len(openIDs)))
}

// evalMermaidGraph requires a real dependency graph: a graph/flowchart header
// and at least one edge. It checks structure, not whether the map is right.
func evalMermaidGraph(c *evalCtx, decl rules.CheckDecl) Check {
	raw, err := os.ReadFile(absPath(c.ws, decl.Path))
	if err != nil {
		return failCheck(decl.ID, "missing artifact: "+decl.Path)
	}
	header, edges := "", 0
	for line := range strings.SplitSeq(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "%%") {
			continue
		}
		if header == "" {
			header = line
			continue
		}
		for _, arrow := range []string{"-->", "---", "-.->", "==>"} {
			if strings.Contains(line, arrow) {
				edges++
				break
			}
		}
	}
	kind := strings.Fields(header + " ")[0]
	if kind != "graph" && kind != "flowchart" {
		return failCheck(decl.ID, fmt.Sprintf("%s is not a mermaid graph: first line %q must start with graph or flowchart", decl.Path, header))
	}
	if edges == 0 {
		return failCheck(decl.ID, decl.Path+" declares a graph header but no dependency edge")
	}
	return passCheck(decl.ID, fmt.Sprintf("%s is a mermaid graph with %d dependency edge(s)", decl.Path, edges))
}

// choiceAnswers keeps the answers of choice items; open items are free text.
func choiceAnswers(answers map[string]string, choiceIDs []string) map[string]string {
	out := map[string]string{}
	for _, id := range choiceIDs {
		if ans, ok := answers[id]; ok {
			out[id] = ans
		}
	}
	return out
}

var mcqFormats = map[string]bool{
	"mcq": true, "multiple choice": true, "multiple-choice": true,
	"opción múltiple": true, "opcion multiple": true,
}

func isMCQFormat(formato string) bool { return mcqFormats[strings.ToLower(strings.TrimSpace(formato))] }

func stripFrontmatter(text string) string {
	lines := strings.Split(text, "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return text
	}
	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "---" {
			return strings.Join(lines[i+1:], "\n")
		}
	}
	return text
}

func hasHeading(text string) bool {
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "#") {
			return true
		}
	}
	return false
}

func obligationLabel(planned *bool, yes, no string) string {
	if planned != nil && *planned {
		return yes
	}
	return no
}

// evalAllCurrent is the final gate: every stage recorded for every part and
// every conditional obligation current. Missing evidence fails closed.
func evalAllCurrent(r *rules.Rules, st *State, ws string) Check {
	var missing []string
	for _, stage := range r.StageOrder {
		if stage == "final" || r.IsPartStage(stage) {
			continue
		}
		if _, ok := st.Global[stage]; !ok {
			missing = append(missing, stage)
		}
	}
	if len(st.PartOrder) == 0 {
		missing = append(missing, "no parts enrolled")
	}
	for _, part := range st.PartOrder {
		ps := st.Parts[part]
		for _, stage := range r.PartStages {
			if ps == nil {
				missing = append(missing, stageLabel(stage, part))
				continue
			}
			if _, ok := ps.Stages[stage]; !ok {
				missing = append(missing, stageLabel(stage, part))
			}
		}
	}
	if len(missing) > 0 {
		return failCheck("all-stages-current", "missing recorded stage(s): "+strings.Join(missing, ","))
	}
	var violations []string
	for i := range r.Conditions {
		cond := &r.Conditions[i]
		parts := st.PartOrder
		if !r.IsPartStage(cond.OnStage) {
			parts = []string{""}
		}
		for _, part := range parts {
			triggered, _, violated, detail := evaluateCondition(r, st, ws, cond, part)
			if triggered && violated {
				violations = append(violations, stageLabel(cond.ID, part)+": "+detail)
			}
		}
	}
	if len(violations) > 0 {
		return failCheck("all-stages-current", "conditional obligations not current: "+strings.Join(violations, "; "))
	}
	return passCheck("all-stages-current", fmt.Sprintf(
		"all %d stages recorded for %d part(s); conditional obligations current", len(r.StageOrder), len(st.PartOrder)))
}

// partWrongAnswers unions the wrongly answered mini-quiz ids across every
// recorded attempt of a part (objective difficulty evidence).
func partWrongAnswers(st *State, part string) []string {
	ps := st.Parts[part]
	if ps == nil {
		return nil
	}
	var out []string
	seen := map[string]bool{}
	for _, attempt := range ps.QuizAttempts {
		for _, id := range attempt.WrongIDs {
			if !seen[id] {
				seen[id] = true
				out = append(out, id)
			}
		}
	}
	return out
}

// evaluateCondition derives the trigger from evidence (declared field,
// recorded wrong answers, semantic central-gap assessment) and verifies the
// required artifacts changed AFTER the trigger snapshot. Reasons always
// report observed values (B5/B6).
func condSnapshotKey(conditionID, path string) string {
	return "conditionSnapshot:" + conditionID + ":" + path
}

func evaluateCondition(r *rules.Rules, st *State, ws string, cond *rules.Condition, part string) (triggered bool, sources []string, violated bool, detail string) {
	var observations []string
	trigger := cond.Field == "" // fieldless conditions always apply at their stage
	if cond.Field == "difficultyDetected" {
		fbPath := substPart(declPathByKind(r, "feedback", "feedback_valid"), part)
		fb, err := loadFeedback(ws, fbPath)
		if err != nil {
			return true, []string{"feedback unreadable"}, true,
				"feedback unavailable for condition " + cond.ID + ": " + err.Error()
		}
		declared := fb.DifficultyDetected != nil && *fb.DifficultyDetected
		observations = append(observations, fmt.Sprintf("difficultyDetected=%v", declared))
		if declared == cond.Equals {
			trigger = true
			sources = append(sources, fmt.Sprintf("declared difficultyDetected=%v", declared))
		}
		wrongs := partWrongAnswers(st, part)
		observations = append(observations, fmt.Sprintf("wrong answers: %d", len(wrongs)))
		if len(wrongs) > 0 {
			trigger = true
			sources = append(sources, "recorded wrong answers ["+strings.Join(wrongs, ",")+"]")
		}
		gap, gapKnown := assessmentGap(r, st, cond.OnStage, part)
		observations = append(observations, "central-gap assessment: "+assessmentLabel(gap, gapKnown))
		if !gapKnown {
			trigger = true
			sources = append(sources, "central-gap assessment missing (treated as triggered)")
		} else if gap {
			trigger = true
			sources = append(sources, "central-gap assessment: gap present")
		}
	} else {
		sources = append(sources, "always required after "+cond.OnStage)
	}
	if !trigger {
		return false, nil, false, fmt.Sprintf("condition %s not triggered (observed %s)",
			cond.ID, strings.Join(observations, ", "))
	}
	triggered = true

	onStageRec, ok := recordFor(r, st, cond.OnStage, part)
	if !ok {
		return true, sources, true, "no snapshot recorded at " + cond.OnStage + " for condition " + cond.ID
	}
	var changed []string
	for _, path := range cond.Require.Paths {
		snap, _ := onStageRec.Evidence[condSnapshotKey(cond.ID, path)].(string)
		if snap == "" {
			return true, sources, true, "no snapshot recorded for " + path + " at " + cond.OnStage
		}
		current, err := hashFile(absPath(ws, path))
		if err != nil {
			return true, sources, true, "conditional artifact unavailable: " + path
		}
		if current == snap {
			violated = true
			detail = fmt.Sprintf("%s not updated after %s: unchanged since the trigger snapshot (condition %s)",
				path, cond.OnStage, cond.ID)
			return true, sources, true, detail
		}
		changed = append(changed, path)
	}
	return true, sources, false, strings.Join(changed, ", ") + " changed after the " + cond.OnStage + " snapshot"
}

func assessmentLabel(gap, known bool) string {
	if !known {
		return "missing"
	}
	if gap {
		return "gap present"
	}
	return "gap absent"
}

// assessmentGap reads the recorded semantic central-gap verdict for a part.
func assessmentGap(r *rules.Rules, st *State, stage, part string) (gap, known bool) {
	for _, rub := range r.RubricsFor(stage) {
		if !rub.IsGate() {
			rec := findSemantic(st, rub.ID, stage, part)
			if rec == nil {
				return false, false
			}
			return rec.Verdict == "PASS", true
		}
	}
	return false, true // no assessment declared: objective evidence rules
}

func recordFor(r *rules.Rules, st *State, stage, part string) (StageRecord, bool) {
	if r.IsPartStage(stage) {
		ps := st.Parts[part]
		if ps == nil {
			return StageRecord{}, false
		}
		rec, ok := ps.Stages[stage]
		return rec, ok
	}
	rec, ok := st.Global[stage]
	return rec, ok
}
