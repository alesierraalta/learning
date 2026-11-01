package engine

import (
	"encoding/json"
	"fmt"
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

// A part teaches its example by drawing it: the person asked for the scene the
// studio tutorial shows, with the arrow that says where to look, not "una tabla e
// iconos que se van actualizando abajo". The engine holds every part it has not
// certified yet to that shape, whatever rules snapshot the run froze, because
// the rule is about the person, not about one version of the rules.
const (
	progressiveMinSteps = 3
	progressiveMaxSteps = 6
)

// figureGeom keeps the size of a drawn figure; the kit's own defaults fill in
// what the author left out.
type figureGeom struct {
	W, H, R, Width, RowH float64
	Rows                 []json.RawMessage
	Header               *bool
}

func parseGeoms(raw []json.RawMessage) []figureGeom {
	out := make([]figureGeom, 0, len(raw))
	for _, item := range raw {
		var g struct {
			W      float64           `json:"w"`
			H      float64           `json:"h"`
			R      float64           `json:"r"`
			Width  float64           `json:"width"`
			RowH   float64           `json:"rowH"`
			Rows   []json.RawMessage `json:"rows"`
			Header *bool             `json:"header"`
		}
		_ = json.Unmarshal(item, &g)
		out = append(out, figureGeom{W: g.W, H: g.H, R: g.R, Width: g.Width, RowH: g.RowH, Rows: g.Rows, Header: g.Header})
	}
	return out
}

// gridArea mirrors scene.js: 560 wide, 48 per row, plus the header row.
func gridArea(g figureGeom) float64 {
	w, rowH := g.Width, g.RowH
	if w <= 0 {
		w = 560
	}
	if rowH <= 0 {
		rowH = 48
	}
	rows := float64(len(g.Rows))
	if g.Header == nil || *g.Header {
		rows++
	}
	return w * rowH * rows
}

// sceneProblem names what keeps one step from drawing the example, or "".
func sceneProblem(s deckScene) string {
	largestShape := 0.0
	shapes := 0
	for _, g := range parseGeoms(s.Boxes) {
		shapes++
		largestShape = max(largestShape, g.W*g.H)
	}
	for _, g := range parseGeoms(s.Sheets) {
		shapes++
		largestShape = max(largestShape, g.W*g.H)
	}
	for _, g := range append(parseGeoms(s.Nodes), parseGeoms(s.Gears)...) {
		shapes++
		r := g.R
		if r <= 0 {
			r = 30
		}
		largestShape = max(largestShape, 4*r*r)
	}
	largestTable := 0.0
	for _, g := range parseGeoms(s.Grids) {
		largestTable = max(largestTable, gridArea(g))
	}
	switch {
	case shapes == 0 && len(s.Grids) > 0:
		return "only draws a table: draw the example itself (boxes, nodes) and keep a table as a complement"
	case shapes == 0:
		return "draws nothing: draw the example itself (boxes, nodes)"
	case largestTable > largestShape:
		return "its largest figure is a table: draw the example itself as the scene and keep the table smaller, as a complement"
	case len(s.Arrows) == 0:
		return "has no arrow: point at what changes, the way the tutorial does"
	}
	return ""
}

// progressiveProblems checks every walkthrough of a part note. It returns how
// many walkthroughs the note declares and what keeps them from teaching the
// example step by step.
func progressiveProblems(markup string) (int, []string) {
	const open = `<script type="application/json">`
	const close = `</script>`
	var problems []string
	count := 0
	rest := markup
	for {
		at := strings.Index(rest, "<lk-walkthrough")
		if at < 0 {
			return count, problems
		}
		count++
		name := "walkthrough " + itoa(count)
		rest = rest[at:]
		end := strings.Index(rest, "</lk-walkthrough>")
		if end < 0 {
			return count, append(problems, name+" is not closed")
		}
		block := rest[:end]
		rest = rest[end+len("</lk-walkthrough>"):]
		payload := strings.Index(block, open)
		if payload < 0 {
			problems = append(problems, name+" has no JSON deck payload")
			continue
		}
		body := block[payload+len(open):]
		if cut := strings.Index(body, close); cut >= 0 {
			body = body[:cut]
		}
		var spec deckSpec
		if err := json.Unmarshal([]byte(body), &spec); err != nil {
			problems = append(problems, name+" has a deck payload that is not valid JSON")
			continue
		}
		if n := len(spec.Steps); n < progressiveMinSteps || n > progressiveMaxSteps {
			problems = append(problems, fmt.Sprintf("%s has %d steps; build the example in %d to %d steps", name, n, progressiveMinSteps, progressiveMaxSteps))
			continue
		}
		for i, step := range spec.Steps {
			if p := sceneProblem(step.Scene); p != "" {
				where := name + " step " + itoa(i+1)
				if title := strings.TrimSpace(step.Title); title != "" {
					where += " (" + title + ")"
				}
				problems = append(problems, where+" "+p)
			}
		}
	}
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
