package engine

import (
	"os"
	"path/filepath"
	"strings"

	"learning/internal/rules"
)

// richPageFindings measures the page the turn wrote beside the part's note with the same thresholds (#265). The
// page must measure as its note, carry every figure the note draws, and carry the interactive quiz. Its findings
// name the page, so the tutor corrects the file that is wrong.
func richPageFindings(c *evalCtx, rel, note string, th rules.PartStandardThresholds) []string {
	if !th.RichPage {
		return nil
	}
	pagePath := absPath(c.ws, strings.TrimSuffix(rel, ".md")+".html")
	raw, err := os.ReadFile(pagePath)
	if err != nil {
		return nil
	}
	page := string(raw)
	text := notaDeHTML(page)
	var out []string
	out = append(out, standardFindings(text, th)...)
	if th.Register != nil {
		sencillez, tecnicidad := learnerLevels(absPath(c.ws, rel))
		out = append(out, registerFindings(text, th.Register.Limits(sencillez, tecnicidad))...)
	}
	out = append(out, glosarioFindings(text, th)...)
	out = append(out, quizFindings(text, th, true)...)
	out = append(out, figureFindings(note, page, th)...)
	name := filepath.Base(pagePath)
	for i := range out {
		out[i] = name + ": " + out[i]
	}
	return out
}
