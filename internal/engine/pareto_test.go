package engine

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// --- helpers ---------------------------------------------------------------

// initScope enrolls the fixture run with an explicit scope.
func (f *fixture) initScope(t *testing.T, scope string) Report {
	t.Helper()
	opts := f.opts("init", "")
	opts.Scope = scope
	rep, code := f.run(t, opts)
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("init scope=%q: status=%q exit=%d checks=%+v", scope, rep.Status, code, rep.Checks)
	}
	return rep
}

// patchPlanPareto rewrites plan.json with (or without) the pareto selection.
func (f *fixture) patchPlanPareto(t *testing.T, block any, perPart string) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(f.ws, "plan.json"))
	if err != nil {
		t.Fatalf("read plan.json: %v", err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("plan.json: %v", err)
	}
	if block == nil {
		delete(doc, "pareto")
	} else {
		doc["pareto"] = block
	}
	parts, _ := doc["parts"].([]any)
	for _, item := range parts {
		part, _ := item.(map[string]any)
		if part == nil {
			continue
		}
		if perPart == "" {
			delete(part, "pareto")
			continue
		}
		part["pareto"] = perPart
	}
	b, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	f.write(t, "plan.json", string(b))
}

func paretoBlock() map[string]any {
	return map[string]any{
		"criterio":   "lo que más aparece en el examen y en el uso diario del tema",
		"descartado": []string{"historia del tema", "variantes raras que no se evalúan"},
	}
}

// paretoThroughDiagnosis drives the flow with scope=pareto up to the planning
// stage, patching the plan after the preparation rewrite.
func paretoThroughDiagnosis(t *testing.T) *fixture {
	t.Helper()
	f := newFixture(t)
	f.initScope(t, "pareto")
	f.writePlan(t, defaultParts()...)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80% de esta parte")
	f.advanceOK(t, "preparation")
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6, defaultParts()...))
	f.writeDiagAnswersFor(t, defaultParts(), 2, 6)
	f.advanceOK(t, "diagnosis")
	return f
}

// paretoThroughPlanning also survives the planning rewrite of plan.json, which
// is where the chat could quietly drop the declared trim.
func paretoThroughPlanning(t *testing.T) *fixture {
	t.Helper()
	f := paretoThroughDiagnosis(t)
	f.writePlanWith(t, "Dificultades detectadas en consenso y en quórums.", []string{"d3"}, defaultParts()...)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80% de esta parte")
	f.advanceOK(t, "planning")
	return f
}

// writeVitalExplanation writes a part file that may carry the Pareto heading.
func (f *fixture) writeVitalExplanation(t *testing.T, part string, heading bool, padding string) {
	t.Helper()
	body := "---\ntipo: explicacion\nnodo: T." + part + "\nnivel: medio\n---\n# " + part + "\n\nExplicación de la parte con ejemplos concretos.\n"
	if heading {
		body += "\n## El 20% que rinde el 80%\n\nEsta parte entrega la pregunta que más se usa en el examen.\n"
	}
	body += "\n" + padding + "\n\n## Ejemplo\n\nCaso numérico paso a paso.\n\n**Fuente**: Sutton & Barto, verificación de fixture.\n\n## Mini-quiz\n"
	body += "\n![diagrama](diagrama-" + part + ".png)\nCómo leerlo: sigue los pasos de izquierda a derecha.\n\n![detalle](detalle-" + part + ".png)\nCómo leerlo: compara las dos barras.\n"
	for _, q := range buildQuizQuestions(part) {
		body += "\n" + q.Enunciado + "\n"
	}
	rel := f.canonicalPartFile(t, part)
	f.write(t, rel, body)
	f.linkPartInIndex(t, rel)
}

// --- scope is engine state -------------------------------------------------

func TestInitRecordsScopeAndStatusReportsIt(t *testing.T) {
	f := newFixture(t)
	f.initScope(t, "pareto")
	if got, _ := f.state(t)["scope"].(string); got != "pareto" {
		t.Fatalf("state.scope = %q, want pareto", got)
	}
	rep := f.statusExpect(t, "accepted")
	if rep.Scope != "pareto" {
		t.Fatalf("status scope = %q, want pareto", rep.Scope)
	}
}

func TestScopeDefaultsToComplete(t *testing.T) {
	f := newFixture(t)
	f.initScope(t, "")
	if got, _ := f.state(t)["scope"].(string); got != "complete" {
		t.Fatalf("state.scope = %q, want complete by default", got)
	}
	if rep := f.statusExpect(t, "accepted"); rep.Scope != "complete" {
		t.Fatalf("status scope = %q, want complete", rep.Scope)
	}
}

// --- the plan must show the deliberate trim --------------------------------

func TestCompleteScopeNeedsNoParetoSelection(t *testing.T) {
	f := newFixture(t)
	f.initScope(t, "complete")
	f.writePlan(t, defaultParts()...)
	rep, code := f.run(t, f.opts("validate", "preparation"))
	assertGatePassing(t, rep, code, "accepted")
	c, ok := hasCheck(rep, "pareto-plan")
	if !ok || c.Status != "SKIP" {
		t.Fatalf("complete scope pareto-plan = %+v, want SKIP", c)
	}
	f.advanceOK(t, "preparation")
}

func TestParetoPlanRequiresAStatedSelection(t *testing.T) {
	f := newFixture(t)
	f.initScope(t, "pareto")
	f.writePlan(t, defaultParts()...)
	rep, code := f.run(t, f.opts("validate", "preparation"))
	assertBlocked(t, rep, code)
	if reason := failReason(rep, "pareto-plan"); !strings.Contains(reason, "pareto") {
		t.Fatalf("pareto-plan = %q, want a missing-selection failure (checks: %+v)", reason, rep.Checks)
	}
	if c, ok := hasCheck(rep, "pareto-plan"); !ok || c.Status != "FAIL" {
		t.Fatalf("pareto-plan = %+v, want FAIL", c)
	}
}

func TestParetoPlanWithSelectionPasses(t *testing.T) {
	f := newFixture(t)
	f.initScope(t, "pareto")
	f.writePlan(t, defaultParts()...)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80%")
	f.advanceOK(t, "preparation")
}

func TestParetoPlanRequiresDiscardedContent(t *testing.T) {
	f := newFixture(t)
	f.initScope(t, "pareto")
	f.writePlan(t, defaultParts()...)
	f.patchPlanPareto(t, map[string]any{
		"criterio":   "lo que más aparece en el examen y en el uso diario del tema",
		"descartado": []string{},
	}, "la capacidad que rinde el 80%")
	rep, _ := f.run(t, f.opts("validate", "preparation"))
	if reason := failReason(rep, "pareto-plan"); !strings.Contains(reason, "descartado") {
		t.Fatalf("pareto-plan = %q, want a descartado failure", reason)
	}
}

func TestParetoPlanRequiresPerPartValue(t *testing.T) {
	f := newFixture(t)
	f.initScope(t, "pareto")
	f.writePlan(t, defaultParts()...)
	f.patchPlanPareto(t, paretoBlock(), "")
	rep, _ := f.run(t, f.opts("validate", "preparation"))
	if reason := failReason(rep, "pareto-plan"); !strings.Contains(reason, "p1") {
		t.Fatalf("pareto-plan = %q, want the part missing its pareto value", reason)
	}
}

func TestParetoPlanCapsTheNumberOfParts(t *testing.T) {
	f := newFixture(t)
	f.initScope(t, "pareto")
	parts := defaultParts()
	for _, id := range []string{"p3", "p4", "p5"} {
		parts = append(parts, partCfg{id: id, ex: true, vis: false})
	}
	f.writePlan(t, parts...)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80%")
	rep, _ := f.run(t, f.opts("validate", "preparation"))
	if reason := failReason(rep, "pareto-plan"); !strings.Contains(reason, "parts") {
		t.Fatalf("pareto-plan = %q, want a part-count failure", reason)
	}
}

func TestParetoPlanMustSurviveThePlanningRewrite(t *testing.T) {
	f := paretoThroughDiagnosis(t)
	f.writePlanWith(t, "Dificultades detectadas en consenso y en quórums.", []string{"d3"}, defaultParts()...)
	rep, code := f.run(t, f.opts("validate", "planning"))
	assertBlocked(t, rep, code)
	if reason := failReason(rep, "pareto-plan"); !strings.Contains(reason, "pareto") {
		t.Fatalf("pareto-plan at planning = %q, want the dropped selection reported", reason)
	}
}

func TestStatusReportsTheScopeEvenWhenBlocked(t *testing.T) {
	f := newFixture(t)
	f.initScope(t, "pareto")
	f.writePlan(t, defaultParts()...)
	f.writeExplanation(t, "p1", true, "")

	rep := f.statusExpect(t, "blocked")
	if rep.Scope != "pareto" {
		t.Fatalf("blocked status scope = %q, want pareto", rep.Scope)
	}
	if c, ok := hasCheck(rep, "pareto-plan"); !ok || c.Status != "FAIL" {
		t.Fatalf("pareto-plan = %+v, want a FAIL on the blocked frontier", c)
	}
}

// --- each part states its vital slice -------------------------------------

func TestParetoPartWithoutVitalSectionBlocks(t *testing.T) {
	f := paretoThroughPlanning(t)
	f.writeVitalExplanation(t, "p1", false, "Relleno.")
	rep, code := f.run(t, f.opts("advance", "explanation"))
	assertBlocked(t, rep, code)
	if reason := failReason(rep, "pareto-part"); !strings.Contains(reason, "El 20% que rinde el 80%") {
		t.Fatalf("pareto-part = %q, want the missing heading named (checks: %+v)", reason, rep.Checks)
	}
}

func TestParetoPartWithVitalSectionAdvances(t *testing.T) {
	f := paretoThroughPlanning(t)
	f.writeVitalExplanation(t, "p1", true, "Relleno.")
	f.advanceOK(t, "explanation")
}

func TestParetoPartHonoursTheWordBudget(t *testing.T) {
	f := paretoThroughPlanning(t)
	f.writeVitalExplanation(t, "p1", true, strings.Repeat("palabra ", 2000))
	rep, _ := f.run(t, f.opts("validate", "explanation"))
	if reason := failReason(rep, "pareto-part"); !strings.Contains(reason, "words") {
		t.Fatalf("pareto-part = %q, want a word-budget failure", reason)
	}
}

// --- the interpretation gate only exists in pareto scope -------------------

func TestParetoValueReviewOnlyInParetoScope(t *testing.T) {
	f := paretoThroughPlanning(t)
	f.writeVitalExplanation(t, "p1", true, "Relleno.")
	rep, code := f.run(t, f.opts("validate", "explanation"))
	assertGatePassing(t, rep, code, "accepted")
	if found := pendingByRule(pendingListOf(rep.Evidence), "pareto-value"); !found {
		t.Fatalf("pendingReviews = %+v, want pareto-value", pendingListOf(rep.Evidence))
	}

	complete := readyForExplanation(t)
	rep, code = complete.run(t, complete.opts("validate", "explanation"))
	assertGatePassing(t, rep, code, "accepted")
	if found := pendingByRule(pendingListOf(rep.Evidence), "pareto-value"); found {
		t.Fatalf("complete scope must not demand pareto-value: %+v", pendingListOf(rep.Evidence))
	}
}

func pendingByRule(pending []map[string]any, rule string) bool {
	for _, p := range pending {
		if name, _ := p["rule"].(string); name == rule {
			return true
		}
	}
	return false
}
