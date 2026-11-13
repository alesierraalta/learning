package engine

import (
	"encoding/json"
	"regexp"
	"strings"
)

// storyQualityDoc reads the two things the story-quality rules measure (#243):
// the line the header of every step carries and the vocabulary its stage draws.
// The stage is read as a map of raw keys so a vocabulary key the engine does not
// know still counts as something drawn: the rule refuses a row of boxes, and it
// never refuses a step that draws more than that.
type storyQualityDoc struct {
	Kind    string `json:"kind"`
	Title   string `json:"title"`
	Formula *struct {
		Atoms []json.RawMessage `json:"atoms"`
	} `json:"formula"`
	Steps []struct {
		Title    string `json:"title"`
		Equation *struct {
			Atoms []json.RawMessage `json:"atoms"`
		} `json:"equation"`
		Stage map[string]json.RawMessage `json:"stage"`
	} `json:"steps"`
}

// storyVocabulary is what a story step draws when it draws an action: the pieces
// of the scene language and the four visual pieces. A step that draws none of
// them draws only boxes with text.
var storyVocabulary = []string{
	"actors", "props", "moves", "tags", "icons", "callouts", "curves", "paths",
	"formulas", "formula", "grids", "sheets", "bars", "stats", "nodes", "badges",
	"dashed", "policy", "arrows",
}

// storyPieces are the visual pieces a step may draw instead of a scene.
var storyPieces = []string{"cards", "memory", "tables", "venn", "tree"}

// declared reports whether the author wrote something under a key: an absent key,
// an empty array and an empty object draw nothing.
func declared(raw json.RawMessage) bool {
	value := strings.TrimSpace(string(raw))
	return value != "" && value != "null" && value != "[]" && value != "{}"
}

// storyStepDrawsAction reports whether a step draws the action: a piece, or a
// scene with any of the vocabulary that is not a box with text.
func storyStepDrawsAction(stage map[string]json.RawMessage) bool {
	for _, key := range storyPieces {
		if declared(stage[key]) {
			return true
		}
	}
	scene := stage
	if raw, ok := stage["scene"]; ok && declared(raw) {
		var inner map[string]json.RawMessage
		if json.Unmarshal(raw, &inner) == nil {
			scene = inner
		}
	}
	for _, key := range storyVocabulary {
		if declared(scene[key]) {
			return true
		}
	}
	return false
}

// storyActor is the part of an actor the character rule reads (#245): its name
// and the character it draws. `kind` is the name the kit documents; `icon` is its
// older alias, and both draw the same character.
type storyActor struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Kind  string `json:"kind"`
	Icon  string `json:"icon"`
	State string `json:"state"`
	Tag   string `json:"tag"`
}

// character returns the character the actor draws, or "" when it is a box.
func (a storyActor) character() string {
	if a.Kind != "" {
		return a.Kind
	}
	return a.Icon
}

// storyStepActors returns the actors a step draws, whether the step declares its
// stage as the scene itself or under `scene`.
func storyStepActors(stage map[string]json.RawMessage) []storyActor {
	scene := stage
	if raw, ok := stage["scene"]; ok && declared(raw) {
		var inner map[string]json.RawMessage
		if json.Unmarshal(raw, &inner) == nil {
			scene = inner
		}
	}
	raw, ok := scene["actors"]
	if !ok {
		return nil
	}
	var actors []storyActor
	if json.Unmarshal(raw, &actors) != nil {
		return nil
	}
	return actors
}

// storyCharacters are the characters the kit draws with `kind` (#245), each with
// the words in an actor's name that ask for it. The list is the tool's list: the
// tutor and the engine refuse the same part with the same names.
var storyCharacters = []struct {
	Kind  string
	Words *regexp.Regexp
}{
	{"database", regexp.MustCompile(`(?i)base de datos|\bbd\b|\bdisco\b|\bbase\b`)},
	{"row", regexp.MustCompile(`(?i)\bfila\b|\bregistro\b|\bcuenta\b|\btupla\b`)},
	{"session", regexp.MustCompile(`(?i)\bsesi[oó]n\b|\bconexi[oó]n\b`)},
	{"lock", regexp.MustCompile(`(?i)\bbloqueo\b|\bcerrojo\b|\btransacci[oó]n\b`)},
	{"user", regexp.MustCompile(`(?i)\busuario\b|\bpersona\b|\bcliente\b|\balumno\b`)},
	{"server", regexp.MustCompile(`(?i)\bservidor\b|\bhost\b`)},
	{"process", regexp.MustCompile(`(?i)\bproceso\b|\bprograma\b|\bbloque\b|\bscript\b`)},
	{"file", regexp.MustCompile(`(?i)\barchivo\b|\bdocumento\b|\bficha\b`)},
	{"packet", regexp.MustCompile(`(?i)\bpaquete\b|\btrama\b|\bpacket\b|\bpetici[oó]n\b|\bmensaje\b`)},
	{"robot", regexp.MustCompile(`(?i)\brobot\b|\bagente\b`)},
}

// characterFor returns the character an actor's name asks for, or "".
func characterFor(label string) string {
	for _, c := range storyCharacters {
		if c.Words.MatchString(label) {
			return c.Kind
		}
	}
	return ""
}

// storyCharacterNames lists the characters the kit draws, for the refusal.
func storyCharacterNames() string {
	names := make([]string, 0, len(storyCharacters))
	for _, c := range storyCharacters {
		names = append(names, c.Kind)
	}
	return strings.Join(names, ", ")
}

// storyQualityDocs returns the parsed payload of every story outside fenced
// code: a story inside a fence is an example of markup, not a drawing.
func storyQualityDocs(text string) []storyQualityDoc {
	var docs []storyQualityDoc
	for _, block := range storyBlock.FindAllString(withoutCodeFences(text), -1) {
		payload, ok := jsonPayload(block)
		if !ok {
			continue
		}
		var doc storyQualityDoc
		if json.Unmarshal([]byte(payload), &doc) != nil {
			continue
		}
		docs = append(docs, doc)
	}
	return docs
}

// showsCode reports whether the part teaches code: a fenced code block. The
// header rule is about the code line, which only the story can carry. A formula
// is the other half of the same idea and it is already measured: the formula rule
// (`formulaWalkthrough`) refuses the part whose first formula is not taught by a
// `<lk-story>` that carries `formula.atoms`, which is a non-empty header. Asking
// for it twice would refuse the same part with two names.
func showsCode(text string) bool {
	return proseFence.MatchString(text)
}

// ── What the bench measured (#246) ──────────────────────────────────────────
// The five parts of the bench passed every gate and taught nothing: a derivation
// that never moves, a story header written as a text-arrow flow, and a step key
// the schema never reads. The three rules read the payload, never the drawing.

// storyRawDoc is a story payload as written: the steps keep every key so the
// dead-key rule can name the ones the schema never reads.
type storyRawDoc struct {
	Kind    string                       `json:"kind"`
	Title   string                       `json:"title"`
	Formula map[string]json.RawMessage   `json:"formula"`
	Steps   []map[string]json.RawMessage `json:"steps"`
}

// storyRawDocs returns the parsed payload of every story outside fenced code.
func storyRawDocs(text string) []storyRawDoc {
	var docs []storyRawDoc
	for _, block := range storyBlock.FindAllString(withoutCodeFences(text), -1) {
		payload, ok := jsonPayload(block)
		if !ok {
			continue
		}
		var doc storyRawDoc
		if json.Unmarshal([]byte(payload), &doc) != nil {
			continue
		}
		docs = append(docs, doc)
	}
	return docs
}

// storyStageOf returns the stage of a step, the scene it draws, and whether the
// step declares `stage.scene` (a step may draw its scene directly under `stage`).
func storyStageOf(step map[string]json.RawMessage) (stage, scene map[string]json.RawMessage, nested bool) {
	stage = map[string]json.RawMessage{}
	if raw, ok := step["stage"]; ok {
		_ = json.Unmarshal(raw, &stage)
	}
	scene = stage
	if raw, ok := stage["scene"]; ok && declared(raw) {
		var inner map[string]json.RawMessage
		if json.Unmarshal(raw, &inner) == nil {
			return stage, inner, true
		}
	}
	return stage, scene, false
}
