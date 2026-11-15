package engine

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// The walkthrough cap (#324): a derivation story is a worked calculation, not a walkthrough deck. A part carries its
// formula story and one derivation per calculation. A classic walkthrough and a formula story are decks, and a second
// one is refused. A story whose payload does not read is a deck, because it is not known to be a derivation.
func TestWalkthroughCapDoesNotCountDerivationStories(t *testing.T) {
	one := cueThresholds(t, `{"maxWalkthroughs":1}`)
	formula := cueStory("formula", cueSummary, "", 3, false)
	derivation := cueStory("derivation", cueSummary, "", 3, false)
	walk := cueWalk(3, cueSummary, "")
	unreadable := "<lk-story>\n<script type=\"application/json\">\n{not json}\n</script>\n</lk-story>"
	unclosed := "<lk-story>\n<script type=\"application/json\">\n{\"kind\":\"derivation\",\"steps\":[]}\n</script>"
	cases := []struct {
		name string
		text string
		want int
	}{
		{"a formula story and two derivations", formula + "\n\n" + derivation + "\n\n" + derivation, 0},
		{"a classic walkthrough and a derivation", walk + "\n\n" + derivation, 0},
		{"a derivation alone", derivation, 0},
		{"a classic walkthrough and a formula story", walk + "\n\n" + formula, 1},
		{"two classic walkthroughs", walk + "\n\n" + walk, 1},
		{"a formula story and a story whose payload does not read", formula + "\n\n" + unreadable, 1},
		{"a formula story and a derivation with no closing tag", formula + "\n\n" + unclosed, 1},
	}
	for _, c := range cases {
		if got := walkthroughFindings(c.text, one); len(got) != c.want {
			t.Errorf("%s: %d finding(s) %v, want %d", c.name, len(got), got, c.want)
		}
	}
}

// The live part's shape (#324): the gaussian formula story and the two z-score calculations as derivation stories,
// with their facts, summary and ring. The explanation standard passes it, and its derivations are not decks.
func TestZscoreFixturePassesTheExplanationStandard(t *testing.T) {
	raw, err := os.ReadFile("testdata/zscore-parte-1.md")
	if err != nil {
		t.Fatal(err)
	}
	f := standardFrontier(t)
	f.writePartNote(t, string(raw))
	rep, code, c := standardCheck(t, f)
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS (exit %d): %+v", c.Status, c.Reason, code, rep.Checks)
	}
	if !strings.Contains(c.Reason, "1 walkthrough(s) (limit 1)") {
		t.Fatalf("the shape does not count one deck for the fixture: %s", c.Reason)
	}
}

// Derivation stories are not prose: their payload does not count toward the prose budget, however long the narration.
func TestDerivationStoriesDoNotInflateTheProseBudget(t *testing.T) {
	plain := "Imagina un valor. Su centro es fijo.\n\n"
	loud := strings.Repeat("palabra ", 200)
	story := `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"T","viewBox":"0 0 360 230","steps":[{"title":"Uno","narrator":"` + loud + `","stage":{"scene":{"actors":[{"id":"a","x":10,"y":10,"w":40,"h":40,"label":"a","tone":"slate"}]}}}]}
</script>
</lk-story>`
	if got, want := proseWords(plain+story), proseWords(plain); got != want {
		t.Fatalf("a derivation story adds %d prose word(s), want none", got-want)
	}
}

// The cap and the formula rule agree with explain-check (#324): on the cap's shapes, on a formula story that comes before
// a bare formula, and on the fixture the live part is built from. The engine and the tool give the same verdict per rule.
func TestCapAndFormulaRulesAgreeWithExplainCheck(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	toolPath, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	th := productionThresholds(t)
	formula := cueStory("formula", cueSummary, "", 3, false)
	derivation := cueStory("derivation", cueSummary, "", 3, false)
	walk := cueWalk(3, cueSummary, "")
	bare := "<lk-math display>f(184) = 0</lk-math>"
	notes := map[string]string{
		"a formula story and two derivations":       formula + "\n\n" + derivation + "\n\n" + derivation,
		"a classic walkthrough and a derivation":    walk + "\n\n" + derivation,
		"a derivation alone":                        derivation,
		"a classic walkthrough and a formula story": walk + "\n\n" + formula,
		"two classic walkthroughs":                  walk + "\n\n" + walk,
		"a formula story, then a bare display":      formulaSpotStory + "\n\n" + bare + "\n",
		"a bare display alone":                      bare + "\n",
	}
	raw, err := os.ReadFile("testdata/zscore-parte-1.md")
	if err != nil {
		t.Fatal(err)
	}
	notes["the zscore fixture"] = string(raw)
	for name, text := range notes {
		file := filepath.Join(t.TempDir(), "nota.md")
		if err := os.WriteFile(file, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
		tool := explainCueRows(t, node, toolPath, file)
		engine := map[string]bool{
			"recorrido":           len(walkthroughFindings(text, th)) == 0,
			"formula-walkthrough": len(formulaWalkthroughFindings(text, th)) == 0,
		}
		for rule, want := range engine {
			if got, ok := tool[rule]; !ok || got != want {
				t.Errorf("%s: %s is ok=%v in explain-check and ok=%v in the engine", name, rule, got, want)
			}
		}
	}
}
