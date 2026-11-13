package engine

import (
	"os"
	"strings"
	"testing"
)

// TestStandardRulesHaveTheirFiles keeps the table and the files in step: every rule
// in standardRules lives in standard_<id>.go, and no id is in the table twice. A new
// rule that misses its file, or a copied entry, fails here before it reaches a part.
func TestStandardRulesHaveTheirFiles(t *testing.T) {
	seen := map[string]bool{}
	for _, rule := range standardRules {
		if seen[rule.id] {
			t.Errorf("standard rule %q is in the table twice", rule.id)
		}
		seen[rule.id] = true
		file := "standard_" + strings.ReplaceAll(rule.id, "-", "_") + ".go"
		if _, err := os.Stat(file); err != nil {
			t.Errorf("standard rule %q has no file %s: %v", rule.id, file, err)
		}
	}
}
