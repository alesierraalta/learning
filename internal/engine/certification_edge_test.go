package engine

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const probeVisuals = "![uno](uno.png)\n\nCómo leerlo: el primer bloque.\n\n![dos](dos.png)\n\nCómo leerlo: el segundo bloque.\n\n"

// TSP probes: each one asserts a promise the docs make, not today's output.

func (f *fixture) writeProbePart(t *testing.T, part, visual string) string {
	t.Helper()
	body := "---\ntipo: explicacion\nnodo: T." + part + "\nnivel: medio\n---\n# " + part +
		"\n\nExplicación con ejemplos concretos.\n\n## Ejemplo\n\nCaso numérico paso a paso.\n\n" +
		"**Fuente**: Sutton & Barto, verificación de fixture.\n\n" + visual + "\n\n## Mini-quiz\n"
	for _, q := range buildQuizQuestions(part) {
		body += "\n" + q.Enunciado + "\n"
	}
	rel := f.canonicalPartFile(t, part)
	f.write(t, rel, body)
	f.linkPartInIndex(t, rel)
	return filepath.Join(f.ws, rel)
}

// A guide separated by two blank lines is still "the next non-blank line".
func TestTSPGuideAfterBlankLinesPasses(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeProbePart(t, "p1", "```mermaid\nflowchart LR\n  A-->B\n```\n\n\nCómo leerlo: de izquierda a derecha.\n\n"+
		"![detalle](detalle.png)\n\nCómo leerlo: el detalle del bloque.\n")
	rep, _ := f.run(t, f.opts("advance", "explanation"))
	if got := failReason(rep, "explanation-content"); got != "" {
		t.Fatalf("a guide after two blank lines must count: %s", got)
	}
}

// Two visuals where only the second carries its guide is one missing guide.
func TestTSPTwoVisualsOneGuideFails(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeProbePart(t, "p1", "![uno](uno.png)\n\n![dos](dos.png)\n\nCómo leerlo: solo el segundo.\n")
	rep, _ := f.run(t, f.opts("advance", "explanation"))
	if got := failReason(rep, "explanation-content"); !strings.Contains(got, "reading guide") {
		t.Fatalf("the first visual has no guide and must be reported: %q", got)
	}
}

// A guide on the same line as the visual is not "on the next line".
func TestTSPGuideOnTheSameLineFails(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeProbePart(t, "p1", "<svg viewBox=\"0 0 10 10\"><rect width=\"4\" height=\"4\"/></svg> Cómo leerlo: pegado.\n\n"+
		"![dos](dos.png)\n\nCómo leerlo: el segundo bloque.\n")
	rep, _ := f.run(t, f.opts("advance", "explanation"))
	if got := failReason(rep, "explanation-content"); !strings.Contains(got, "reading guide") {
		t.Fatalf("a same-line guide does not follow the visual and must be reported: %q", got)
	}
}

// An empty fenced block is not a visual: it renders nothing.
func TestTSPEmptyVisualBlockDoesNotCount(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeProbePart(t, "p1", "```mermaid\n   \n```\n\nCómo leerlo: vacío.\n")
	rep, _ := f.run(t, f.opts("advance", "explanation"))
	if got := failReason(rep, "explanation-content"); got == "" {
		t.Fatalf("an empty visual block renders nothing and must not satisfy the promise")
	}
}

// An embed inside a code fence is code, not a rendered image.
func TestTSPEmbedInsideFenceDoesNotCount(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeProbePart(t, "p1", "```markdown\n![falso](falso.png)\n```\n\nCómo leerlo: es código.\n")
	rep, _ := f.run(t, f.opts("advance", "explanation"))
	if got := failReason(rep, "explanation-content"); got == "" {
		t.Fatalf("an embed inside a fence is not rendered and must not count")
	}
}

// A walkthrough whose payload does not parse renders nothing, so the part has no
// working demo: the promise "the part has an interactive demo" is not met.
func TestTSPBrokenDeckPayloadFailsTheDemoPromise(t *testing.T) {
	f := demoThroughPlanning(t)
	part := probeVisuals + "<lk-walkthrough>\n<script type=\"application/json\">{\"title\": \"roto\", \"steps\": [</script>\n</lk-walkthrough>\n\nCómo leerlo: un recorrido.\n"
	f.writeProbePart(t, "p1", part)
	rep, _ := f.run(t, f.opts("advance", "explanation"))
	if got := failReason(rep, "demo-part"); got == "" {
		t.Fatalf("a walkthrough with an unparseable payload renders nothing and must not pass")
	}
}

// A deck with no steps renders an empty frame: same promise, same consequence.
func TestTSPEmptyDeckFailsTheDemoPromise(t *testing.T) {
	f := demoThroughPlanning(t)
	part := probeVisuals + "<lk-walkthrough>\n<script type=\"application/json\">{\"title\": \"vacío\", \"steps\": []}</script>\n</lk-walkthrough>\n\nCómo leerlo: un recorrido.\n"
	f.writeProbePart(t, "p1", part)
	rep, _ := f.run(t, f.opts("advance", "explanation"))
	if got := failReason(rep, "demo-part"); got == "" {
		t.Fatalf("a deck without steps renders nothing and must not pass")
	}
}

// The word budget is inclusive: exactly maxWords is inside the budget.
func TestTSPParetoWordBudgetBoundary(t *testing.T) {
	for _, tc := range []struct {
		name     string
		words    int
		wantFail bool
	}{
		{"exactly the budget", 1600, false},
		{"one word over", 1601, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := paretoThroughPlanning(t)
			f.writeVitalExplanation(t, "p1", true, "")
			rel := f.canonicalPartFile(t, "p1")
			path := filepath.Join(f.ws, rel)
			raw, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("read part: %v", err)
			}
			base := string(raw)
			have := len(strings.Fields(base))
			body := base
			if tc.words > have {
				body = strings.TrimRight(base, "\n") + "\n" + strings.Repeat("palabra ", tc.words-have) + "\n"
			}
			if got := len(strings.Fields(body)); got != tc.words {
				t.Fatalf("probe built %d words, want %d (base %d)", got, tc.words, have)
			}
			f.write(t, rel, body)
			rep, _ := f.run(t, f.opts("advance", "explanation"))
			got := failReason(rep, "pareto-part")
			if tc.wantFail && !strings.Contains(got, "word budget") {
				t.Fatalf("%d words must exceed the budget: %q", tc.words, got)
			}
			if !tc.wantFail && got != "" {
				t.Fatalf("%d words is within the budget: %s", tc.words, got)
			}
		})
	}
}

// A rules file that declares a minimum without its companion marker is a
// half-declared pair: it must not load, or the check silently cannot run.
func TestTSPHalfDeclaredVisualRulesAreRejected(t *testing.T) {
	f := newFixture(t)
	raw, err := os.ReadFile("../../rules/deep.json")
	if err != nil {
		t.Fatalf("read rules: %v", err)
	}
	broken := strings.Replace(string(raw), `"howToReadLine": "Cómo leerlo"`, `"howToReadLine": ""`, 1)
	if broken == string(raw) {
		t.Fatalf("probe could not blank howToReadLine")
	}
	path := filepath.Join(t.TempDir(), "rules-half.json")
	if err := os.WriteFile(path, []byte(broken), 0o644); err != nil {
		t.Fatalf("write rules: %v", err)
	}
	rep, code := f.run(t, Options{Command: "validate", Root: f.root, Workspace: f.ws,
		RulesPath: path, Stage: "explanation"})
	if code == 0 || !strings.Contains(rep.Detail, "howToReadLine") {
		t.Fatalf("a minimum without its marker must be rejected: code=%d detail=%q", code, rep.Detail)
	}
}
