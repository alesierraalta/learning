package engine

import (
	"fmt"

	"learning/internal/rules"
)

// actorCharacterFindings measures the actor-character rule (#245): an actor is a
// character drawn with `kind`, and a story whose actors are all boxes with a name
// that names a character is refused. The refusal names the actor, the character
// that fits and the ones the kit draws. A rules snapshot that does not declare
// `actorCharacter` keeps accepting the parts it accepted.
func actorCharacterFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.ActorCharacter {
		return nil
	}
	for _, doc := range storyQualityDocs(text) {
		var actors []storyActor
		for _, step := range doc.Steps {
			actors = append(actors, storyStepActors(step.Stage)...)
		}
		if len(actors) == 0 {
			continue
		}
		drawn := false
		for _, a := range actors {
			if a.character() != "" {
				drawn = true
				break
			}
		}
		if drawn {
			continue
		}
		for _, a := range actors {
			kind := characterFor(a.Label)
			if kind == "" {
				continue
			}
			title := doc.Title
			if title == "" {
				title = "la historia"
			}
			return []string{fmt.Sprintf(
				"los actores de «%s» son cajas con su nombre — «%s» es un %s: dibújalo con `kind` («%s») y su nombre en `tag`; los personajes son %s",
				title, a.Label, kind, kind, storyCharacterNames())}
		}
	}
	return nil
}
