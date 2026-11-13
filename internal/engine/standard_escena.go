package engine

import (
	"fmt"
	"strings"

	"learning/internal/rules"
)

// sceneFormulaBlocks returns the closed scene and walkthrough blocks outside// sceneFormulaBlocks returns the closed scene and walkthrough blocks outside
// fenced code: a scene inside a fence is an example of markup, not a drawing.
func sceneFormulaBlocks(text string) []string {
	plain := withoutCodeFences(text)
	return append(sceneBlock.FindAllString(plain, -1), walkthroughBlock.FindAllString(plain, -1)...)
}

// sceneBlocks returns the closed `<lk-scene>` blocks outside fenced code, in the
// order they appear.
func sceneBlocks(text string) []string {
	return sceneBlock.FindAllString(withoutCodeFences(text), -1)
}

// drawnScenes counts the `<lk-scene>` blocks and the visual pieces (verdict
// cards, memory, tables, sets) whose payload draws something. A scene that
// renders an empty stage is not a drawn example, and a walkthrough is a
// different element: it does not substitute for the scene.
func drawnScenes(text string) int {
	n := drawnPieces(text)
	for _, block := range sceneBlocks(text) {
		if draws, _ := scenePayload(block); draws {
			n++
		}
	}
	return n
}

// sceneFindings measures the part's scenes: at most `maxScenes`, and, when the
// standard declares it, at least `minScenes` that actually draw. The walkthrough
// is a different element and never substitutes for the drawn example.
func sceneFindings(text string, th rules.PartStandardThresholds) []string {
	var findings []string
	scenes := len(sceneOpen.FindAllStringIndex(withoutCodeFences(text), -1))
	if pieces := pieceOpenCount(text); pieces > 0 && scenes+pieces > th.MaxScenes {
		findings = append(findings, fmt.Sprintf(
			"%d drawn figures (<lk-scene> scenes and %s pieces; limit %d) — keep one and move the other to its own part",
			scenes+pieces, "<"+strings.Join(pieceElements, ">, <")+">", th.MaxScenes))
	} else if scenes > th.MaxScenes {
		findings = append(findings, fmt.Sprintf(
			"%d <lk-scene> scenes (limit %d) — keep one scene and move the other to its own part",
			scenes, th.MaxScenes))
	}
	if th.MinScenes > 0 {
		if drawn := drawnScenes(text); drawn < th.MinScenes {
			findings = append(findings, fmt.Sprintf(
				"%d drawn <lk-scene> scene(s) (the part needs %d) — dibuja el ejemplo con <lk-scene>: a JSON payload with boxes, arrows, nodes, bars or formulas the reader draws; a <lk-walkthrough> does not substitute for it, and the scene vocabulary is in skills/explicacion-interactiva/references/visuales.md",
				drawn, th.MinScenes))
		}
	}
	return findings
}
