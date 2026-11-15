package engine

import (
	"strings"
	"testing"

	"learning/internal/rules"
)

// The text-calculation rule (#324): a calculation written as text is refused. A calculation is a fenced block, or
// consecutive lines, with two or more lines of `<expr> = <expr>` that substitute numbers and carry an operation; it
// must be a derivation story. A single result, an inline value, a list of data without an operation, a formula
// with no numbers, a call to a function, the code of a programming language and a kit figure are not calculations.
func TestCalculoEnTextoRefusesACalculationWrittenAsText(t *testing.T) {
	on := cueThresholds(t, `{"calculoEnTexto":true}`)
	const zscore = "```text\nz = (x - μ) / σ\nz = (184 - 120) / 32\nz = 64 / 32\nz = 2\n```"
	cases := []struct {
		name string
		text string
		want int
	}{
		{"a fenced calculation of four lines", zscore, 1},
		{"the same calculation in consecutive lines", "Para x = 184 ms, la distancia al centro:\n\nz = (x - μ) / σ\nz = (184 - 120) / 32\nz = 64 / 32\nz = 2\n", 1},
		{"two lines with an operation and a result", "z = 64 / 32\nz = 2\n", 1},
		{"a bulleted calculation", "- z = 64 / 32\n- z = 2\n", 1},
		{"a calculation split by a blank line", "z = 64 / 32\n\nz = 2\n", 1},
		{"a calculation in a page's pre block, as the translated note reads it", "`z = 64 / 32\nz = 2`", 1},
		{"a single result", "z = 2\n", 0},
		{"an inline value in a sentence", "Para x = 184 ms, la distancia al centro: z = 2, y listo.\n", 0},
		{"a list of data without an operation", "```text\nμ = 120\nσ = 32\n```", 0},
		{"a formula with no numbers", "z = (x - μ) / σ\nf(x) = 2x + 1\n", 0},
		{"code in a programming-language fence", "```python\nz = (184 - 120) / 32\nz2 = 64 / 32\n```", 0},
		{"a call to a function", "```\nx = foo(1)\ny = bar(2)\n```", 0},
		{"a calculation cut by a sentence", "z = 64 / 32\n\nEntonces, la respuesta es esta:\n\nz = 2\n", 0},
		{"a derivation story of the same calculation", cueStory("derivation", cueSummary, "", 3, false), 0},
	}
	for _, c := range cases {
		if got := calculoEnTextoFindings(c.text, on); len(got) != c.want {
			t.Errorf("%s: %d finding(s) %v, want %d", c.name, len(got), got, c.want)
		}
	}
}

// The finding names the story the calculation has to be: a derivation story with its summary card.
func TestCalculoEnTextoNamesTheDerivationStoryItMustBe(t *testing.T) {
	on := cueThresholds(t, `{"calculoEnTexto":true}`)
	got := calculoEnTextoFindings("```text\nz = (184 - 120) / 32\nz = 64 / 32\nz = 2\n```", on)
	if len(got) != 1 || !strings.Contains(got[0], `<lk-story kind="derivation">`) || !strings.Contains(got[0], "summary") {
		t.Fatalf("finding %v, want one naming the derivation story and its summary", got)
	}
}

// The rule is additive (#324): a rules snapshot that does not declare `calculoEnTexto` keeps the parts it accepted,
// and the production rules declare it.
func TestCalculoEnTextoFrozenSnapshotKeepsAcceptingIt(t *testing.T) {
	text := "z = 64 / 32\nz = 2\n"
	if got := calculoEnTextoFindings(text, productionThresholds(t)); len(got) != 1 {
		t.Fatalf("the production rules accept a calculation written as text: %v", got)
	}
	doc, err := rules.Load(snapshotWithout(t, "calculoEnTexto"))
	if err != nil {
		t.Fatal(err)
	}
	if got := calculoEnTextoFindings(text, *doc.Thresholds.PartStandard); len(got) != 0 {
		t.Fatalf("a frozen snapshot refuses a calculation it accepted: %v", got)
	}
}
