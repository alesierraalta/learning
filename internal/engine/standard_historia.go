package engine

import (
	"learning/internal/rules"
)

// storyLanguageFindings measures the story-language rule: the part draws its
// step-by-step visual with the story language (`<lk-story>`, the deck of actors
// with state, moves and marks) or with a piece (`<lk-cards>`, `<lk-memory>`,
// `<lk-tables>`, `<lk-venn>`). The classic `<lk-walkthrough>` is legacy and does
// not count: its free-form boxes and arrows draw badly, and it was the path the
// weak model took (#237). A part that carries neither is refused with the element
// to use, so the tutor corrects the part from the message alone; a scene or an
// inline SVG is not a substitute. A rules snapshot that does not declare
// `storyLanguage` keeps accepting the parts it accepted.
func storyLanguageFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.StoryLanguage {
		return nil
	}
	stories := len(storyOpen.FindAllStringIndex(withoutCodeFences(text), -1))
	if stories+pieceOpenCount(text) > 0 {
		return nil
	}
	return []string{"the part carries no story and no piece — usa una historia por pasos <lk-story> o una pieza: <lk-cards>, <lk-memory>, <lk-tables>, <lk-venn>; a classic <lk-walkthrough> alone does not count"}
}
