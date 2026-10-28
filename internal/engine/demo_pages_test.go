package engine

import (
	"os"
	"path/filepath"
	"testing"
)

// demoThroughPlanningParts drives the complete-scope flow to the frontier part
// with p1 declaring demosPlanned and visualsPlanned, patching plan.json before
// each advance so its receipt stays fresh.
func demoThroughPlanningParts(t *testing.T) *fixture {
	t.Helper()
	f := newFixture(t)
	parts := []partCfg{{id: "p1", ex: true, vis: true, title: "Replicación"}}
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

// The gate accepts an inline lk-* demo, or the page-level demo files the vault
// already uses (explicaciones/apps/<part>.html, explicaciones/demos/<part>-*.html).
func TestDemoPageFilesSatisfyTheDemoPromise(t *testing.T) {
	f := demoThroughPlanningParts(t)

	// Nothing yet: the promise is declared but unfulfilled.
	rep, _ := f.run(t, f.opts("validate", "explanation"))
	ch, ok := hasCheck(rep, "demo-part")
	if !ok || ch.Status != "FAIL" {
		t.Fatalf("declared demo with no file must block, got %s (%s)", ch.Status, ch.Reason)
	}

	// The app page exists → the promise is fulfilled without inline elements.
	dir := filepath.Join(f.ws, "explicaciones", "apps")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "p1.html"), []byte("<!doctype html><html><body>demo</body></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	rep, _ = f.run(t, f.opts("validate", "explanation"))
	ch, ok = hasCheck(rep, "demo-part")
	if !ok || ch.Status != "PASS" {
		t.Fatalf("demo-part should PASS with apps/p1.html, got %v (%s)", ch.Status, ch.Reason)
	}

	// Demo pages also count: <part>-<name>.html under explicaciones/demos.
	if err := os.RemoveAll(dir); err != nil {
		t.Fatal(err)
	}
	demos := filepath.Join(f.ws, "explicaciones", "demos")
	if err := os.MkdirAll(demos, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(demos, "p1-almacen.html"), []byte("<!doctype html><html><body>demo</body></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	rep, _ = f.run(t, f.opts("validate", "explanation"))
	ch, ok = hasCheck(rep, "demo-part")
	if !ok || ch.Status != "PASS" {
		t.Fatalf("demo-part should PASS with demos/p1-almacen.html, got %v (%s)", ch.Status, ch.Reason)
	}
}

func TestInlineDemoStillSatisfiesThePromise(t *testing.T) {
	f := demoThroughPlanningParts(t)

	widget := `<lk-widget title="Prueba la política"><p>Mueve el robot.</p><div class="lab"></div></lk-widget>` + "\nCómo leerlo: mueve el robot y mira el acumulado.\n"
	f.writeExplanationWithDemo(t, "p1", widget)
	rep, _ := f.run(t, f.opts("validate", "explanation"))
	ch, ok := hasCheck(rep, "demo-part")
	if !ok || ch.Status != "PASS" {
		t.Fatalf("inline lk-walkthrough must still satisfy the demo, got %v (%s)", ch.Status, ch.Reason)
	}
}
