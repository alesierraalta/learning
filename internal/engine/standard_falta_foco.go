package engine

import (
	"fmt"
	"strings"

	"learning/internal/rules"
)

// faltaFocoFindings is the ring rule (#305): a walkthrough or a story of three drawn steps names one piece with
// a `ring` on at least one step. A `focus` is the formula's symbol list in a story and never a ring; a story of
// pieces draws no drawn step, so it asks for no ring. A rules snapshot that does not declare `storyFocus` keeps
// accepting the parts it accepted.
func faltaFocoFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.StoryFocus || usesStepFigures(text) {
		return nil
	}
	var missing []string
	for _, block := range cueBlocks(text) {
		drawn, ringed := 0, false
		for _, raw := range block.steps {
			step := cueStep(raw)
			if drawsScene(block.tag, step) {
				drawn++
			}
			if nonEmptyString(step["ring"]) {
				ringed = true
			}
		}
		if drawn >= 3 && !ringed {
			missing = append(missing, block.label())
		}
	}
	if len(missing) == 0 {
		return nil
	}
	return []string{fmt.Sprintf("%d recorrido(s) de tres o más pasos gráficos sin foco (%s) · da a un paso ring: \"<id de una pieza de ese paso>\" para resaltar lo que explica",
		len(missing), strings.Join(missing, ", "))}
}
