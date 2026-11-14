package engine

import (
	"fmt"
	"strings"
	"testing"
)

// storyDerivation is a three-step derivation whose middle step takes `focus` (a
// JSON fragment such as `"focus":"srv",`, or nothing). Every step draws a move or
// a mark, so the only thing the focus can change is whether the payload parses.
func storyDerivation(focus string) string {
	actors := `"actors":[{"id":"cli","x":60,"y":90,"w":130,"h":60,"label":"Cliente","tone":"blue"},{"id":"srv","x":300,"y":90,"w":130,"h":60,"label":"Servidor","tone":"green"}]`
	return "<lk-story>\n<script type=\"application/json\">\n" +
		`{"kind":"derivation","title":"Un saludo","steps":[` +
		`{"title":"Uno","narrator":"El cliente abre.","stage":{"scene":{` + actors + `,"moves":[{"from":"cli","to":"srv","verb":"abre"}]}}},` +
		`{"title":"Dos",` + focus + `"narrator":"El servidor responde.","stage":{"scene":{` + actors + `,"moves":[{"from":"srv","to":"cli","verb":"responde"}]}}},` +
		`{"title":"Tres","narrator":"Listo.","stage":{"scene":{` + actors + `,"marks":[{"kind":"ok","actors":["cli"]}]}}}` +
		"]}\n</script>\n</lk-story>\n"
}

// storyFormula is a three-step formula whose middle step takes `focus` the same way.
func storyFormula(focus string) string {
	stage := `"stage":{"scene":{"actors":[{"id":"cli","x":60,"y":90,"w":130,"h":60,"label":"Cliente","tone":"blue"}]}}`
	return "<lk-story>\n<script type=\"application/json\">\n" +
		`{"kind":"formula","title":"Una fórmula","formula":{"atoms":[{"t":"f","id":"f"},{"t":"(x)","id":"x"}]},"steps":[` +
		`{"title":"Uno","narrator":"Es f entera.",` + stage + `},` +
		`{"title":"Dos",` + focus + `"narrator":"Es x.",` + stage + `},` +
		`{"title":"Tres","focus":["x"],"narrator":"Fin.",` + stage + `}` +
		"]}\n</script>\n</lk-story>\n"
}

func problemMentions(problems []string, part string) bool {
	for _, p := range problems {
		if strings.Contains(p, part) {
			return true
		}
	}
	return false
}

// A step may ring one piece of its stage with `focus: "<id>"` (#299). The payload
// must parse with the string as well as without it: a string focus used to make the
// whole story "not valid JSON", and the part was refused for a rule it does not break.
func TestStoryStepFocusAcceptsAPieceString(t *testing.T) {
	_, withFocus := storyProgressiveProblems(storyDerivation(`"focus":"srv",`))
	_, plain := storyProgressiveProblems(storyDerivation(""))
	if fmt.Sprint(withFocus) != fmt.Sprint(plain) {
		t.Fatalf("a piece focus changes the story's findings:\n with focus: %v\n without:    %v", withFocus, plain)
	}
}

// The formula rule counts the tokens a middle step highlights, and a list is the
// token form. A string names a piece, so a middle step that only rings a piece
// still focuses no symbol; a list of tokens does not get that finding.
func TestStoryFormulaFocusCountsTokensOnly(t *testing.T) {
	_, pieceOnly := storyProgressiveProblems(storyFormula(`"focus":"cli",`))
	if !problemMentions(pieceOnly, "focuses no symbol") {
		t.Fatalf("a middle step that rings a piece is taken for a token focus: %v", pieceOnly)
	}
	_, tokens := storyProgressiveProblems(storyFormula(`"focus":["x"],`))
	if problemMentions(tokens, "focuses no symbol") {
		t.Fatalf("a middle step with a token list is refused as focusing no symbol: %v", tokens)
	}
}
