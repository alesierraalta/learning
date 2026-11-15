package engine

import "testing"

// formulaSpotStory is a formula story of three steps with its formula in the header: the formula the part teaches.
const formulaSpotStory = `<lk-story>
<script type="application/json">
{"kind":"formula","title":"La densidad","viewBox":"0 0 360 250","formula":{"size":18,"atoms":[{"t":"f","id":"f"},{"t":"(","id":"open"},{"t":"x","id":"x"},{"t":")","id":"close"}]},"steps":[
 {"title":"La fórmula entera","focus":[],"narrator":"Una fórmula.","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la campana"}]}}},
 {"title":"f","focus":["f"],"narrator":"La densidad.","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la altura"}]}}},
 {"title":"x","focus":["x"],"narrator":"El punto.","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la latencia"}]}}}
]}
</script>
</lk-story>`

// A formula story is a formula the part teaches: it is the first formula spot of the part when it comes first, and
// the rule accepts the part because the story teaches it (#324). The engine read a story block as having no formula,
// because the scene and walkthrough reader only walked the blocks of the whole text, so a bare display formula after the
// story was taken for the first formula and refused. explain-check reads the story and accepts the part.
func TestAFormulaStoryIsTheFirstFormulaSpot(t *testing.T) {
	on := cueThresholds(t, `{"formulaWalkthrough":true}`)
	bare := "<lk-math display>f(184) = 0</lk-math>"
	cases := []struct {
		name string
		text string
		want int
	}{
		{"a formula story, then a bare display formula", formulaSpotStory + "\n\n" + bare + "\n", 0},
		{"a bare display formula alone", bare + "\n", 1},
		{"a formula story alone", formulaSpotStory + "\n", 0},
	}
	for _, c := range cases {
		if got := formulaWalkthroughFindings(c.text, on); len(got) != c.want {
			t.Errorf("%s: %d finding(s) %v, want %d", c.name, len(got), got, c.want)
		}
	}
}
