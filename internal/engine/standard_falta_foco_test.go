package engine

import (
	"strings"
	"testing"
)

// The ring rule (#305): a walkthrough or a story of three drawn steps names one piece with a `ring` on at least
// one step. A `focus` is the formula's symbol list in a story, never a ring; a story of pieces draws no drawn
// step, so it asks for no ring; and a rules snapshot that does not declare `storyFocus` keeps accepting.
func TestFaltaFocoAsksForARingOnThreeDrawnSteps(t *testing.T) {
	on := cueThresholds(t, `{"storyFocus":true}`)
	if findings := faltaFocoFindings(cueWalk(3, "", ""), on); len(findings) != 1 || !strings.Contains(findings[0], "foco") {
		t.Fatalf("a three-step walkthrough without a ring: %v, want one finding naming the ring", findings)
	}
	if findings := faltaFocoFindings(cueWalk(3, "", `"ring":"a",`), on); len(findings) != 0 {
		t.Fatalf("a ring on step 2: %v, want none", findings)
	}
	if findings := faltaFocoFindings(cueWalk(3, "", `"focus":"a",`), on); len(findings) != 1 {
		t.Fatalf("a text focus is not a ring: %v, want one finding", findings)
	}
	if findings := faltaFocoFindings(cueStory("derivation", "", `"focus":["r"],`, 3, false), on); len(findings) != 1 {
		t.Fatalf("a focus list is not a ring: %v, want one finding", findings)
	}
	if findings := faltaFocoFindings(cueStory("derivation", "", `"ring":"r",`, 3, false), on); len(findings) != 0 {
		t.Fatalf("a ring on a story step: %v, want none", findings)
	}
	if findings := faltaFocoFindings(cueStory("derivation", "", "", 3, true), on); len(findings) != 0 {
		t.Fatalf("a story of pieces asks for no ring: %v, want none", findings)
	}
	if findings := faltaFocoFindings(cueStory("derivation", "", "", 2, false), on); len(findings) != 0 {
		t.Fatalf("a two-step story asks for no ring: %v, want none", findings)
	}
	if findings := faltaFocoFindings(cueWalk(3, "", ""), cueThresholds(t, `{}`)); len(findings) != 0 {
		t.Fatalf("a rule that is not declared: %v, want none", findings)
	}
}
