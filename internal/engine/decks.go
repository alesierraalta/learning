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
	X, Y, W, H, R, Width, RowH float64
	Rows                       []json.RawMessage
	Header                     *bool
}

func parseGeoms(raw []json.RawMessage) []figureGeom {
	out := make([]figureGeom, 0, len(raw))
	for _, item := range raw {
		var g struct {
			X      float64           `json:"x"`
			Y      float64           `json:"y"`
			W      float64           `json:"w"`
			H      float64           `json:"h"`
			R      float64           `json:"r"`
			Width  float64           `json:"width"`
			RowH   float64           `json:"rowH"`
			Rows   []json.RawMessage `json:"rows"`
			Header *bool             `json:"header"`
		}
		_ = json.Unmarshal(item, &g)
		out = append(out, figureGeom{X: g.X, Y: g.Y, W: g.W, H: g.H, R: g.R, Width: g.Width, RowH: g.RowH, Rows: g.Rows, Header: g.Header})
	}
	return out
}

// gridSize mirrors scene.js: 560 wide, 48 per row, plus the header row.
func gridSize(g figureGeom) (w, h float64) {
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
	return w, rowH * rows
}

type arrowEnds struct{ X2, Y2 float64 }

// drawnArrows keeps the arrows the kit can draw: both ends given as numbers.
// An entry without them renders nothing, so it guides nothing.
func drawnArrows(arrows []json.RawMessage) []arrowEnds {
	var out []arrowEnds
	for _, raw := range arrows {
		var a struct {
			X1, Y1, X2, Y2 *float64
		}
		if json.Unmarshal(raw, &a) != nil || a.X1 == nil || a.Y1 == nil || a.X2 == nil || a.Y2 == nil {
			continue
		}
		out = append(out, arrowEnds{*a.X2, *a.Y2})
	}
	return out
}

// pointsAtTable reports an arrow whose head lands on the table (with a small
// margin for the head drawn just outside the frame).
func pointsAtTable(arrows []arrowEnds, g figureGeom) bool {
	const margin = 12.0
	w, h := gridSize(g)
	for _, a := range arrows {
		if a.X2 >= g.X-margin && a.X2 <= g.X+w+margin && a.Y2 >= g.Y-margin && a.Y2 <= g.Y+h+margin {
			return true
		}
	}
	return false
}

// circleArea is the bounding square of a node or gear, with the kit's default
// radius when the author left it out (scene.js: node 30, gear 60).
func circleArea(gs []figureGeom, fallback float64) (n int, largest float64) {
	for _, g := range gs {
		r := g.R
		if r <= 0 {
			r = fallback
		}
		n++
		largest = max(largest, 4*r*r)
	}
	return n, largest
}

// sceneProblem names what keeps one step from drawing the example, or "".
func sceneProblem(s deckScene) string {
	largestShape := 0.0
	shapes := 0
	for _, g := range parseGeoms(s.Boxes) {
		shapes++
		largestShape = max(largestShape, g.W*g.H)
	}
	for _, g := range append(parseGeoms(s.Sheets), parseGeoms(s.Dashed)...) {
		shapes++
		largestShape = max(largestShape, g.W*g.H)
	}
	for _, c := range []struct {
		raw      []json.RawMessage
		fallback float64
	}{{s.Nodes, 30}, {s.Gears, 60}} {
		n, area := circleArea(parseGeoms(c.raw), c.fallback)
		shapes += n
		largestShape = max(largestShape, area)
	}
	arrows := drawnArrows(s.Arrows)
	// A table may be the scene only when the data is the example (rows of a
	// relation): then an arrow points into it, at the row or cell that matters.
	// A table no arrow touches is the rejected shape, a grid of icons with the
	// explanation happening somewhere else.
	var largestTable figureGeom
	largestTableArea := 0.0
	for _, g := range parseGeoms(s.Grids) {
		if w, h := gridSize(g); w*h > largestTableArea {
			largestTable, largestTableArea = g, w*h
		}
	}
	switch {
	case shapes == 0 && len(s.Grids) == 0:
		return "draws nothing: draw the example itself (boxes, nodes)"
	case len(arrows) == 0:
		return "has no arrow with both ends (x1, y1, x2, y2): point at what changes, the way the tutorial does"
	case largestTableArea > largestShape && !pointsAtTable(arrows, largestTable):
		return "its largest figure is a table that no arrow points at: draw the example itself as the scene, or point at the row or cell that matters"
	}
	return ""
}

// fenceRun returns the fence character and run length a line opens with (three
// or more backticks or tildes), or 0 when the line is not a fence.
func fenceRun(trimmed string) (byte, int) {
	if len(trimmed) < 3 || (trimmed[0] != '`' && trimmed[0] != '~') {
		return 0, 0
	}
	n := 0
	for n < len(trimmed) && trimmed[n] == trimmed[0] {
		n++
	}
	if n < 3 {
		return 0, 0
	}
	return trimmed[0], n
}

// withoutCodeFences drops fenced code blocks (``` and ~~~): markup inside them
// is shown as code, never rendered as a walkthrough. As in CommonMark, a fence
// closes only with the same character, at least as long, and nothing after it.
func withoutCodeFences(text string) string {
	var out strings.Builder
	var fenceChar byte
	fenceLen := 0
	for line := range strings.SplitSeq(text, "\n") {
		trimmed := strings.TrimSpace(line)
		ch, n := fenceRun(trimmed)
		if fenceLen == 0 {
			if n > 0 {
				fenceChar, fenceLen = ch, n
				continue
			}
			out.WriteString(line)
			out.WriteByte('\n')
			continue
		}
		if ch == fenceChar && n >= fenceLen && n == len(trimmed) {
			fenceLen = 0
		}
	}
	return out.String()
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
		// The next opening before this closing means this deck never closed:
		// it must not borrow the next deck's closing tag and hide that deck.
		if next := strings.Index(rest[1:], "<lk-walkthrough"); next >= 0 && (end < 0 || next+1 < end) {
			problems = append(problems, name+" is not closed")
			rest = rest[next+1:]
			continue
		}
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
