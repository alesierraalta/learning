package engine

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Obsidian creates the target of an unresolved link relative to the vault
// root, so a part link must name the canonical part note (plan slug) by its
// vault-relative path; otherwise a click opens an empty note somewhere else.
func TestIndexLinksPointAtCanonicalPartNotes(t *testing.T) {
	// Slugs differ from ids (p_1 -> p-1) so a link built from the id is wrong.
	parts := []partCfg{{id: "p_1", ex: true, vis: true, title: "Uno"}, {id: "p_2", ex: true, vis: false, title: "Dos"}}
	full := func(i int, slug string) string {
		return "[[Learnings/consensus/explicaciones/Parte " + itoa(i) + " - " + slug + "|Parte]]"
	}
	cases := []struct {
		name, index, reason string
	}{
		{"vault-relative canonical links", full(1, "p-1") + "\n" + full(2, "p-2"), ""},
		{"topic-relative links", indexNote(parts), "Learnings/consensus/explicaciones/Parte 1 - p-1"},
		{"link built from the id", full(1, "p_1") + "\n" + full(2, "p-2"), "Parte 1 - p-1"},
		{"slug differs from the plan", full(1, "Negacion y frase clara") + "\n" + full(2, "p-2"), "Parte 1 - p-1"},
		{"link to a part the plan does not define", full(1, "p-1") + "\n" + full(2, "p-2") + "\n" + full(3, "p-3"), "Parte 3 - p-3"},
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
			f.write(t, "explicacion.md", "---\ntipo: indice\n---\n# Índice\n\n"+tc.index+"\n")
			rep, _ := f.run(t, f.opts("validate", "planning"))
			c, ok := hasCheck(rep, "index-note")
			if tc.reason == "" {
				if !ok || c.Status != "PASS" {
					t.Fatalf("canonical index rejected: %s", c.Reason)
				}
				return
			}
			if !ok || c.Status != "FAIL" || !strings.Contains(c.Reason, tc.reason) {
				t.Fatalf("index-note = %+v, want FAIL naming %q", c, tc.reason)
			}
		})
	}
}

// A verified bibliography row counts regardless of the capitalisation the
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
