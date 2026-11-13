package engine

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"learning/internal/rules"
)

// pointsValue reads the pointer targets a step declares, wherever it declares
// them (a memory piece names its target by id).
var pointsValue = regexp.MustCompile(`"points"\s*:\s*"([^"]*)"`)

// storyMotion reports whether a story moves: a move anywhere, an actor that is
// in another state in some step, a prop that changes in some step, a piece that
// changes between steps, or a pointer that changes. An actor that appears or a
// prop that is replaced is the picture, not the action (#246).
func storyMotion(steps []map[string]json.RawMessage) bool {
	states := map[string]map[string]bool{}
	note := func(key, value string) {
		if states[key] == nil {
			states[key] = map[string]bool{}
		}
		states[key][value] = true
	}
	var pieces, pointers []string
	for _, step := range steps {
		stage, scene, _ := storyStageOf(step)
		var moves []json.RawMessage
		if raw, ok := scene["moves"]; ok {
			_ = json.Unmarshal(raw, &moves)
		}
		if len(moves) > 0 {
			return true
		}
		var actors []storyActor
		if raw, ok := scene["actors"]; ok {
			_ = json.Unmarshal(raw, &actors)
		}
		for _, a := range actors {
			state := a.State
			if state == "" {
				state = "active"
			}
			note("actor:"+a.ID, state)
		}
		var props []struct {
			ID    string `json:"id"`
			Label string `json:"label"`
			State string `json:"state"`
			Tone  string `json:"tone"`
		}
		if raw, ok := scene["props"]; ok {
			_ = json.Unmarshal(raw, &props)
		}
		for _, p := range props {
			note("prop:"+p.ID, p.Label+"|"+p.State+"|"+p.Tone)
		}
		// Una pieza cuenta como paso cuando cambia: la región de un conjunto, la
		// fila que se revela, la celda que se mueve.
		var piece json.RawMessage
		for _, key := range storyPieces {
			if raw, ok := stage[key]; ok && declared(raw) {
				piece = raw
				break
			}
		}
		pieces = append(pieces, string(piece))
		if raw, err := json.Marshal(stage); err == nil {
			var found []string
			for _, m := range pointsValue.FindAllStringSubmatch(string(raw), -1) {
				found = append(found, m[1])
			}
			pointers = append(pointers, strings.Join(found, "|"))
		}
	}
	for _, values := range states {
		if len(values) > 1 {
			return true
		}
	}
	for i := 1; i < len(pieces); i++ {
		if pieces[i] != pieces[i-1] {
			return true
		}
	}
	for i := 1; i < len(pointers); i++ {
		if pointers[i] != pointers[i-1] {
			return true
		}
	}
	return false
}

// storyMotionFindings measures the story-motion rule (#246): a derivation whose
// steps move nothing is the same picture repeated. A formula story is exempt —
// its progression is the token the header highlights. A rules snapshot that does
// not declare `storyMotion` keeps accepting the parts it accepted.
func storyMotionFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.StoryMotion {
		return nil
	}
	for _, doc := range storyRawDocs(text) {
		if doc.Kind != "derivation" || len(doc.Steps) < 2 {
			continue
		}
		if storyMotion(doc.Steps) {
			continue
		}
		title := doc.Title
		if title == "" {
			title = "sin título"
		}
		return []string{fmt.Sprintf(
			"la historia «%s» no mueve nada en %d paso(s): ni un movimiento (`moves`), ni un cambio de estado de sus actores, ni una pieza que cambie — dibuja la acción paso a paso, no la misma foto repetida",
			title, len(doc.Steps))}
	}
	return nil
}
