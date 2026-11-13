package engine

import (
	"encoding/json"
	"fmt"
	"sort"

	"learning/internal/rules"
)

// The keys the story schema reads, at each level. A key outside them is a
// drawing nobody draws (#246).
var (
	storyStepKeys  = map[string]bool{"title": true, "narrator": true, "equation": true, "focus": true, "stage": true, "say": true, "header": true}
	storyStageKeys = map[string]bool{"scene": true, "cards": true, "memory": true, "tables": true, "venn": true, "tree": true, "caption": true}
	storySceneKeys = map[string]bool{
		"actors": true, "props": true, "moves": true, "tags": true, "marks": true, "icons": true,
		"callouts": true, "curves": true, "paths": true, "formulas": true, "formula": true, "grids": true,
		"sheets": true, "gears": true, "boxes": true, "arrows": true, "nodes": true, "bars": true,
		"stats": true, "policy": true, "badges": true, "dashed": true, "labels": true, "title": true,
		"aria": true, "caption": true,
	}
)

// deadKeyFindings measures the dead-key rule (#246): a story step that carries a
// key the schema never reads is refused, and the refusal names the key and the
// schema. A rules snapshot that does not declare `deadKeys` keeps accepting the
// parts it accepted.
func deadKeyFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.DeadKeys {
		return nil
	}
	dead := func(keys map[string]json.RawMessage, known map[string]bool) string {
		var out []string
		for key := range keys {
			if !known[key] {
				out = append(out, key)
			}
		}
		sort.Strings(out)
		if len(out) == 0 {
			return ""
		}
		return out[0]
	}
	for _, doc := range storyRawDocs(text) {
		for i, step := range doc.Steps {
			stage, scene, nested := storyStageOf(step)
			path := ""
			if key := dead(step, storyStepKeys); key != "" {
				path = key
			} else if key := dead(stage, storyStageKeys); key != "" {
				path = "stage." + key
			} else if nested {
				if key := dead(scene, storySceneKeys); key != "" {
					path = "stage.scene." + key
				}
			}
			if path == "" {
				continue
			}
			return []string{fmt.Sprintf(
				"el paso %d lleva `%s`, que el esquema no lee — el escenario vive en `stage` y su dibujo en `stage.scene`; las claves del paso son title, narrator, equation, focus, stage, say, header",
				i+1, path)}
		}
	}
	return nil
}
