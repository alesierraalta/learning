package engine

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
)

// The authoring cues (#305) read the walkthroughs and the stories of a note the way explain-check reads them,
// so the engine and the tool give the same verdict. A block is read outside fenced code, in document order, and
// its number counts every block of the note, as explain-check numbers them.

// cueBlock is one walkthrough or story of a note: its tag, its payload and its steps as written.
type cueBlock struct {
	tag   string
	index int
	spec  map[string]json.RawMessage
	steps []json.RawMessage
}

// label names a block in a finding the way explain-check names it: its tag, its number and its steps.
func (b cueBlock) label() string {
	return fmt.Sprintf("%s %d (%d pasos)", b.tag, b.index, len(b.steps))
}

// cueBlocks returns the walkthroughs and the stories of a note that carry a readable payload.
func cueBlocks(text string) []cueBlock {
	type hit struct {
		at  int
		tag string
		raw string
	}
	clean := withoutCodeFences(text)
	var hits []hit
	for _, source := range []struct {
		tag string
		re  *regexp.Regexp
	}{{"lk-walkthrough", walkthroughBlock}, {"lk-story", storyBlock}} {
		for _, loc := range source.re.FindAllStringIndex(clean, -1) {
			hits = append(hits, hit{loc[0], source.tag, clean[loc[0]:loc[1]]})
		}
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].at < hits[j].at })
	var blocks []cueBlock
	for _, h := range hits {
		payload, ok := jsonPayload(h.raw)
		if !ok {
			continue
		}
		var spec map[string]json.RawMessage
		if json.Unmarshal([]byte(payload), &spec) != nil || spec == nil {
			continue
		}
		var steps []json.RawMessage
		_ = json.Unmarshal(spec["steps"], &steps)
		blocks = append(blocks, cueBlock{tag: h.tag, index: len(blocks) + 1, spec: spec, steps: steps})
	}
	return blocks
}

// cueStep decodes one step as an object. A step that is not an object carries no keys.
func cueStep(raw json.RawMessage) map[string]json.RawMessage {
	var step map[string]json.RawMessage
	_ = json.Unmarshal(raw, &step)
	return step
}

// cueIsNull reports whether a value is the JSON null, or absent.
func cueIsNull(raw json.RawMessage) bool {
	t := bytes.TrimSpace(raw)
	return len(t) == 0 || string(t) == "null"
}

// isObject reports whether a value is a JSON object (not null, not an array).
func isObject(raw json.RawMessage) bool {
	t := bytes.TrimSpace(raw)
	return len(t) > 0 && t[0] == '{'
}

// nonEmptyString reports whether a value is a string with at least one character.
func nonEmptyString(raw json.RawMessage) bool {
	var s string
	return json.Unmarshal(raw, &s) == nil && s != ""
}

// hasItems reports whether a value is an array with at least one item.
func hasItems(raw json.RawMessage) bool {
	var items []json.RawMessage
	return json.Unmarshal(raw, &items) == nil && len(items) > 0
}

// cuePieceKeys are the visual pieces a story step may draw instead of a scene (explain-check's PIEZAS).
var cuePieceKeys = []string{"cards", "memory", "tables", "venn", "tree"}

// drawsScene reports whether a step draws its scene in the SVG: every walkthrough step does, and a story step
// does unless its stage names a piece (the kit's stagePiece).
func drawsScene(tag string, step map[string]json.RawMessage) bool {
	if tag == "lk-walkthrough" {
		return true
	}
	var stage map[string]json.RawMessage
	_ = json.Unmarshal(step["stage"], &stage)
	for _, key := range cuePieceKeys {
		if raw, ok := stage[key]; ok && !cueIsNull(raw) {
			return false
		}
	}
	return true
}
