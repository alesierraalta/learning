package engine

import (
	"strings"
	"testing"
)

// The formula legend (#305): a formula or derivation story names its symbols in `facts` on at least one step.
// The rule has no step count, and a rules snapshot that does not declare `formulaLegend` keeps accepting.
func TestFaltaLeyendaAsksForFactsOnAFormulaStory(t *testing.T) {
	on := cueThresholds(t, `{"formulaLegend":true}`)
	if findings := faltaLeyendaFindings(cueStory("formula", "", "", 3, false), on); len(findings) != 1 || !strings.Contains(findings[0], "leyenda") {
		t.Fatalf("a formula story without facts: %v, want one finding naming the legend", findings)
	}
	if findings := faltaLeyendaFindings(cueStory("formula", "", `"facts":[["r","el robot"]],`, 3, false), on); len(findings) != 0 {
		t.Fatalf("a formula story with facts on step 2: %v, want none", findings)
	}
	if findings := faltaLeyendaFindings(cueStory("derivation", "", "", 2, false), on); len(findings) != 1 {
		t.Fatalf("a two-step derivation without facts: %v, want one finding", findings)
	}
	if findings := faltaLeyendaFindings(cueStory("formula", "", `"facts":[],`, 3, false), on); len(findings) != 1 {
		t.Fatalf("an empty facts list is a legend: %v, want one finding", findings)
	}
	if findings := faltaLeyendaFindings(cueStory("explanation", "", "", 3, false), on); len(findings) != 0 {
		t.Fatalf("a story that is neither a formula nor a derivation: %v, want none", findings)
	}
	if findings := faltaLeyendaFindings(cueWalk(3, `,"kind":"formula"`, ""), on); len(findings) != 0 {
		t.Fatalf("a walkthrough is not a formula story: %v, want none", findings)
	}
	if findings := faltaLeyendaFindings(cueStory("formula", "", "", 3, false), cueThresholds(t, `{}`)); len(findings) != 0 {
		t.Fatalf("a rule that is not declared: %v, want none", findings)
	}
}
