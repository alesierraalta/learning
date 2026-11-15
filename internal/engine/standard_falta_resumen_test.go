package engine

import (
	"strings"
	"testing"
)

// The closing card (#305): a walkthrough or a story of three steps or more ends with a `summary`. A two-step
// walkthrough does not ask for one, and a rules snapshot that does not declare `storySummary` keeps accepting
// the parts it accepted.
func TestFaltaResumenAsksForACardOnThreeSteps(t *testing.T) {
	on := cueThresholds(t, `{"storySummary":true}`)
	if findings := faltaResumenFindings(cueWalk(3, "", ""), on); len(findings) != 1 || !strings.Contains(findings[0], "resumen") {
		t.Fatalf("a three-step walkthrough without a summary: %v, want one finding naming the summary", findings)
	}
	if findings := faltaResumenFindings(cueWalk(3, cueSummary, ""), on); len(findings) != 0 {
		t.Fatalf("a walkthrough with its summary: %v, want none", findings)
	}
	if findings := faltaResumenFindings(cueWalk(2, "", ""), on); len(findings) != 0 {
		t.Fatalf("a two-step walkthrough: %v, want none", findings)
	}
	if findings := faltaResumenFindings(cueStory("formula", "", "", 3, false), on); len(findings) != 1 {
		t.Fatalf("a three-step story without a summary: %v, want one finding", findings)
	}
	if findings := faltaResumenFindings(cueStory("formula", cueSummary, "", 3, false), on); len(findings) != 0 {
		t.Fatalf("a story with its summary: %v, want none", findings)
	}
	if findings := faltaResumenFindings(cueWalk(3, "", ""), cueThresholds(t, `{}`)); len(findings) != 0 {
		t.Fatalf("a rule that is not declared: %v, want none", findings)
	}
}
