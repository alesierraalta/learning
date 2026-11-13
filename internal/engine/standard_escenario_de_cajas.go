package engine

import (
	"encoding/json"
	"fmt"

	"learning/internal/rules"
)

// sceneDrawingKeys are the scene entries that make a still scene a drawing (#245):
// a character, a prop, a piece, a curve, a formula or a callout. A scene that
// draws none of them draws only boxes with text and arrows.
var sceneDrawingKeys = []string{"actors", "props", "icons", "nodes", "grids", "sheets",
	"bars", "stats", "formulas", "formula", "curves", "paths", "dashed", "badges",
	"callouts", "policy", "tags"}

// sceneStageFindings measures the still-scene rule (#245): a `<lk-scene>` is held
// to the same bar as a story stage, so a scene that only draws boxes with text
// and arrows is refused. A rules snapshot that does not declare `sceneStage`
// keeps accepting the parts it accepted.
func sceneStageFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.SceneStage {
		return nil
	}
	for _, block := range sceneBlocks(text) {
		payload, ok := jsonPayload(block)
		if !ok {
			continue
		}
		var spec struct {
			Title string                     `json:"title"`
			Scene map[string]json.RawMessage `json:"scene"`
		}
		if json.Unmarshal([]byte(payload), &spec) != nil {
			continue
		}
		draws := false
		for _, key := range sceneDrawingKeys {
			if declared(spec.Scene[key]) {
				draws = true
				break
			}
		}
		if draws {
			continue
		}
		if !declared(spec.Scene["boxes"]) && !declared(spec.Scene["arrows"]) {
			continue
		}
		title := spec.Title
		if title == "" {
			title = "sin título"
		}
		return []string{fmt.Sprintf(
			"la escena quieta «%s» solo dibuja cajas con su texto y flechas — dibuja el personaje (<lk-scene> con `actors` y `kind`) o usa la pieza que le toca: <lk-memory>, <lk-tables>, <lk-venn>, <lk-cards>",
			title)}
	}
	return nil
}
