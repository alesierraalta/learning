package engine

import "testing"

// The display formulas of the text-calculation rule (#324, decision 4): two or more consecutive display formulas
// (`$$…$$`, `\[…\]`, `<lk-math display>`) that substitute numbers and carry an operation are a calculation written
// as formulas. A single formula, a formula with its values in one line, symbolic formulas, two results with no
// operation, formulas split by prose or by a label, and display markup inside a text fence are not.
func TestCalculoEnTextoRefusesDisplayFormulasInARun(t *testing.T) {
	on := cueThresholds(t, `{"calculoEnTexto":true}`)
	cases := []struct {
		name string
		text string
		want int
	}{
		{"two display formulas that substitute and operate", "\\[\nG=0+0.9(1)+0.9^2(10)\n\\]\n\n\\[\nG=9\n\\]", 1},
		{"two dollar formulas that operate", "$$V=6+0.1(10-6)$$\n\n$$V=6.4$$", 1},
		{"two lk-math display formulas that operate", "<lk-math display>z = 64 / 32</lk-math>\n<lk-math display>z = 2</lk-math>", 1},
		{"a display formula split over lines, with its fraction", "\\[\nV(Pasillo)\n=\n\\frac{10+4+7+11}{4}\n\\]\n\n\\[\nV(Pasillo)=8\n\\]", 1},
		{"units and a fraction in two forms of display", "\\[ 184\\,\\text{ms} - 120\\,\\text{ms} = 64\\,\\text{ms} \\]\n\n$$\\frac{64}{32} = 2$$", 1},
		{"Greek symbols with their numbers substituted", "\\[ \\mu+2\\sigma = 120+2\\cdot 32 \\]\n\n\\[ \\mu+2\\sigma = 184 \\]", 1},
		{"a symbolic formula, then two calculations", "\\[\nz = \\frac{x-\\mu}{\\sigma}\n\\]\n\n\\[\nz = \\frac{184-120}{32}\n\\]\n\n\\[\nz = 2\n\\]", 1},
		{"a single display formula with its values in one line", "$$f(184) = \\frac{1}{32\\sqrt{2\\pi}}\\,e^{-\\frac{(184-120)^2}{2\\cdot 32^2}} \\approx 0{,}00065$$", 0},
		{"a single lk-math display formula", "<lk-math display>z = 64 / 32</lk-math>\n", 0},
		{"a formula and its value line", "$$f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\,e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}$$\n\n$$f(184) = \\frac{1}{32\\sqrt{2\\pi}}\\,e^{-\\frac{(184-120)^2}{2\\cdot 32^2}}$$", 0},
		{"two results with no operation", "\\[ G=9 \\]\n\n\\[ G=9.0 \\]", 0},
		{"display formulas split by prose", "\\[ G=0+0.9(1)+0.9^2(10) \\]\n\nDespués:\n\n\\[ G=9 \\]", 0},
		{"two calculations split by a label", "\\[\nV=6+0.1(10-6)\n\\]\n\nError:\n\n\\[\nV=6.4\n\\]", 0},
		{"a chain of equalities in one display", "\\[ x + 2 = 3 \\;\\Longrightarrow\\; x = 3 - 2 \\;\\Longrightarrow\\; x = 1 \\]", 0},
		{"a display formula and a text line", "$$z = 64 / 32$$\nz = 2", 0},
		{"display markup inside a text fence", "```text\n\\[ G=0+0.9(1) \\]\n\n\\[ G=9 \\]\n```", 0},
		{"symbolic display formulas only", "$$z = \\frac{x-\\mu}{\\sigma}$$\n\n$$f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}$$", 0},
	}
	for _, c := range cases {
		if got := calculoEnTextoFindings(c.text, on); len(got) != c.want {
			t.Errorf("%s: %d finding(s) %v, want %d", c.name, len(got), got, c.want)
		}
	}
}
