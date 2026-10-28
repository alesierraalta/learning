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

// deck builds a walkthrough whose scenes are given as raw scene JSON, so a test
// can state exactly what the figure draws.
func deck(t *testing.T, scenes ...string) string {
	t.Helper()
	steps := ""
	for i, scene := range scenes {
		if i > 0 {
			steps += ","
		}
		steps += `{"title":"Paso ` + string(rune('1'+i)) + `","text":"Lo que ocurre en este paso.","scene":` + scene + `}`
	}
	return "<lk-walkthrough>\n<script type=\"application/json\">\n{\"title\":\"Recorrido\",\"viewBox\":\"0 0 800 400\",\"steps\":[" + steps + "]}\n</script>\n</lk-walkthrough>\nCómo leerlo: avanza paso a paso y mira la figura."
}

// The figure has to say what happens: a step that draws two things and no arrow
// leaves the reader reading a static picture. The tutorial is the reference the
// person keeps pointing at, and there every step carries its own arrows.
func TestDeckStepsWithoutArrowsAreRejected(t *testing.T) {
	twoBoxes := `{"boxes":[{"x":40,"y":40,"w":180,"h":70,"label":"Entrada"},{"x":420,"y":40,"w":180,"h":70,"label":"Salida"}]}`
	twoBoxesArrow := `{"boxes":[{"x":40,"y":40,"w":180,"h":70,"label":"Entrada"},{"x":420,"y":40,"w":180,"h":70,"label":"Salida"}],"arrows":[{"x1":230,"y1":75,"x2":410,"y2":75}]}`
	oneTable := `{"grids":[{"x":40,"y":40,"cols":["a","b"],"rows":[["1","2"]],"width":400,"rowH":44}]}`
	cases := []struct {
		name string
		body string
		ok   bool
	}{
		{"two figures with an arrow", deck(t, twoBoxesArrow), true},
		{"two figures without an arrow", deck(t, twoBoxes), false},
		{"one figure alone needs no arrow", deck(t, oneTable), true},
		{"a later step stops guiding", deck(t, twoBoxesArrow, twoBoxes), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := demoThroughPlanning(t)
			f.writeExplanationWithDemo(t, "p1", tc.body)
			rep, code := f.run(t, f.opts("validate", "explanation"))
			check, found := hasCheck(rep, "demo-part")
			if !found {
				t.Fatalf("demo-part check missing: %+v", rep.Checks)
			}
			if tc.ok && (check.Status != "PASS" || code != 0) {
				t.Fatalf("deck rejected: %s (exit %d)", check.Reason, code)
			}
			if !tc.ok && (check.Status != "FAIL" || code != 1) {
				t.Fatalf("deck accepted: %s (exit %d)", check.Reason, code)
			}
		})
	}
}
