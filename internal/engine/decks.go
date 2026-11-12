package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
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

// parseGeoms keeps the figures the kit can place: an entry without a numeric x
// and y renders nothing, so it draws nothing.
func parseGeoms(raw []json.RawMessage) []figureGeom {
	out := make([]figureGeom, 0, len(raw))
	for _, item := range raw {
		var g struct {
			X      *float64          `json:"x"`
			Y      *float64          `json:"y"`
			W      float64           `json:"w"`
			H      float64           `json:"h"`
			R      float64           `json:"r"`
			Width  float64           `json:"width"`
			RowH   float64           `json:"rowH"`
			Rows   []json.RawMessage `json:"rows"`
			Header *bool             `json:"header"`
		}
		if json.Unmarshal(item, &g) != nil || g.X == nil || g.Y == nil {
			continue
		}
		out = append(out, figureGeom{X: *g.X, Y: *g.Y, W: g.W, H: g.H, R: g.R, Width: g.Width, RowH: g.RowH, Rows: g.Rows, Header: g.Header})
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

// pointsAtTable reports an arrow whose head ends inside the table, on the row
// or cell it shows.
func pointsAtTable(arrows []arrowEnds, g figureGeom) bool {
	w, h := gridSize(g)
	for _, a := range arrows {
		if a.X2 >= g.X && a.X2 <= g.X+w && a.Y2 >= g.Y && a.Y2 <= g.Y+h {
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
	// A box, sheet or frame needs a size to be drawn at all.
	for _, g := range append(append(parseGeoms(s.Boxes), parseGeoms(s.Sheets)...), parseGeoms(s.Dashed)...) {
		if g.W <= 0 || g.H <= 0 {
			continue
		}
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
	grids := parseGeoms(s.Grids)
	for _, g := range grids {
		if w, h := gridSize(g); w*h > largestTableArea {
			largestTable, largestTableArea = g, w*h
		}
	}
	switch {
	case shapes == 0 && len(grids) == 0:
		return "draws nothing: draw the example itself (boxes, nodes)"
	case len(arrows) == 0:
		return "has no arrow with both ends (x1, y1, x2, y2): point at what changes, the way the tutorial does"
	case largestTableArea > largestShape && !pointsAtTable(arrows, largestTable):
		return "its largest figure is a table that no arrow points at: draw the example itself as the scene, or point at the row or cell that matters"
	}
	return ""
}

// fenceRun reads a CommonMark fence line: at most three spaces of indentation,
// then three or more backticks or tildes. It returns the character, the run
// length and what follows the run, or 0 when the line is not a fence.
func fenceRun(line string) (ch byte, n int, rest string) {
	indent := 0
	for indent < len(line) && line[indent] == ' ' {
		indent++
	}
	if indent > 3 || indent == len(line) || (line[indent] != '`' && line[indent] != '~') {
		return 0, 0, ""
	}
	ch = line[indent]
	for indent+n < len(line) && line[indent+n] == ch {
		n++
	}
	if n < 3 {
		return 0, 0, ""
	}
	return ch, n, line[indent+n:]
}

// stripQuotes removes the blockquote markers in front of a line and reports how
// many there were.
func stripQuotes(line string) (int, string) {
	depth := 0
	for {
		i := 0
		for i < len(line) && i < 3 && line[i] == ' ' {
			i++
		}
		if i == len(line) || line[i] != '>' {
			return depth, line
		}
		line = strings.TrimPrefix(line[i+1:], " ")
		depth++
	}
}

// listMarker is a list item opener; its width is the item's content indent.
var listMarker = regexp.MustCompile(`^ {0,3}(?:[-*+]|\d{1,9}[.)]) {1,4}`)

// htmlBlockStart is a line that opens a CommonMark HTML block, where fences are
// plain text. It returns what ends the block: a closing tag for script, pre,
// style and textarea, "-->" for a comment, or "" for "the next blank line".
func htmlBlockStart(line string) (bool, string) {
	trimmed := strings.TrimLeft(line, " ")
	if len(line)-len(trimmed) > 3 || len(trimmed) < 2 || trimmed[0] != '<' {
		return false, ""
	}
	if strings.HasPrefix(trimmed, "<!--") {
		return true, "-->"
	}
	next := trimmed[1]
	if next != '/' && next != '!' && next != '?' && !('a' <= next && next <= 'z' || 'A' <= next && next <= 'Z') {
		return false, ""
	}
	lower := strings.ToLower(trimmed)
	for _, tag := range []string{"script", "pre", "style", "textarea"} {
		if strings.HasPrefix(lower, "<"+tag) && (len(lower) == len(tag)+1 || strings.ContainsRune(" >\t", rune(lower[len(tag)+1]))) {
			return true, "</" + tag + ">"
		}
	}
	return true, ""
}

// withoutCodeFences drops fenced code blocks (``` and ~~~): markup inside them
// is shown as code, never rendered as a walkthrough. It follows CommonMark: a
// backtick opener's info string has no backtick; a fence closes only with the
// same character, at least as long, followed by spaces or tabs alone; a fence
// inside a list item or a blockquote belongs to that container and ends with
// it; and a fence-looking line inside an HTML block is plain text.
func withoutCodeFences(text string) string {
	var out strings.Builder
	keep := func(line string) {
		out.WriteString(line)
		out.WriteByte('\n')
	}
	var fenceChar byte
	fenceLen, fenceQuotes, fenceIndent := 0, 0, 0
	inHTML, htmlEnd := false, ""
	// The open list item, if any: its content indent holds on its continuation
	// lines (and across blank lines) until a less indented line ends it.
	listIndent, listQuotes := 0, 0
	for line := range strings.SplitSeq(text, "\n") {
		line = strings.TrimSuffix(line, "\r")
		if fenceLen > 0 {
			depth, body := stripQuotes(line)
			lead := len(body) - len(strings.TrimLeft(body, " "))
			left := depth < fenceQuotes || (fenceIndent > 0 && strings.TrimSpace(body) != "" && lead < fenceIndent)
			if !left {
				body = body[min(lead, fenceIndent):]
				if ch, n, rest := fenceRun(body); ch == fenceChar && n >= fenceLen && strings.Trim(rest, " \t") == "" {
					fenceLen = 0
				}
				continue
			}
			fenceLen = 0 // the container ended, and the fence with it
		}
		if inHTML {
			keep(line)
			if (htmlEnd == "" && strings.TrimSpace(line) == "") || (htmlEnd != "" && strings.Contains(strings.ToLower(line), htmlEnd)) {
				inHTML = false
			}
			continue
		}
		depth, body := stripQuotes(line)
		if depth != listQuotes {
			listIndent = 0
		}
		lead := len(body) - len(strings.TrimLeft(body, " "))
		if m := listMarker.FindString(body); m != "" {
			listIndent, listQuotes, body = len(m), depth, body[len(m):]
		} else if listIndent > 0 {
			if strings.TrimSpace(body) != "" && lead < listIndent {
				listIndent = 0
			} else {
				body = body[min(lead, listIndent):]
			}
		}
		indent := listIndent
		if ch, n, rest := fenceRun(body); n > 0 && !(ch == '`' && strings.ContainsRune(rest, '`')) {
			fenceChar, fenceLen, fenceQuotes, fenceIndent = ch, n, depth, indent
			continue
		}
		if start, end := htmlBlockStart(body); start {
			inHTML, htmlEnd = true, end
			if end != "" && strings.Contains(strings.ToLower(body), end) {
				inHTML = false
			}
		}
		keep(line)
	}
	return out.String()
}

// progressiveProblems checks every walkthrough of a part note, including the
// formula and derivation walkthroughs (`<lk-story>`). It returns how many
// walkthroughs the note declares and what keeps them from teaching the example
// step by step.
func progressiveProblems(markup string) (int, []string) {
	count, problems := walkthroughProgressiveProblems(markup)
	stories, storyProblems := storyProgressiveProblems(markup)
	return count + stories, append(problems, storyProblems...)
}

// walkthroughProgressiveProblems checks the scene decks (`<lk-walkthrough>`).
func walkthroughProgressiveProblems(markup string) (int, []string) {
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

// storyDeckStep is the part of a formula/derivation step the progressive rule
// reads: the narrator's sentence, the token the step focuses, the stage it draws
// and the moves and marks that show what happens.
type storyDeckStep struct {
	Title    string            `json:"title"`
	Narrator string            `json:"narrator"`
	Focus    []string          `json:"focus"`
	Stage    *storyDeckStage   `json:"stage"`
	Moves    []json.RawMessage `json:"moves"`
	Marks    []json.RawMessage `json:"marks"`
}

// storyDeckStage is what a step puts on the stage: a scene, or a visual piece
// (verdict cards, memory, tables, sets) named by its own key.
type storyDeckStage struct {
	Scene storyScene `json:"scene"`
	Piece bool       `json:"-"`
}

func (s *storyDeckStage) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	if scene, ok := raw["scene"]; ok {
		if err := json.Unmarshal(scene, &s.Scene); err != nil {
			return err
		}
	}
	s.Piece = storyStageDrawsPiece(raw)
	return nil
}

// storyScene is the stage vocabulary of a story step: the actors with their
// state, the props they carry, the moves between pieces and the marks that close
// the step, next to the figures a still scene draws.
type storyScene struct {
	deckScene
	Actors []json.RawMessage `json:"actors"`
	Props  []json.RawMessage `json:"props"`
	Icons  []json.RawMessage `json:"icons"`
	Paths  []json.RawMessage `json:"paths"`
	Moves  []json.RawMessage `json:"moves"`
	Marks  []json.RawMessage `json:"marks"`
}

// draws reports whether the stage puts anything on the canvas.
func (s storyScene) draws() bool {
	return s.figures()+len(s.Actors)+len(s.Props)+len(s.Icons)+len(s.Paths)+len(s.Labels) > 0
}

// storyDeck is the payload of a formula or derivation walkthrough.
type storyDeck struct {
	Kind    string           `json:"kind"`
	Title   string           `json:"title"`
	Formula *json.RawMessage `json:"formula"`
	Steps   []storyDeckStep  `json:"steps"`
}

// storyProgressiveProblems checks the formula and derivation walkthroughs: a
// story has a kind, three to eight steps, a narrator in each step, and the
// action the step is about (a focused token in a formula story, a move or a mark
// in a derivation). A story that draws nothing is not the demo the part promised.
func storyProgressiveProblems(markup string) (int, []string) {
	const open = `<script type="application/json">`
	const close = `</script>`
	var problems []string
	count := 0
	rest := markup
	for {
		at := strings.Index(rest, "<lk-story")
		if at < 0 {
			return count, problems
		}
		count++
		name := "story " + itoa(count)
		rest = rest[at:]
		end := strings.Index(rest, "</lk-story>")
		if next := strings.Index(rest[1:], "<lk-story"); next >= 0 && (end < 0 || next+1 < end) {
			problems = append(problems, name+" is not closed")
			rest = rest[next+1:]
			continue
		}
		if end < 0 {
			return count, append(problems, name+" is not closed")
		}
		block := rest[:end]
		rest = rest[end+len("</lk-story>"):]
		payload := strings.Index(block, open)
		if payload < 0 {
			problems = append(problems, name+" has no JSON payload")
			continue
		}
		body := block[payload+len(open):]
		if cut := strings.Index(body, close); cut >= 0 {
			body = body[:cut]
		}
		var spec storyDeck
		if err := json.Unmarshal([]byte(body), &spec); err != nil {
			problems = append(problems, name+" has a payload that is not valid JSON")
			continue
		}
		if spec.Kind != "formula" && spec.Kind != "derivation" {
			problems = append(problems, name+" declares no kind; a story is \"formula\" or \"derivation\"")
			continue
		}
		if n := len(spec.Steps); n < progressiveMinSteps || n > 8 {
			problems = append(problems, fmt.Sprintf("%s has %d steps; build the story in %d to 8 steps", name, n, progressiveMinSteps))
			continue
		}
		if spec.Kind == "formula" && (spec.Formula == nil || len(*spec.Formula) <= 2) {
			problems = append(problems, name+" is a formula story without a formula: declare `formula` with one atom per symbol")
		}
		for i, step := range spec.Steps {
			where := name + " step " + itoa(i+1)
			if title := strings.TrimSpace(step.Title); title != "" {
				where += " (" + title + ")"
			}
			if strings.TrimSpace(step.Narrator) == "" {
				problems = append(problems, where+" has no narrator sentence")
			}
			if spec.Kind == "formula" && i > 0 && i < len(spec.Steps)-1 && len(step.Focus) == 0 {
				problems = append(problems, where+" focuses no symbol; each middle step highlights the atom it explains")
			}
			if step.Stage == nil {
				if spec.Kind == "derivation" && i > 0 && len(step.Moves) == 0 && len(step.Marks) == 0 {
					problems = append(problems, where+" draws no move and no mark; a derivation step shows what changes")
				}
				problems = append(problems, where+" has no stage")
				continue
			}
			// The kit draws moves and marks from the stage, so that is where they are
			// read; a step's own `moves` and `marks` still count.
			scene := step.Stage.Scene
			if spec.Kind == "derivation" && i > 0 && !step.Stage.Piece && len(step.Moves)+len(step.Marks)+len(scene.Moves)+len(scene.Marks) == 0 {
				problems = append(problems, where+" draws no move and no mark; a derivation step shows what changes")
			}
			if spec.Kind == "derivation" && !step.Stage.Piece && !scene.draws() {
				problems = append(problems, where+" draws nothing: draw the actors that carry the idea")
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
