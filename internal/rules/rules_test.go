package rules

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The register is one table in the production rules. At «más» on both learner axes it is the
// reference the calibration measured; «menos» is the most permissive level a learner can choose.
func TestTheProductionRulesDeclareTheDefaultRegister(t *testing.T) {
	doc, err := Load(filepath.Join("..", "..", "rules", "deep.json"))
	if err != nil {
		t.Fatal(err)
	}
	reg := doc.Thresholds.PartStandard.Register
	if reg == nil {
		t.Fatal("rules/deep.json declares no register block")
	}
	want := RegisterLimits{MeanWords: 8, P90Words: 13, Contrast: 4, Steps: 12, Run: 3, EscenaAntes: 1, Explicado: 0.5, Negritas: 5}
	if got := reg.Limits("más", "más"); got != want {
		t.Fatalf("default limits = %+v, want the reference values %+v", got, want)
	}
	least := RegisterLimits{MeanWords: 14, P90Words: 20, Contrast: 2, Steps: 1, Run: 1, EscenaAntes: 0, Explicado: 0.2, Negritas: 1}
	if got := reg.Limits("menos", "menos"); got != least {
		t.Fatalf("«menos» limits = %+v, want %+v", got, least)
	}
	if got := reg.Limits("nivel-desconocido", "nivel-desconocido"); got != want {
		t.Fatalf("an unknown level reads the default: %+v", got)
	}
}

func TestFrozenSnapshotsDeclareNoRegister(t *testing.T) {
	for _, name := range []string{"rules-adaptive-diagnosis.json", "rules-fixed-diagnosis.json"} {
		raw, err := os.ReadFile(filepath.Join("..", "engine", "testdata", name))
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
		if _, ok := doc.Thresholds.PartStandard["register"]; ok {
			t.Fatalf("%s declares a register: a frozen snapshot must keep accepting the parts it accepted", name)
		}
	}
}

// A table that leaves a measure out of one level is refused when the rules load: the engine would have
// no number to measure the part against, and the refusal has to name the hole.
func TestTheRegisterTableMustNameEveryLevel(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "rules", "deep.json"))
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	levels := doc["thresholds"].(map[string]any)["partStandard"].(map[string]any)["register"].(map[string]any)["levels"].(map[string]any)
	delete(levels["sencillez"].(map[string]any)["frasesMedia"].(map[string]any), "medio")
	out, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "deep.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil || !strings.Contains(err.Error(), "frasesMedia") {
		t.Fatalf("Load accepted a register table without the «medio» level: %v", err)
	}
}
