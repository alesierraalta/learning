package engine

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"learning/internal/rules"
)

// The character rule (#261): an actor's character contradicts its tag. A server, a
// document or a database drawn for a group of people or for a test result is a finding,
// and so is a person drawn for a server. The engine reads the same small lexicon as
// `tools/explain-check.mjs` (`personaje-sin-sentido`) and must refuse the same parts.

// characterStory is one derivation step with one actor of the given character and tag.
func characterStory(kind, tag string) string {
	return "<lk-story>\n<script type=\"application/json\">\n" +
		`{"kind":"derivation","title":"Un grupo","viewBox":"0 0 360 300","steps":[` +
		`{"title":"Uno","narrator":"Uno.","stage":{"scene":{"actors":[{"id":"g","kind":"` + kind +
		`","x":110,"y":150,"size":56,"tone":"blue","tag":"` + tag + `"}]}}}` +
		"]}\n</script>\n</lk-story>\n"
}

func TestPartStandardRefusesACharacterThatContradictsItsTag(t *testing.T) {
	cases := []struct {
		name, kind, tag string
		refused         bool
	}{
		{"a server for a group of people", "server", "9 enfermos", true},
		{"a document for a test result", "file", "108 positivos", true},
		{"a doc for a test result", "doc", "108 positivos", true},
		{"a database for a test", "database", "la prueba", true},
		{"a person for a server", "user", "Servidor", true},
		{"a person for a group of people", "user", "9 enfermos", false},
		{"a server for a server", "server", "Servidor", false},
		{"a robot for a client", "robot", "Cliente", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			findings := characterSenseFindings(characterStory(tc.kind, tc.tag), rules.PartStandardThresholds{CharacterSense: true})
			if (len(findings) > 0) != tc.refused {
				t.Fatalf("findings = %v, want refused=%v", findings, tc.refused)
			}
			if tc.refused && !strings.Contains(findings[0], "«"+tc.kind+"»") {
				t.Fatalf("finding %q does not name the character «%s»", findings[0], tc.kind)
			}
		})
	}
}

// A frozen snapshot that does not declare `characterSense` keeps accepting the part.
func TestPartStandardCharacterRuleIsAdditive(t *testing.T) {
	if findings := characterSenseFindings(characterStory("server", "9 enfermos"), rules.PartStandardThresholds{}); len(findings) != 0 {
		t.Fatalf("a snapshot without the key refused the part: %v", findings)
	}
}

// The engine and the tutor's tool agree on the character rule, part by part: the same
// verdict on the bench, on the Bayes example and on a clean kit example.
func TestPartStandardReadsTheCharacterRuleLikeExplainCheck(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	tool, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{
		filepath.Join(bench261, "tcp-handshake.md"),
		filepath.Join(bench261, "bayes-theorem.md"),
		"../../integrations/pi/kit/examples/bayes-mil-personas.md",
		"../../integrations/pi/kit/examples/plsql-transaccion.md",
	} {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		out, _ := exec.Command(node, tool, path, "--json").Output()
		toolOK := explainCheckRows(t, path, out)["personaje-sin-sentido"]
		engineOK := len(characterSenseFindings(string(raw), rules.PartStandardThresholds{CharacterSense: true})) == 0
		if toolOK != engineOK {
			t.Fatalf("%s: personaje-sin-sentido is ok=%v in explain-check and ok=%v in the engine", path, toolOK, engineOK)
		}
	}
}

// explainCheckRows reads the verdict of every rule from the tool's JSON, by rule name.
func explainCheckRows(t *testing.T, path string, out []byte) map[string]bool {
	t.Helper()
	var report struct {
		Rows []struct {
			Rule string `json:"rule"`
			Ok   bool   `json:"ok"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(out, &report); err != nil {
		t.Fatalf("explain-check printed no JSON for %s: %v\n%s", path, err, out)
	}
	rows := map[string]bool{}
	for _, row := range report.Rows {
		rows[row.Rule] = row.Ok
	}
	return rows
}
