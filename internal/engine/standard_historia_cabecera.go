package engine

import (
	"encoding/json"
	"fmt"

	"learning/internal/rules"
)

// storyHeaderFindings measures the story-header rule (#243): a part that teaches
// code or a formula carries that line in the header of its story, one highlighted
// token per step. An empty header is a finding, and the fix names the keys that
// fill it. A rules snapshot that does not declare `storyHeader` keeps accepting
// the parts it accepted.
func storyHeaderFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.StoryHeader || !showsCode(text) {
		return nil
	}
	for _, doc := range storyQualityDocs(text) {
		if len(doc.Steps) == 0 {
			continue
		}
		empty := 0
		for _, step := range doc.Steps {
			var atoms []json.RawMessage
			if doc.Kind == "derivation" {
				if step.Equation != nil {
					atoms = step.Equation.Atoms
				}
			} else if doc.Formula != nil {
				atoms = doc.Formula.Atoms
			}
			if len(atoms) == 0 {
				empty++
			}
		}
		if empty > 0 {
			return []string{fmt.Sprintf(
				"the story header is empty in %d of %d step(s) — la historia no lleva en su cabecera la línea de código que la parte enseña: ponla con `equation.atoms` en cada paso (o `formula.atoms` para el recorrido entero) y resalta el token del paso en `focus`",
				empty, len(doc.Steps))}
		}
	}
	return nil
}
