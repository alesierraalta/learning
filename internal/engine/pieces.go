package engine

import (
	"encoding/json"
	"regexp"
	"strings"
)

// The visual pieces the reader draws from a note's JSON (`kit.js`): verdict cards,
// memory diagrams, joined tables, set diagrams and the scenario explorer. Each is a
// visual in its own right, like a scene: the part's drawn example may be one, and it
// spends the part's one-scene budget. The engine reads presence, never geometry:
// `tools/scene-gate.mjs` and `tools/scene-lint.mjs` measure the drawing in a
// browser.

// pieceElements are the closed elements that carry a piece, in the order the
// kit defines them.
var pieceElements = []string{"lk-cards", "lk-memory", "lk-tables", "lk-venn", "lk-explorer"}

// pieceStageKeys are the keys a story step's `stage` uses to draw a piece
// instead of a scene.
var pieceStageKeys = []string{"cards", "memory", "tables", "venn"}

func isPieceElement(el string) bool {
	for _, p := range pieceElements {
		if strings.EqualFold(p, el) {
			return true
		}
	}
	return false
}

// sceneLikeElements are the elements the visual counter judges by their
// payload: the figure, the still scene and the pieces.
func sceneLikeElements() []string {
	return append([]string{figureElement, sceneElement}, pieceElements...)
}

// pieceDraws reports whether a closed piece block carries a payload the reader
// draws, and whether it carries its own caption (the reader draws it under the
// piece, so a captioned piece is its own reading guide).
func pieceDraws(el, block string) (draws, captioned bool) {
	payload, ok := jsonPayload(block)
	if !ok {
		return false, false
	}
	var spec map[string]json.RawMessage
	if err := json.Unmarshal([]byte(payload), &spec); err != nil {
		return false, false
	}
	var caption string
	if raw, ok := spec["caption"]; ok {
		_ = json.Unmarshal(raw, &caption)
	}
	guided := strings.TrimSpace(caption) != ""
	return pieceSpecDraws(strings.TrimPrefix(strings.ToLower(el), "lk-"), spec), guided
}

// pieceSpecDraws is the presence test for one piece kind: the same minimum the
// reader refuses to draw below.
func pieceSpecDraws(kind string, spec map[string]json.RawMessage) bool {
	count := func(key string) int {
		var list []json.RawMessage
		if raw, ok := spec[key]; ok && json.Unmarshal(raw, &list) == nil {
			return len(list)
		}
		return 0
	}
	switch kind {
	case "cards":
		// A comparison needs two to four cases.
		n := count("cards")
		return n >= 2 && n <= 4
	case "memory":
		// A memory diagram is at least one step.
		return count("steps") >= 1
	case "tables":
		// Joined tables carry their tables; a GROUP BY carries its rows.
		if count("tables") >= 1 {
			return true
		}
		var group struct {
			Rows []json.RawMessage `json:"rows"`
		}
		if raw, ok := spec["group"]; ok && json.Unmarshal(raw, &group) == nil {
			return len(group.Rows) >= 1
		}
		return false
	case "venn":
		// Two or three sets.
		n := count("sets")
		return n >= 2 && n <= 3
	case "explorer":
		// A scenario is a map of at least two systems and at least one step.
		return count("actors") >= 2 && count("steps") >= 1
	}
	return false
}

// pieceBlockRegexps are the closed blocks of each piece element. Go has no
// back-references, so each element gets its own expression.
var pieceBlockRegexps = func() []*regexp.Regexp {
	out := make([]*regexp.Regexp, len(pieceElements))
	for i, el := range pieceElements {
		out[i] = regexp.MustCompile(`(?s)<` + el + `[\s>].*?</` + el + `>`)
	}
	return out
}()

// pieceOpenRegexps match the opening of each piece element, to count them.
var pieceOpenRegexps = func() []*regexp.Regexp {
	out := make([]*regexp.Regexp, len(pieceElements))
	for i, el := range pieceElements {
		out[i] = regexp.MustCompile(`<` + el + `[\s>]`)
	}
	return out
}()

// pieceOpenCount counts the piece elements a text opens outside fenced code.
func pieceOpenCount(text string) int {
	plain := withoutCodeFences(text)
	n := 0
	for _, re := range pieceOpenRegexps {
		n += len(re.FindAllStringIndex(plain, -1))
	}
	return n
}

// drawnPieces counts the closed piece blocks, outside fenced code, whose payload
// draws something.
func drawnPieces(text string) int {
	plain := withoutCodeFences(text)
	n := 0
	for i, re := range pieceBlockRegexps {
		for _, block := range re.FindAllString(plain, -1) {
			if draws, _ := pieceDraws(pieceElements[i], block); draws {
				n++
			}
		}
	}
	return n
}

// withoutPieces removes the piece blocks: they are looked at, not read.
func withoutPieces(text, replacement string) string {
	for _, re := range pieceBlockRegexps {
		text = re.ReplaceAllString(text, replacement)
	}
	return text
}

// storyStageDrawsPiece reports whether a story step's stage names a piece.
func storyStageDrawsPiece(stage map[string]json.RawMessage) bool {
	for _, key := range pieceStageKeys {
		if raw, ok := stage[key]; ok && len(raw) > 2 && string(raw) != "null" {
			return true
		}
	}
	return false
}
