package engine

import (
	"fmt"

	"learning/internal/rules"
)

// walkthroughFindings measures the walkthrough decks: one per part. A formula or
// derivation walkthrough (<lk-story>) is a deck too, and a second one is refused.
func walkthroughFindings(text string, th rules.PartStandardThresholds) []string {
	decks := len(walkthroughOpen.FindAllStringIndex(withoutCodeFences(text), -1)) + len(storyOpen.FindAllStringIndex(withoutCodeFences(text), -1))
	if decks > th.MaxWalkthroughs {
		return []string{fmt.Sprintf(
			"%d walkthrough decks (limit %d) — one walkthrough per part; a second change is a step of the same deck or belongs to another part",
			decks, th.MaxWalkthroughs)}
	}
	return nil
}
