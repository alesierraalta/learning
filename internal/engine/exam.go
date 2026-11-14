package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"unicode/utf8"

	"learning/internal/rules"
)

// evalExamPlan binds the proposed plan and every part's purpose to the exam
// format recorded at init. It runs before preparation and again after planning.
func evalExamPlan(c *evalCtx, decl rules.CheckDecl) Check {
	if c.st == nil || c.st.Exam == nil {
		return skipCheck(decl.ID, "run has no declared exam format")
	}
	if stateScope(c.st) != scopePareto {
		return failCheck(decl.ID, "exam runs require pareto scope")
	}
	thresholds := c.r.Thresholds.Exam
	if thresholds == nil {
		return failCheck(decl.ID, "rules declare exam checks without the exam thresholds")
	}
	if !containsStr(thresholds.Formats, c.st.Exam.Format) {
		return failCheck(decl.ID, fmt.Sprintf("exam format %q is not enabled by the rules", c.st.Exam.Format))
	}
	if c.planErr != nil {
		return failCheck(decl.ID, c.planErr.Error())
	}
	if c.plan.Exam == nil {
		return failCheck(decl.ID, "plan.json needs an examen object for this run")
	}
	if c.plan.Exam.Formato != c.st.Exam.Format {
		return failCheck(decl.ID, fmt.Sprintf("plan examen formato = %q, want %q", c.plan.Exam.Formato, c.st.Exam.Format))
	}
	if c.st.Exam.Practice == "" {
		if c.plan.Exam.Practica != nil {
			return failCheck(decl.ID, "plan examen practica must be omitted for this format")
		}
	} else {
		if c.plan.Exam.Practica == nil || strings.TrimSpace(*c.plan.Exam.Practica) == "" {
			return failCheck(decl.ID, fmt.Sprintf("plan examen practica is missing, want %q", c.st.Exam.Practice))
		}
		if got := strings.TrimSpace(*c.plan.Exam.Practica); got != c.st.Exam.Practice {
			return failCheck(decl.ID, fmt.Sprintf("plan examen practica = %q, want %q", got, c.st.Exam.Practice))
		}
	}
	for _, part := range c.plan.Parts {
		chars := utf8.RuneCountInString(strings.TrimSpace(part.Exam))
		if chars < thresholds.MinPartChars {
			return failCheck(decl.ID, fmt.Sprintf("plan part %s examen needs at least %d characters (got %d)",
				part.ID, thresholds.MinPartChars, chars))
		}
	}
	return passCheck(decl.ID, fmt.Sprintf("plan matches the %s exam and every part states its contribution", c.st.Exam.Format))
}

func evalExamPractice(c *evalCtx, decl rules.CheckDecl) Check {
	minimum, unavailable, done := examPracticeRequirement(c, decl)
	if done {
		return unavailable
	}
	if c.part == "" {
		return failCheck(decl.ID, "exam-practice requires a part context")
	}
	if c.planErr != nil {
		return failCheck(decl.ID, fmt.Sprintf("part %s: cannot resolve %s: %v", c.part, substPart(decl.Path, c.part), c.planErr))
	}
	rel, err := partRel(c.plan, decl.Path, c.part)
	if err != nil {
		return failCheck(decl.ID, fmt.Sprintf("part %s: cannot resolve %s: %v", c.part, substPart(decl.Path, c.part), err))
	}

	manualCount, manualMissing, reason := readPracticalExercises(c.ws, c.part, rel)
	if reason != "" {
		return failCheck(decl.ID, reason)
	}
	codeCount, codePaths, invalidCodePaths, reason := readCodePracticeExercises(c.ws, c.part)
	if reason != "" {
		return failCheck(decl.ID, reason)
	}
	total := manualCount + codeCount
	if total < minimum {
		return failCheck(decl.ID, examPracticeShortage(
			c.part, rel, manualCount, manualMissing, codeCount, codePaths, invalidCodePaths, minimum))
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"part %s has %d practical exercises; %s: %d, matching code exercises: %s (minimum %d)",
		c.part, total, rel, manualCount, strings.Join(codePaths, ", "), minimum))
}

func examPracticeRequirement(c *evalCtx, decl rules.CheckDecl) (int, Check, bool) {
	if c.st == nil || c.st.Exam == nil {
		return 0, skipCheck(decl.ID, "run has no declared exam format"), true
	}
	if c.st.Exam.Format == "oral" || c.st.Exam.Format == "written" {
		return 0, skipCheck(decl.ID, fmt.Sprintf(
			"exam format %q does not require practical part exercises", c.st.Exam.Format)), true
	}
	if stateScope(c.st) != scopePareto {
		return 0, failCheck(decl.ID, "exam runs require pareto scope"), true
	}
	thresholds := c.r.Thresholds.Exam
	if thresholds == nil {
		return 0, failCheck(decl.ID, "rules declare exam-practice without the exam thresholds"), true
	}
	if !containsStr(thresholds.Formats, c.st.Exam.Format) {
		return 0, failCheck(decl.ID, fmt.Sprintf("exam format %q is not enabled by the rules", c.st.Exam.Format)), true
	}
	if c.st.Exam.Format != "practical" {
		return 0, failCheck(decl.ID, fmt.Sprintf("exam format %q is not supported by exam-practice", c.st.Exam.Format)), true
	}
	if thresholds.MinPracticePerPart < 1 {
		return 0, failCheck(decl.ID, "rules declare exam-practice without a positive minPracticePerPart threshold"), true
	}
	return thresholds.MinPracticePerPart, Check{}, false
}

func readPracticalExercises(ws, part, rel string) (int, bool, string) {
	raw, err := os.ReadFile(absPath(ws, rel))
	if err != nil {
		if os.IsNotExist(err) {
			return 0, true, ""
		}
		return 0, false, fmt.Sprintf("part %s: cannot read %s: %v", part, rel, err)
	}
	var doc struct {
		Exercises []struct {
			ID         string `json:"id"`
			Enunciado  string `json:"enunciado"`
			Entregable string `json:"entregable"`
			Solucion   string `json:"solucion"`
		} `json:"exercises"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return 0, false, fmt.Sprintf("part %s: %s is not valid JSON; repair the exercise JSON", part, rel)
	}
	seen := map[string]bool{}
	for i, exercise := range doc.Exercises {
		if !safeID(exercise.ID) {
			return 0, false, fmt.Sprintf("part %s: %s exercise %d id %q is not a safe ID", part, rel, i+1, exercise.ID)
		}
		if seen[exercise.ID] {
			return 0, false, fmt.Sprintf("part %s: %s repeats exercise id %q", part, rel, exercise.ID)
		}
		seen[exercise.ID] = true
		for _, field := range []struct {
			name  string
			value string
		}{{"enunciado", exercise.Enunciado}, {"entregable", exercise.Entregable}, {"solucion", exercise.Solucion}} {
			if strings.TrimSpace(field.value) == "" {
				return 0, false, fmt.Sprintf("part %s: %s exercise %q has an empty %s", part, rel, exercise.ID, field.name)
			}
		}
	}
	return len(doc.Exercises), false, ""
}

func readCodePracticeExercises(ws, part string) (int, []string, []string, string) {
	entries, err := os.ReadDir(absPath(ws, "codigo"))
	if err != nil && !os.IsNotExist(err) {
		return 0, nil, nil, fmt.Sprintf("part %s: cannot inspect codigo/: %v", part, err)
	}
	var paths, invalidPaths []string
	for _, entry := range entries {
		if !entry.IsDir() || !safeID(entry.Name()) {
			continue
		}
		rel := "codigo/" + entry.Name() + "/ejercicio.json"
		raw, err := os.ReadFile(absPath(ws, rel))
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return 0, nil, nil, fmt.Sprintf("part %s: cannot read %s: %v", part, rel, err)
		}
		var exercise struct {
			Parte     string `json:"parte"`
			Enunciado string `json:"enunciado"`
		}
		if err := json.Unmarshal(raw, &exercise); err != nil {
			return 0, nil, nil, fmt.Sprintf("part %s: %s is not valid JSON; repair the exercise file", part, rel)
		}
		if exercise.Parte != part {
			continue
		}
		if strings.TrimSpace(exercise.Enunciado) == "" {
			invalidPaths = append(invalidPaths, rel)
			continue
		}
		paths = append(paths, rel)
	}
	return len(paths), paths, invalidPaths, ""
}

func examPracticeShortage(part, rel string, manualCount int, manualMissing bool, codeCount int, codePaths, invalidCodePaths []string, minimum int) string {
	if manualMissing && codeCount == 0 && len(invalidCodePaths) == 0 {
		return fmt.Sprintf(
			"part %s needs at least %d practical exercises: %s is missing and no matching codigo/<id>/ejercicio.json was found",
			part, minimum, rel)
	}
	manualNoun := "exercises"
	if manualCount == 1 {
		manualNoun = "exercise"
	}
	manualDetail := fmt.Sprintf("%d practical %s in %s", manualCount, manualNoun, rel)
	if manualMissing {
		manualDetail = "no file " + rel
	}
	codeDetail := fmt.Sprintf("%d matching codigo/<id>/ejercicio.json files", codeCount)
	if len(codePaths) > 0 {
		codeDetail = fmt.Sprintf("%d matching code exercises: %s", codeCount, strings.Join(codePaths, ", "))
	}
	if len(invalidCodePaths) > 0 {
		invalidDetail := strings.Join(invalidCodePaths, ", ") + " has an empty enunciado"
		if len(invalidCodePaths) > 1 {
			invalidDetail = strings.Join(invalidCodePaths, ", ") + " have an empty enunciado"
		}
		codeDetail += "; " + invalidDetail
	}
	return fmt.Sprintf("part %s has %s and %s; need at least %d", part, manualDetail, codeDetail, minimum)
}

// evalExamMock checks the declared final exam format without grading its
// subject-matter content; the existing final-quiz check owns coverage and score.
func evalExamMock(c *evalCtx, decl rules.CheckDecl) Check {
	if c.st == nil || c.st.Exam == nil {
		return skipCheck(decl.ID, "run has no declared exam format")
	}
	if stateScope(c.st) != scopePareto {
		return failCheck(decl.ID, "exam runs require pareto scope")
	}
	thresholds := c.r.Thresholds.Exam
	if thresholds == nil {
		return failCheck(decl.ID, "rules declare exam checks without the exam thresholds")
	}
	if !containsStr(thresholds.Formats, c.st.Exam.Format) {
		return failCheck(decl.ID, fmt.Sprintf("exam format %q is not enabled by the rules", c.st.Exam.Format))
	}
	var doc struct {
		Formato   string          `json:"formato"`
		Questions []finalQuestion `json:"questions"`
	}
	if err := readJSON(absPath(c.ws, decl.Path), &doc); err != nil {
		return failCheck(decl.ID, err.Error())
	}
	if doc.Formato != c.st.Exam.Format {
		return failCheck(decl.ID, fmt.Sprintf("%s formato = %q, want %q", decl.Path, doc.Formato, c.st.Exam.Format))
	}
	if len(doc.Questions) == 0 {
		return failCheck(decl.ID, decl.Path+" declares no questions")
	}
	switch c.st.Exam.Format {
	case "oral":
		choice, open := 0, 0
		for _, question := range doc.Questions {
			if isMCQFormat(question.Formato) {
				choice++
			} else {
				open++
			}
		}
		if open < choice {
			return failCheck(decl.ID, fmt.Sprintf(
				"oral exam needs at least as many open questions as choice questions (%d open, %d choice)", open, choice))
		}
	case "practical":
		for _, question := range doc.Questions {
			if question.Tipo == "practica" && strings.TrimSpace(question.Entregable) != "" {
				return passCheck(decl.ID, fmt.Sprintf("%s declares a practical exam with a non-empty deliverable", decl.Path))
			}
		}
		return failCheck(decl.ID, `practical exam needs at least one question with tipo "practica" and a non-empty entregable`)
	}
	return passCheck(decl.ID, fmt.Sprintf("%s matches the %s exam format", decl.Path, c.st.Exam.Format))
}
