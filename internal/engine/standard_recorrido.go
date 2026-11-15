package engine

import (
	"encoding/json"
	"fmt"
	"strings"

	"learning/internal/rules"
)

// walkthroughFindings measures the walkthrough decks: one per part. A formula walkthrough (<lk-story>) and a classic one
// are decks, and a second one is refused. A derivation story is a worked calculation, not a deck (#324): a part carries
// its formula story and one derivation per calculation.
func walkthroughFindings(text string, th rules.PartStandardThresholds) []string {
	if decks := deckCount(text); decks > th.MaxWalkthroughs {
		return []string{fmt.Sprintf(
			"%d walkthrough decks (limit %d) — one walkthrough per part; a second change is a step of the same deck or belongs to another part",
			decks, th.MaxWalkthroughs)}
	}
	return nil
}

// deckCount counts the walkthrough decks outside fenced code: each classic walkthrough, and each story that is not a
// derivation. A story that never closes, or whose payload does not read, is a deck: it is not known to be a derivation.
func deckCount(text string) int {
	plain := withoutCodeFences(text)
	decks := len(walkthroughOpen.FindAllStringIndex(plain, -1))
	for _, open := range storyOpen.FindAllStringIndex(plain, -1) {
		block := plain[open[0]:]
		end := strings.Index(block, "</lk-story>")
		if end < 0 {
			decks++
			continue
		}
		if !storyIsDerivation(block[:end+len("</lk-story>")]) {
			decks++
		}
	}
	return decks
}

// storyIsDerivation reports whether a story block is a derivation: `kind: "derivation"` in its payload.
func storyIsDerivation(block string) bool {
	payload, ok := jsonPayload(block)
	if !ok {
		return false
	}
	var spec struct {
		Kind string `json:"kind"`
	}
	return json.Unmarshal([]byte(payload), &spec) == nil && spec.Kind == "derivation"
}
