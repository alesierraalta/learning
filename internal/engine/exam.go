package engine

import (
	"fmt"
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
