package engine

import (
	"encoding/json"
	"testing"
)

// writeExplanationWithDemo writes a valid explanation whose interactive
// component is the given snippet (inline HTML the kit renders).
func (f *fixture) writeExplanationWithDemo(t *testing.T, part, demo string) {
	t.Helper()
	body := "---\ntipo: explicacion\nnodo: T." + part + "\nnivel: medio\n---\n# " + part +
		"\n\nExplicación con ejemplos concretos.\n\n## Ejemplo\n\nCaso numérico paso a paso.\n\n" +
		"**Fuente**: Sutton & Barto, verificación de fixture.\n\n" + demo + "\n\n## Mini-quiz\n"
	for _, q := range buildQuizQuestions(part) {
		body += "\n" + q.Enunciado + "\n"
	}
	rel := f.canonicalPartFile(t, part)
	f.write(t, rel, body)
	f.linkPartInIndex(t, rel)
}

// setDemosPlanned marks one plan part as planning a demo, the way the chat
// declares it in plan.json.
func (f *fixture) setDemosPlanned(t *testing.T, part string, v any) {
	t.Helper()
	var raw map[string]any
	if err := json.Unmarshal(f.read(t, "plan.json"), &raw); err != nil {
		t.Fatal(err)
	}
	for _, p := range raw["parts"].([]any) {
		pm, ok := p.(map[string]any)
		if ok && pm["id"] == part {
			pm["demosPlanned"] = v
		}
	}
	f.writeJSON(t, "plan.json", raw)
}

// demoThroughPlanning drives the complete-scope flow up to the frontier part,
// with p1 planning a demo (and no visual, so the two parameters stay
// independent); plan.json is patched before each advance so its receipt stays
// fresh.
func demoThroughPlanning(t *testing.T) *fixture {
	t.Helper()
	f := newFixture(t)
	parts := []partCfg{{id: "p1", ex: true, vis: false, title: "Replicación"}}
	f.initOK(t)
	f.writePlan(t, parts...)
	f.setDemosPlanned(t, "p1", true)
	f.advanceOK(t, "preparation")
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6, defaultParts()...))
	f.writeDiagAnswersFor(t, defaultParts(), 2, 6)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades detectadas en consenso y en quórums.", []string{"d3"}, parts...)
	f.setDemosPlanned(t, "p1", true)
	f.advanceOK(t, "planning")
	return f
}

// A planned demo needs an interactive component in the part note: a closed
// <lk-widget> or <lk-walkthrough> element the kit renders. Code-fenced markup,
// unclosed elements and unguided components do not satisfy the parameter.
func TestPlannedDemoNeedsInteractiveComponents(t *testing.T) {
	cases := []struct {
		name string
		demo string
		ok   bool
	}{
		{"widget with reading guide", `<lk-widget title="Prueba la política"><p>Mueve el robot.</p><div class="lab"></div></lk-widget>` + "\nCómo leerlo: mueve el robot y mira el acumulado.\n", true},
		{"walkthrough with reading guide", "<lk-walkthrough title=\"Paso a paso\">\n  <div class=\"scene\"></div>\n</lk-walkthrough>\nCómo leerlo: avanza escena por escena.\n", true},
		{"widget without reading guide", `<lk-widget title="Prueba la política"><p>Mueve el robot.</p></lk-widget>`, false},
		{"unclosed widget", `<lk-widget title="Prueba la política"><p>Mueve el robot.</p>`, false},
		{"widget inside a code block is markup", "```html\n<lk-widget><p>x</p></lk-widget>\n```", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := demoThroughPlanning(t)
			f.writeExplanationWithDemo(t, "p1", tc.demo)
			rep, code := f.run(t, f.opts("validate", "explanation"))
			check, found := hasCheck(rep, "demo-part")
			if !found {
				t.Fatalf("demo-part check missing: %+v", rep.Checks)
			}
			if tc.ok && (check.Status != "PASS" || code != 0) {
				t.Fatalf("demo %q rejected: %s (exit %d)", tc.demo, check.Reason, code)
			}
			if !tc.ok && (check.Status != "FAIL" || code != 1) {
				t.Fatalf("demo %q accepted: %s (exit %d)", tc.demo, check.Reason, code)
			}
		})
	}
}

// A part that never planned a demo skips the parameter; declaring demos in the
// plan is what turns it on.
func TestUnplannedDemoSkips(t *testing.T) {
	f := newFixture(t)
	parts := []partCfg{{id: "p1", ex: true, vis: false, title: "Replicación"}}
	f.initOK(t)
	f.writePlan(t, parts...)
	f.advanceOK(t, "preparation")
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6, parts...))
	f.writeDiagAnswersFor(t, parts, 2, 6)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades detectadas en consenso y en quórums.", []string{"d3"}, parts...)
	f.advanceOK(t, "planning")
	f.writeExplanationWithDemo(t, "p1", "Texto sin componente.")
	rep, code := f.run(t, f.opts("validate", "explanation"))
	check, found := hasCheck(rep, "demo-part")
	if !found {
		t.Fatalf("demo-part check missing: %+v", rep.Checks)
	}
	if check.Status != "SKIP" || code != 0 {
		t.Fatalf("unplanned demo-part = %s (exit %d, reason %s)", check.Status, code, check.Reason)
	}
}
