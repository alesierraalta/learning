package engine

import (
	"strings"

	"learning/internal/rules"
)

// storyStageFindings measures the story-stage rule (#243): the steps of a story
// draw the action — actors with their state, props, moves, pointers, connectors
// or a piece — never a row of boxes with text. The refusal names the vocabulary
// to use. A rules snapshot that does not declare `storyStage` keeps accepting
// the parts it accepted.
func storyStageFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.StoryStage {
		return nil
	}
	for _, doc := range storyQualityDocs(text) {
		if len(doc.Steps) == 0 {
			continue
		}
		boxesOnly := true
		for _, step := range doc.Steps {
			if storyStepDrawsAction(step.Stage) {
				boxesOnly = false
				break
			}
		}
		if boxesOnly {
			return []string{"todos los pasos de la historia dibujan solo cajas con texto — dibuja la acción: " +
				strings.Join(storyVocabulary, ", ") + "; o una pieza: <lk-cards>, <lk-memory>, <lk-tables>, <lk-venn>"}
		}
	}
	return nil
}
