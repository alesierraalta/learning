package engine

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Obsidian creates the target of an unresolved link, empty. So the index
// links a part only once its note is written, by its canonical note (plan
// slug) through the vault-relative path; pending parts are plain text.
func TestIndexLinksOnlyWrittenParts(t *testing.T) {
	// Slugs differ from ids (p_1 -> p-1) so a link built from the id is wrong.
	parts := []partCfg{{id: "p_1", ex: true, vis: true, title: "Uno"}, {id: "p_2", ex: true, vis: false, title: "Dos"}}
	link := func(i int, slug, title string) string {
		return "- [[Learnings/consensus/explicaciones/Parte " + itoa(i) + " - " + slug + "|Parte " + itoa(i) + " — " + title + "]] — 🔓 abierta"
	}
	pending := func(i int, title string) string { return "- Parte " + itoa(i) + " — " + title + " — ⬜ pendiente" }
	cases := []struct {
		name    string
		written bool
		index   []string
		reason  string
	}{
		{"pending parts as plain text", false, []string{pending(1, "Uno"), pending(2, "Dos")}, ""},
		{"empty note Obsidian created from a click is not written", false, []string{link(1, "p-1", "Uno"), pending(2, "Dos")}, "not written yet"},
		{"link to a part not written yet", false, []string{link(1, "p-1", "Uno"), pending(2, "Dos")}, "not written yet"},
		{"pending part title missing", false, []string{pending(1, "Uno")}, "Dos"},
		{"written part linked canonically", true, []string{link(1, "p-1", "Uno"), pending(2, "Dos")}, ""},
		{"written part not linked", true, []string{pending(1, "Uno"), pending(2, "Dos")}, "Learnings/consensus/explicaciones/Parte 1 - p-1"},
		{"written part linked from the topic folder", true, []string{"- [[explicaciones/Parte 1 - p-1|Uno]]", pending(2, "Dos")}, "Learnings/consensus/explicaciones/Parte 1 - p-1"},
		{"written part linked by id", true, []string{link(1, "p_1", "Uno"), pending(2, "Dos")}, "Learnings/consensus/explicaciones/Parte 1 - p-1"},
		{"link to a part the plan does not define", false, []string{pending(1, "Uno"), pending(2, "Dos"), link(3, "p-3", "Tres")}, "Parte 3 - p-3"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			if err := os.Mkdir(filepath.Join(f.base, ".obsidian"), 0o755); err != nil {
				t.Fatal(err)
			}
			f.initOK(t)
			f.writePlan(t, parts...)
			f.advanceOK(t, "preparation")
			f.writeDiagQuestions(t, buildDiagQuestions(6, 6, parts...))
			f.writeDiagAnswersFor(t, parts, 2, 6)
			f.advanceOK(t, "diagnosis")
			f.writePlanWith(t, "Dificultades detectadas.", []string{"d3"}, parts...)
			if tc.written {
				f.write(t, "explicaciones/Parte 1 - p-1.md", "---\ntipo: explicacion\n---\n# Uno\n")
			} else if strings.HasPrefix(tc.name, "empty note") {
				f.write(t, "explicaciones/Parte 1 - p-1.md", "")
			}
			f.write(t, "explicacion.md", "---\ntipo: indice\n---\n# Índice\n\n"+strings.Join(tc.index, "\n")+"\n")
			rep, _ := f.run(t, f.opts("validate", "planning"))
			c, ok := hasCheck(rep, "index-note")
			if tc.reason == "" {
				if !ok || c.Status != "PASS" {
					t.Fatalf("index rejected: %+v", c)
				}
				return
			}
			if !ok || c.Status != "FAIL" || !strings.Contains(c.Reason, tc.reason) {
				t.Fatalf("index-note = %+v, want FAIL naming %q", c, tc.reason)
			}
		})
	}
}

// Writing a part requires linking it in the index, and linking it later does
// not invalidate the recorded planning.
func TestWrittenPartMustBeLinkedWithoutStalingPlanning(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	rel := f.canonicalPartFile(t, "p1")
	f.writeExplanation(t, "p1", true, "v1")
	index := string(f.read(t, "explicacion.md"))

	f.write(t, "explicacion.md", indexNote(defaultParts()))
	f.advanceExpectBlocked(t, "explanation", "explanation-content", strings.TrimSuffix(rel, ".md"))

	f.write(t, "explicacion.md", index)
	f.advanceOK(t, "explanation")
	if rep := f.statusExpect(t, "accepted"); hasFailID(rep, "receipts-fresh") {
		t.Fatal("linking a written part must not stale planning")
	}
}

// writer used; a row only marked as pending verification does not.
func TestBibliographyVerifiedMarkIgnoresCase(t *testing.T) {
	for _, tc := range []struct {
		mark string
		ok   bool
	}{{"✅ Verificado en fuente oficial", true}, {"✅ VERIFICADO", true}, {"⚠️ por sección", false}} {
		t.Run(tc.mark, func(t *testing.T) {
			parts := defaultParts()
			f := newFixture(t)
			f.initOK(t)
			f.writePlan(t, parts...)
			f.advanceOK(t, "preparation")
			f.writeDiagQuestions(t, buildDiagQuestions(6, 6, parts...))
			f.writeDiagAnswersFor(t, parts, 2, 6)
			f.advanceOK(t, "diagnosis")
			f.writePlanWith(t, "Dificultades detectadas.", []string{"d3"}, parts...)
			note := strings.ReplaceAll(string(f.read(t, "planificador.md")), "✅ verificado", tc.mark)
			f.write(t, "planificador.md", note)
			rep, _ := f.run(t, f.opts("validate", "planning"))
			c, _ := hasCheck(rep, "planificador-sections")
			if tc.ok != (c.Status == "PASS") {
				t.Fatalf("mark %q: planificador-sections = %+v", tc.mark, c)
			}
		})
	}
}
