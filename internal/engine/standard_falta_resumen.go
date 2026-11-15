package engine

import (
	"fmt"
	"strings"

	"learning/internal/rules"
)

// faltaResumenFindings is the closing-card rule (#305): a walkthrough or a story of three steps or more ends
// with a `summary` card. A walkthrough of two steps does not ask for one. A rules snapshot that does not declare
// `storySummary` keeps accepting the parts it accepted.
func faltaResumenFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.StorySummary {
		return nil
	}
	var missing []string
	for _, block := range cueBlocks(text) {
		if len(block.steps) >= 3 && !isObject(block.spec["summary"]) {
			missing = append(missing, block.label())
		}
	}
	if len(missing) == 0 {
		return nil
	}
	return []string{fmt.Sprintf("%d recorrido(s) de tres o más pasos sin resumen (%s) · cierra cada uno con un summary {title, text?, metrics: [[clave, valor], ...]} después del último paso",
		len(missing), strings.Join(missing, ", "))}
}
