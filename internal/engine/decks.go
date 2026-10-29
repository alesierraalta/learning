package engine

import (
	"encoding/json"
	"os"
	"strings"
)

// A walkthrough deck is a series of figures, one per step. The person's rule for
// these figures is explicit and repeated: "tienen que haber flechas para todo",
// arrows that say what happens, the way the studio tutorial guides the reader.
// A step that draws two things and no arrow is a static picture: the reader has
// to guess the relation, which is the opposite of guiding.

// deckScene keeps only what the arrow rule needs: how many figures a step draws
// and whether it draws the arrows that connect them. Unknown fields are ignored,
// so a scene may grow without touching this file.
type deckScene struct {
	Boxes   []json.RawMessage `json:"boxes"`
	Grids   []json.RawMessage `json:"grids"`
	Nodes   []json.RawMessage `json:"nodes"`
	Sheets  []json.RawMessage `json:"sheets"`
	Gears   []json.RawMessage `json:"gears"`
	Dashed  []json.RawMessage `json:"dashed"`
	Arrows  []json.RawMessage `json:"arrows"`
	Labels  []json.RawMessage `json:"labels"`
	Badges  []json.RawMessage `json:"badges"`
	Packets []json.RawMessage `json:"packets"`
}

func (s deckScene) figures() int {
	return len(s.Boxes) + len(s.Grids) + len(s.Nodes) + len(s.Sheets) + len(s.Gears) + len(s.Dashed)
}

type deckStep struct {
	Title string    `json:"title"`
	Scene deckScene `json:"scene"`
}

type deckSpec struct {
	Title string     `json:"title"`
	Steps []deckStep `json:"steps"`
}

// deckPayloads returns every walkthrough payload in the markup, in document
// order. A block that does not parse or has no steps (a quiz or diagram
// payload) is not a walkthrough and is skipped: presence is checked elsewhere.
func deckPayloads(markup string) []deckSpec {
	const open = `<script type="application/json">`
	const close = `</script>`
	var decks []deckSpec
	rest := markup
	for {
		at := strings.Index(rest, open)
		if at < 0 {
			return decks
		}
		rest = rest[at+len(open):]
		end := strings.Index(rest, close)
		if end < 0 {
			return decks
		}
		body := rest[:end]
		rest = rest[end+len(close):]
		var spec deckSpec
		if err := json.Unmarshal([]byte(body), &spec); err != nil || len(spec.Steps) == 0 {
			continue
		}
		decks = append(decks, spec)
	}
}

// guideArrowGaps names the steps that draw two or more figures and no arrow.
// A single figure stands on its own: there is nothing to guide the eye across.
func guideArrowGaps(markup string) []string {
	var gaps []string
	for _, spec := range deckPayloads(markup) {
		guided := 0
		for i, step := range spec.Steps {
			if len(step.Scene.Arrows) > 0 {
				guided++
			}
			if step.Scene.figures() < 2 || len(step.Scene.Arrows) > 0 {
				continue
			}
			where := "step " + itoa(i+1)
			if title := strings.TrimSpace(step.Title); title != "" {
				where += " (" + title + ")"
			}
			gaps = append(gaps, where)
		}
		// A deck that never draws an arrow is a set of pictures: the reader can
		// step through it and still not be shown what happens.
		if len(spec.Steps) > 0 && guided == 0 {
			name := strings.TrimSpace(spec.Title)
			if name == "" {
				name = "the deck"
			}
			gaps = append(gaps, "«"+name+"» without a single arrow")
		}
	}
	return gaps
}

// readArtifact returns the artifact text, or "" when it cannot be read: a
// missing artifact is reported by its own check, not by the arrow rule.
func readArtifact(ws, rel string) string {
	raw, err := os.ReadFile(absPath(ws, rel))
	if err != nil {
		return ""
	}
	return string(raw)
}

// walkthroughProblems reports declared walkthrough decks that cannot render: a
// walkthrough with no payload, a payload that is not valid JSON, or one without
// steps. A deck that draws nothing is not the demo the part promised.
func walkthroughProblems(markup string) []string {
	const open = `<script type="application/json">`
	const close = `</script>`
	var problems []string
	rest := markup
	for {
		at := strings.Index(rest, "<lk-walkthrough")
		if at < 0 {
			return problems
		}
		rest = rest[at:]
		end := strings.Index(rest, "</lk-walkthrough>")
		block := rest
		if end >= 0 {
			block, rest = rest[:end], rest[end+len("</lk-walkthrough>"):]
		} else {
			rest = ""
		}
		payload := strings.Index(block, open)
		if payload < 0 {
			problems = append(problems, "a walkthrough needs a JSON deck payload")
			continue
		}
		body := block[payload+len(open):]
		if cut := strings.Index(body, close); cut >= 0 {
			body = body[:cut]
		}
		var spec deckSpec
		if err := json.Unmarshal([]byte(body), &spec); err != nil {
			problems = append(problems, "a walkthrough declares a deck payload that is not valid JSON")
			continue
		}
		if len(spec.Steps) == 0 {
			problems = append(problems, "a walkthrough declares a deck without steps")
		}
	}
}
