package engine

import "testing"

// writeExplanationWithVisual writes a valid explanation whose visual is the
// given snippet (an embed or a plugin code block).
func (f *fixture) writeExplanationWithVisual(t *testing.T, part, visual string) {
	t.Helper()
	body := "---\ntipo: explicacion\nnodo: T." + part + "\nnivel: medio\n---\n# " + part +
		"\n\nExplicación con ejemplos concretos.\n\n## Ejemplo\n\nCaso numérico paso a paso.\n\n" +
		"**Fuente**: Sutton & Barto, verificación de fixture.\n\n" + visual + "\n\n## Mini-quiz\n"
	for _, q := range buildQuizQuestions(part) {
		body += "\n" + q.Enunciado + "\n"
	}
	f.write(t, f.canonicalPartFile(t, part), body)
}

// A planned visual is satisfied by an embed, by a code block of a visual
// format declared in the rules (installed Obsidian plugins and native mermaid)
// or by a declared inline element such as <svg> that Obsidian renders; empty
// blocks or elements, inline elements inside code, and undeclared formats are
// not visuals.
func TestPlannedVisualAcceptsDeclaredFormats(t *testing.T) {
	cases := []struct {
		name   string
		visual string
		ok     bool
	}{
		{"image embed", "![diagrama](diagrama.png)", true},
		{"excalidraw embed", "![[consenso.excalidraw]]", true},
		{"mermaid block", "```mermaid\nflowchart LR\n  A --> B\n```", true},
		{"desmos block", "```desmos-graph\ny = x^2\n```", true},
		{"geogebra block", "```geogebra\nA = (1, 2)\n```", true},
		{"ggb block", "```ggb\nf(x) = 2x\n```", true},
		{"datachart block", "```datachart\ntype: bar\n```", true},
		{"inline svg", `<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>`, true},
		{"multiline inline svg", "<svg viewBox=\"0 0 10 10\">\n  <rect width=\"4\" height=\"4\"/>\n</svg>", true},
		{"empty svg", "<svg viewBox=\"0 0 10 10\"></svg>", false},
		{"unclosed svg", "<svg viewBox=\"0 0 10 10\"><rect/>", false},
		{"svg inside a code block is code", "```html\n<svg><rect/></svg>\n```", false},
		{"empty mermaid block", "```mermaid\n```", false},
		{"undeclared format", "```markmap\n# Tema\n```", false},
		{"plain code is not a visual", "```go\nfmt.Println(1)\n```", false},
		{"no visual", "Texto sin visual.", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			f.readyThroughPlanning(t, 2, 6)
			f.writeExplanationWithVisual(t, "p1", tc.visual)
			rep, code := f.run(t, f.opts("validate", "explanation"))
			check, found := hasCheck(rep, "explanation-content")
			if !found {
				t.Fatalf("explanation-content check missing: %+v", rep.Checks)
			}
			if tc.ok && (check.Status != "PASS" || code != 0) {
				t.Fatalf("visual %q rejected: %s (exit %d)", tc.visual, check.Reason, code)
			}
			if !tc.ok && (check.Status != "FAIL" || code != 1) {
				t.Fatalf("visual %q accepted: %s (exit %d)", tc.visual, check.Reason, code)
			}
		})
	}
}
