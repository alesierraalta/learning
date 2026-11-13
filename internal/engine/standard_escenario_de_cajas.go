package engine

import (
	"encoding/json"
	"fmt"

	"learning/internal/rules"
)

// sceneDrawingKeys are the scene entries that make a still scene a drawing (#245):
// a character, a prop, a piece, a curve, a formula or a callout. An icon makes one
// only when it stands loose (drawsFreeIcon, #273). A scene that draws none of them
// draws only boxes with text and arrows.
var sceneDrawingKeys = []string{"actors", "props", "nodes", "grids", "sheets",
	"bars", "stats", "formulas", "formula", "curves", "paths", "dashed", "badges",
	"callouts", "policy", "tags"}

// sceneIcon and sceneBox read the coordinates the decoration rule needs (#273); a
// coordinate the note leaves out stays nil and places the icon on no box.
type sceneIcon struct {
	X *float64 `json:"x"`
	Y *float64 `json:"y"`
}

type sceneBox struct {
	X *float64 `json:"x"`
	Y *float64 `json:"y"`
	W *float64 `json:"w"`
	H *float64 `json:"h"`
}

// drawsFreeIcon reports whether a scene draws an icon that stands loose (#273). An
// icon whose centre lies on one of the scene's boxes, edges included, is the
// decoration of that box: a scene of boxes with decorations draws nothing the
// boxes do not. An icon whose coordinates cannot be read is loose.
func drawsFreeIcon(scene map[string]json.RawMessage) bool {
	if !declared(scene["icons"]) {
		return false
	}
	var icons []sceneIcon
	if json.Unmarshal(scene["icons"], &icons) != nil {
		return true
	}
	var boxes []sceneBox
	_ = json.Unmarshal(scene["boxes"], &boxes) // no readable boxes: nothing is decorated
	for _, icon := range icons {
		if !icon.onBox(boxes) {
			return true
		}
	}
	return false
}

// onBox reports whether the icon's centre lies on one of the boxes.
func (icon sceneIcon) onBox(boxes []sceneBox) bool {
	if icon.X == nil || icon.Y == nil {
		return false
	}
	for _, box := range boxes {
		if box.X == nil || box.Y == nil || box.W == nil || box.H == nil {
			continue
		}
		if *icon.X >= *box.X && *icon.X <= *box.X+*box.W && *icon.Y >= *box.Y && *icon.Y <= *box.Y+*box.H {
			return true
		}
	}
	return false
}

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
		if draws || drawsFreeIcon(spec.Scene) {
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
