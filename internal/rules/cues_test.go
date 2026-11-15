package rules

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// The authoring cues (#305, and the calculation cue of #324) are additive keys that the production rules declare on.
// A rules snapshot without them keeps the parts it accepted: the engine's frozen-snapshot test proves that.
func TestTheProductionRulesDeclareTheCueKeys(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "rules", "deep.json"))
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Thresholds struct {
			PartStandard map[string]json.RawMessage `json:"partStandard"`
		} `json:"thresholds"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"storySummary", "formulaLegend", "storyFocus", "calculoEnTexto"} {
		if got := string(doc.Thresholds.PartStandard[key]); got != "true" {
			t.Fatalf("partStandard.%s = %q in the production rules, want true", key, got)
		}
	}
}
