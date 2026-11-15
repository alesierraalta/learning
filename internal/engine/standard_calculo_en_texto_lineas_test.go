package engine

import "testing"

// The lines of one display and the bare <lk-math> run (#324, items 1 and 2). Inside one display every line of a
// `\\`-broken formula (aligned, align, array, gathered, or any display with line breaks) is a line: two calculation
// lines are a calculation. Two or more consecutive <lk-math> elements alone on their own lines, that substitute and
// operate, are a run of formulas, like the display formulas. One <lk-math> is a formula; one inside a sentence, with a
// full stop after it, or quoted in code is not a bare element alone on its line.
func TestCalculoEnTextoCountsTheLinesOfOneDisplay(t *testing.T) {
	on := cueThresholds(t, `{"calculoEnTexto":true}`)
	cases := []struct {
		name string
		text string
		want int
	}{
		{"three calculation lines in one aligned display", `\[
\begin{aligned}
V(0,2)&=-0{,}04+0{,}9\cdot0{,}6206\\
&=-0{,}04+0{,}55854\\
&=+0{,}51854\approx+0{,}5185
\end{aligned}
\]`, 1},
		{"an align whose lines start with = takes the left side of the line above", `$$\begin{align} a &= 2+3 \\ &= 5 \end{align}$$`, 1},
		{"an array with its column spec", `\[ \begin{array}{rcl} a &=& 2+3 \\ &=& 5 \end{array} \]`, 1},
		{"a gathered display of two calculations", `\[ \begin{gathered} 2+3=5 \\ 5+5=10 \end{gathered} \]`, 1},
		{"nonumber and label are not part of the calculation", `\[ \begin{align} a &= 2+3 \nonumber \\ &= 5 \label{eq:5} \end{align} \]`, 1},
		{"a calculation line and a symbolic line", `\[ \begin{aligned} z &= \frac{x-\mu}{\sigma} \\ z &= \frac{184-120}{32} \end{aligned} \]`, 0},
		{"two symbolic lines", `\[ \begin{aligned} V(s) &= \sum_{s'} P(s'\mid s)\,r \\ &= R(s) \end{aligned} \]`, 0},
		{"two result lines without an operation", `\[ \begin{aligned} x &= 5 \\ y &= 6 \end{aligned} \]`, 0},
		{"one calculation line in an aligned display", `\[ \begin{aligned} V(0,2) &= -0{,}04+0{,}9\cdot0{,}6206 \end{aligned} \]`, 0},
		{"HTML entities in an aligned display", `<lk-math display>\begin{aligned}a&amp;=2+3\\&amp;=5\end{aligned}</lk-math>`, 1},
		{"a product with cdot glued to its figure is an operation", `\[ G = 0{,}9\cdot10 \]` + "\n\n" + `\[ G = 9 \]`, 1},
		{"a no-break space inside a formula is a space", "$$2\u00a0+\u00a03 = 5$$\n$$5 + 5 = 10$$", 1},
	}
	for _, c := range cases {
		if got := calculoEnTextoFindings(c.text, on); len(got) != c.want {
			t.Errorf("%s: %d finding(s) %v, want %d", c.name, len(got), got, c.want)
		}
	}
}

// The bare <lk-math> run (#324, item 2): the elements alone on their own lines count like display formulas.
func TestCalculoEnTextoCountsBareLkMathRuns(t *testing.T) {
	on := cueThresholds(t, `{"calculoEnTexto":true}`)
	cases := []struct {
		name string
		text string
		want int
	}{
		{"two bare calculations on consecutive lines", "<lk-math>2 + 3 = 5</lk-math>\n<lk-math>5 + 5 = 10</lk-math>\n", 1},
		{"two bare calculations with a blank line between", "<lk-math>2 + 3 = 5</lk-math>\n\n<lk-math>5 + 5 = 10</lk-math>\n", 1},
		{"a single bare calculation", "<lk-math>2 + 3 = 5</lk-math>\n", 0},
		{"two bare elements inside one sentence", "Así, <lk-math>2 + 3 = 5</lk-math> y <lk-math>5 + 5 = 10</lk-math> dan 15.\n", 0},
		{"a bare element, a sentence and a bare element", "<lk-math>2 + 3 = 5</lk-math>\n\nDespués:\n\n<lk-math>5 + 5 = 10</lk-math>\n", 0},
		{"bare elements in a list", "- <lk-math>2 + 3 = 5</lk-math>\n- <lk-math>5 + 5 = 10</lk-math>\n", 1},
		{"symbolic bare elements", "<lk-math>z = \\frac{x-\\mu}{\\sigma}</lk-math>\n<lk-math>f(x) = 2x + 1</lk-math>\n", 0},
		{"two results without an operation", "<lk-math>G = 9</lk-math>\n<lk-math>G = 9.0</lk-math>\n", 0},
		{"bare elements inside a text fence", "```text\n<lk-math>2 + 3 = 5</lk-math>\n<lk-math>5 + 5 = 10</lk-math>\n```\n", 0},
		{"a bare element with a full stop after it is prose", "<lk-math>2 + 3 = 5</lk-math>.\n<lk-math>5 + 5 = 10</lk-math>.\n", 0},
		{"bare elements quoted in code spans", "`<lk-math>2 + 3 = 5</lk-math>`\n`<lk-math>5 + 5 = 10</lk-math>`\n", 0},
		{"a bare element followed by a display calculation", "$$2 + 3 = 5$$\n<lk-math>5 + 5 = 10</lk-math>\n", 1},
		{"one bare element with two calculation lines", `<lk-math>\begin{aligned}a&=2+3\\&=5\end{aligned}</lk-math>`, 1},
	}
	for _, c := range cases {
		if got := calculoEnTextoFindings(c.text, on); len(got) != c.want {
			t.Errorf("%s: %d finding(s) %v, want %d", c.name, len(got), got, c.want)
		}
	}
}
