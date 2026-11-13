package engine

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"learning/internal/rules"
)

// The mark, verdict and icon rules (#261) read the payloads the kit draws, never the
// drawing: a mark that repeats a label of its step, a card tinted as a failure for a
// state that is valid, and a read or write icon the card's own words do not name.
// They mirror `tools/explain-check.mjs` (`marca-eco`, `veredicto-sin-error`,
// `accesorio-sin-sentido`), which normalises the same way: lower case, no accents.
var (
	cardsBlock    = regexp.MustCompile(`(?s)<lk-cards[\s>].*?</lk-cards>`)
	errorVerdict  = regexp.MustCompile(`\b(no compila|errores?|incorrect[oa]|rechazad[oa]|falla|fallo|invalid[oa]|no valid[oa]|prohibid[oa]|denegad[oa]|bloquead[oa]|panic|excepcion)\b`)
	readOrWrite   = regexp.MustCompile(`\b(leer|lee|leen|lectura|lector\w*|escrib\w*|escritura|escritor\w*|modific\w*|read\w*|write\w*)\b`)
	wordSeparator = regexp.MustCompile(`[^a-z0-9]+`)
	accentFold    = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n")
)

// foldWords lowers a text and drops its Spanish accents, so «Servidor» and
// «servidor» are one word and «Confirmación» reads as «confirmacion».
func foldWords(text string) string {
	return accentFold.Replace(strings.ToLower(text))
}

// wordsOf splits a text into its folded words, without the empty ones.
func wordsOf(text string) []string {
	var words []string
	for _, w := range wordSeparator.Split(foldWords(text), -1) {
		if w != "" {
			words = append(words, w)
		}
	}
	return words
}

// repeatsLabel reports whether a mark's words are a label's words, or a run of them:
// «SYN» repeats «SYN-ACK» and «servidor» repeats «Servidor» (#261).
func repeatsLabel(mark, label string) bool {
	m, e := wordsOf(mark), wordsOf(label)
	if len(m) == 0 {
		return false
	}
	for i := 0; i+len(m) <= len(e); i++ {
		same := true
		for j := range m {
			if e[i+j] != m[j] {
				same = false
				break
			}
		}
		if same {
			return true
		}
	}
	return false
}

// stepTagLabels returns the labels a step already draws: its moves' verbs, then its
// actors' tags and labels, in the order the tutor's tool reads them.
func stepTagLabels(scene map[string]json.RawMessage) []string {
	var moves []struct {
		Verb string `json:"verb"`
	}
	if raw, ok := scene["moves"]; ok {
		_ = json.Unmarshal(raw, &moves)
	}
	var actors []struct {
		Tag   string `json:"tag"`
		Label string `json:"label"`
	}
	if raw, ok := scene["actors"]; ok {
		_ = json.Unmarshal(raw, &actors)
	}
	var labels []string
	for _, m := range moves {
		labels = append(labels, m.Verb)
	}
	for _, a := range actors {
		labels = append(labels, a.Tag, a.Label)
	}
	var out []string
	for _, l := range labels {
		if strings.TrimSpace(l) != "" {
			out = append(out, l)
		}
	}
	return out
}

// markEchoFindings measures the mark-echo rule (#261): a mark whose label repeats a
// move's verb or an actor's tag of the same step says nothing the step does not
// already say. A rules snapshot that does not declare `markEcho` keeps accepting the
// parts it accepted.
func markEchoFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.MarkEcho {
		return nil
	}
	for _, doc := range storyRawDocs(text) {
		for i, step := range doc.Steps {
			_, scene, _ := storyStageOf(step)
			labels := stepTagLabels(scene)
			var marks []struct {
				Label string `json:"label"`
			}
			if raw, ok := scene["marks"]; ok {
				_ = json.Unmarshal(raw, &marks)
			}
			for _, mark := range marks {
				if strings.TrimSpace(mark.Label) == "" {
					continue
				}
				for _, label := range labels {
					if repeatsLabel(mark.Label, label) {
						return []string{fmt.Sprintf(
							"el paso %d marca «%s», que repite la etiqueta «%s» de ese mismo paso — la marca nombra lo que el paso aprueba («conexión pedida», «0.50»), no el movimiento ni el nombre que ya dibuja",
							i+1, strings.TrimSpace(mark.Label), strings.TrimSpace(label))}
					}
				}
			}
		}
	}
	return nil
}
