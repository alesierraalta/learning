package rules

import (
	"path/filepath"
	"testing"
)

// The code-in-prose rule (#332) is declared by the production rules only. A frozen snapshot never gains
// the key: the runs started on it keep accepting the questions they accepted.
func TestCodigoEnLineaIsDeclaredByProductionRulesOnly(t *testing.T) {
	production, err := Load("../../rules/deep.json")
	if err != nil {
		t.Fatal(err)
	}
	if !production.Thresholds.CodigoEnLinea {
		t.Fatal("rules/deep.json must declare codigoEnLinea")
	}
	for _, name := range []string{"rules-adaptive-diagnosis.json", "rules-fixed-diagnosis.json"} {
		frozen, err := Load(filepath.Join("..", "engine", "testdata", name))
		if err != nil {
			t.Fatal(err)
		}
		if frozen.Thresholds.CodigoEnLinea {
			t.Fatalf("%s declares codigoEnLinea: a frozen snapshot must keep accepting the questions it accepted", name)
		}
	}
}
