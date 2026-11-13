package engine

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"learning/internal/rules"
)

// textArrow is a flow written with dashes: `--->`, `---[`, `==>`. The prose rule
// (`drawnLines`) uses the same pattern.
var textArrow = regexp.MustCompile(`-{2,}>|={2,}>|-{2,}\[`)

// arrowFlowFindings measures the text-arrow rule (#246): a story header or a
// scene label written as a flow of dashes is geometry written, not drawn. A rules
// snapshot that does not declare `arrowFlows` keeps accepting the parts it
// accepted.
func arrowFlowFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.ArrowFlows {
		return nil
	}
	atomTexts := func(raw json.RawMessage) []string {
		var atoms []struct {
			T string `json:"t"`
		}
		if json.Unmarshal(raw, &atoms) != nil {
			return nil
		}
		out := make([]string, 0, len(atoms))
		for _, a := range atoms {
			out = append(out, a.T)
		}
		return out
	}
	for _, doc := range storyRawDocs(text) {
		var atoms []string
		if doc.Kind == "derivation" {
			// `equation` is an object with its atoms inside: {size, atoms:[…]}.
			for _, step := range doc.Steps {
				var eq struct {
					Atoms json.RawMessage `json:"atoms"`
				}
				if raw, ok := step["equation"]; ok && json.Unmarshal(raw, &eq) == nil {
					atoms = append(atoms, atomTexts(eq.Atoms)...)
				}
			}
		} else if raw, ok := doc.Formula["atoms"]; ok {
			atoms = append(atoms, atomTexts(raw)...)
		}
		for _, atom := range atoms {
			if textArrow.MatchString(atom) {
				return []string{fmt.Sprintf(
					"la cabecera de la historia es un esquema en texto («%s»): la cabecera lleva la línea de código o la fórmula, y el flujo se dibuja con actores y movimientos, nunca con `--->` o `---[`",
					strings.TrimSpace(atom))}
			}
		}
	}
	for _, block := range sceneBlocks(text) {
		payload, ok := jsonPayload(block)
		if !ok {
			continue
		}
		var spec struct {
			Scene map[string]json.RawMessage `json:"scene"`
		}
		if json.Unmarshal([]byte(payload), &spec) != nil {
			continue
		}
		for _, key := range []string{"labels", "boxes"} {
			var list []struct {
				Text  string `json:"text"`
				Label string `json:"label"`
			}
			if raw, ok := spec.Scene[key]; ok && json.Unmarshal(raw, &list) == nil {
				for _, l := range list {
					text := l.Text
					if text == "" {
						text = l.Label
					}
					if textArrow.MatchString(text) {
						return []string{fmt.Sprintf(
							"una etiqueta de la escena es un esquema en texto («%s»): la etiqueta nombra una pieza y el flujo se dibuja con actores y movimientos, nunca con `--->` o `---[`",
							strings.TrimSpace(text))}
					}
				}
			}
		}
	}
	return nil
}
