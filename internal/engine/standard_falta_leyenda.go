package engine

import (
	"encoding/json"
	"fmt"
	"strings"

	"learning/internal/rules"
)

// faltaLeyendaFindings is the formula-legend rule (#305): a formula or derivation story names its symbols in
// `facts` on at least one step. The rule has no step count. A rules snapshot that does not declare
// `formulaLegend` keeps accepting the parts it accepted.
func faltaLeyendaFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.FormulaLegend {
		return nil
	}
	var missing []string
	for _, block := range cueBlocks(text) {
		if block.tag != "lk-story" || !isFormulaKind(block.spec["kind"]) {
			continue
		}
		if !anyCueStep(block.steps, func(step map[string]json.RawMessage) bool { return hasItems(step["facts"]) }) {
			missing = append(missing, block.label())
		}
	}
	if len(missing) == 0 {
		return nil
	}
	return []string{fmt.Sprintf("%d fórmula(s) o derivación(es) sin leyenda (%s) · da a un paso facts: [[símbolo, qué es], ...] con cada símbolo de la fórmula",
		len(missing), strings.Join(missing, ", "))}
}

// isFormulaKind reports whether a story's kind is a formula or a derivation.
func isFormulaKind(raw json.RawMessage) bool {
	var kind string
	return json.Unmarshal(raw, &kind) == nil && (kind == "formula" || kind == "derivation")
}

// anyCueStep reports whether one step of a block satisfies the predicate.
func anyCueStep(steps []json.RawMessage, pred func(map[string]json.RawMessage) bool) bool {
	for _, raw := range steps {
		if pred(cueStep(raw)) {
			return true
		}
	}
	return false
}
