package engine

import (
	"strings"
	"testing"

	"learning/internal/rules"
)

// S29: una parte del contrato nuevo enseña su ejemplo con pasos de verdad. Una
// figura de paso lleva al menos cuatro pasos; una parte antigua no se mide.
func TestStepFigureNeedsFourSteps(t *testing.T) {
	note := func(steps int) string {
		return "# Parte 1\n\n## 1. El robot\n\n" + stepFigureBlock("lk-stage", `{"steps":[`+strings.Repeat(`{},`, steps-1)+`{}]}`) + "\n"
	}
	got := figurasFindings(note(2), rules.PartStandardThresholds{})
	if len(got) != 1 {
		t.Fatalf("figura de 2 pasos: %v, want one finding", got)
	}
	if !strings.Contains(got[0], "lk-stage 1") || !strings.Contains(got[0], "2 steps") {
		t.Fatalf("el hallazgo no nombra el elemento, su índice y el número de pasos: %v", got[0])
	}
	if got := figurasFindings(note(4), rules.PartStandardThresholds{}); len(got) != 0 {
		t.Fatalf("figura de 4 pasos: %v, want none", got)
	}
}

// S29: cada sección de contenido lleva al menos una figura, Mermaid o de pasos.
func TestEveryContentSectionNeedsAFigure(t *testing.T) {
	figure := stepFigureBlock("lk-guided", `{"steps":[{},{},{},{}]}`)
	note := "# Parte 1\n\n## 1. El robot\n\n" + figure + "\n\n## 2. La acción\n\nSólo hay prosa en esta sección.\n"
	got := figurasFindings(note, rules.PartStandardThresholds{})
	if len(got) != 1 {
		t.Fatalf("sección sin figura: %v, want one finding", got)
	}
	if !strings.Contains(got[0], "La acción") {
		t.Fatalf("el hallazgo no nombra la sección: %v", got[0])
	}
	covered := "# Parte 1\n\n## 1. El robot\n\n" + figure +
		"\n\n## 2. La acción\n\n```mermaid\nflowchart LR; A --> B;\n```\n"
	if got := figurasFindings(covered, rules.PartStandardThresholds{}); len(got) != 0 {
		t.Fatalf("todas las secciones con figura: %v, want none", got)
	}
}

// S10: una parte antigua, sin figuras de paso, sigue pasando sin cambios.
func TestLegacyNoteKeepsPassingFigureRules(t *testing.T) {
	legacy := "# Parte 1\n\n## 1. El robot\n\n<lk-figure><script type=\"application/json\">{\"boxes\":[{\"label\":\"robot\"}]}</script></lk-figure>\n\n## 2. La acción\n\nSólo prosa, como en las partes publicadas.\n"
	if got := figurasFindings(legacy, rules.PartStandardThresholds{}); len(got) != 0 {
		t.Fatalf("nota antigua: %v, want none", got)
	}
}
