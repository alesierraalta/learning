package engine

import (
	"strings"
	"testing"

	"learning/internal/rules"
)

// storyWithKeys is a three-step derivation. `extra` is a JSON fragment for the payload's
// top level (a closing `summary`, with its trailing comma, or nothing); `middle` is a JSON
// fragment for the middle step's keys (`facts`, with its trailing comma, or nothing).
func storyWithKeys(extra, middle string) string {
	actors := `"actors":[{"id":"cli","x":60,"y":90,"w":130,"h":60,"label":"Cliente","tone":"blue"},{"id":"srv","x":300,"y":90,"w":130,"h":60,"label":"Servidor","tone":"green"}]`
	return "<lk-story>\n<script type=\"application/json\">\n" +
		`{"kind":"derivation","title":"Un saludo",` + extra + `"steps":[` +
		`{"title":"Uno","narrator":"El cliente abre.","stage":{"scene":{` + actors + `,"moves":[{"from":"cli","to":"srv","verb":"abre"}]}}},` +
		`{"title":"Dos","narrator":"El servidor responde.",` + middle + `"stage":{"scene":{` + actors + `,"moves":[{"from":"srv","to":"cli","verb":"responde"}]}}},` +
		`{"title":"Tres","narrator":"Listo.","stage":{"scene":{` + actors + `,"marks":[{"kind":"ok","actors":["cli"]}]}}}` +
		"]}\n</script>\n</lk-story>\n"
}

var deadKeysOn = rules.PartStandardThresholds{DeadKeys: true}

// A story step may carry `facts` (#301): the engine reads the step keys strictly (#246),
// so a key the schema does not know is refused, and `facts` must be one it knows.
func TestStoryStepFactsIsAKeyTheSchemaReads(t *testing.T) {
	facts := `"facts":[["puerto","443"],["paquetes","3"]],`
	if findings := deadKeyFindings(storyWithKeys("", facts), deadKeysOn); len(findings) != 0 {
		t.Fatalf("the engine refuses a step's facts as a dead key: %v", findings)
	}
}

// The closing summary sits beside the steps, not in them: the dead-key rule does not
// read the payload's top level, so a summary is never a dead key.
func TestStorySummaryIsNotADeadKey(t *testing.T) {
	summary := `"summary":{"title":"Cierre","metrics":[["paquetes","3"]]},`
	if findings := deadKeyFindings(storyWithKeys(summary, ""), deadKeysOn); len(findings) != 0 {
		t.Fatalf("the engine refuses a story's summary as a dead key: %v", findings)
	}
}

// The guard that the rule still works: a step key nobody reads is still refused.
func TestStoryStepUnknownKeyStillIsADeadKey(t *testing.T) {
	findings := deadKeyFindings(storyWithKeys("", `"hecho":"x",`), deadKeysOn)
	if len(findings) != 1 || !strings.Contains(findings[0], "`hecho`") {
		t.Fatalf("an unknown step key is no longer refused: %v", findings)
	}
}
