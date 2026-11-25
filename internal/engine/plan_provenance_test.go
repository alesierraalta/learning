package engine

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"learning/internal/rules"
)

// --- course-derived routes (#408, specs S2 and S3) --------------------------
//
// A route derived from course material has to be provable, not promised: the
// plan declares how much of the material it covers and which sources it was
// derived from, every part declares the sources it cites with a location, and
// the engine proves that no part is sourceless, no declared source is silently
// dropped and no part cites material the plan never declared. A run without
// course material declares neither field and keeps exactly the checks it had.

// source is one entry as plan.json stores it (material or fuentes).
type source map[string]string

// material lists plan-level sources with their kind.
func material(names ...string) []source {
	out := make([]source, 0, len(names))
	for _, name := range names {
		out = append(out, source{"nombre": name, "tipo": "documento"})
	}
	return out
}

// citing cites every named source from one location in it.
func citing(names ...string) []source {
	out := make([]source, 0, len(names))
	for _, name := range names {
		out = append(out, source{"nombre": name, "ubicacion": "párrafo 1 de " + name})
	}
	return out
}

// manyParts names n parts so a route can exceed the pareto cap.
func manyParts(n int) []partCfg {
	out := make([]partCfg, 0, n)
	for i := 1; i <= n; i++ {
		out = append(out, partCfg{id: fmt.Sprintf("p%d", i), ex: true, vis: false, title: fmt.Sprintf("Parte %d", i)})
	}
	return out
}

// citeAll gives every one of n parts the same cited sources.
func citeAll(n int, names ...string) map[string][]source {
	out := make(map[string][]source, n)
	for i := 1; i <= n; i++ {
		out[fmt.Sprintf("p%d", i)] = citing(names...)
	}
	return out
}

// patchPlanProvenance rewrites plan.json with the course-derived fields: the
// plan's cobertura/material and the fuentes every part cites. A nil list clears
// the field, so a test can ask for the plan an older run wrote.
func (f *fixture) patchPlanProvenance(t *testing.T, cobertura string, mat []source, fuentes map[string][]source) {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal(f.read(t, "plan.json"), &doc); err != nil {
		t.Fatalf("decode plan.json: %v", err)
	}
	if cobertura == "" {
		delete(doc, "cobertura")
	} else {
		doc["cobertura"] = cobertura
	}
	if mat == nil {
		delete(doc, "material")
	} else {
		doc["material"] = mat
	}
	parts, _ := doc["parts"].([]any)
	for _, raw := range parts {
		part, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id, _ := part["id"].(string)
		if list, found := fuentes[id]; found && fuentes != nil {
			part["fuentes"] = list
			continue
		}
		delete(part, "fuentes")
	}
	f.writeJSON(t, "plan.json", doc)
}

// expecting fails the test unless the report carries the check with the status.
func expecting(t *testing.T, rep Report, id, status, reason string) Check {
	t.Helper()
	c, ok := hasCheck(rep, id)
	if !ok {
		t.Fatalf("check %q did not run: %+v", id, rep.Checks)
	}
	if c.Status != status {
		t.Fatalf("check %q = %s (%s), want %s", id, c.Status, c.Reason, status)
	}
	if reason != "" && !strings.Contains(c.Reason, reason) {
		t.Fatalf("check %q reason = %q, want substring %q", id, c.Reason, reason)
	}
	return c
}

// Rule 1: a plan part that cites no fuentes, or a fuentes entry whose nombre or
// ubicacion is empty, fails.
func TestCoursePlanPartWithoutSourcesIsRefused(t *testing.T) {
	cases := []struct {
		name    string
		fuentes map[string][]source
		want    string
	}{
		{"a part that cites no fuentes", map[string][]source{"p1": citing("apunte.txt")}, `part "p2" cites no fuentes`},
		{"a fuente with an empty nombre", map[string][]source{
			"p1": citing("apunte.txt"),
			"p2": {{"nombre": "  ", "ubicacion": "párrafo 2 de apunte.txt"}},
		}, "empty nombre"},
		{"a fuente with an empty ubicacion", map[string][]source{
			"p1": citing("apunte.txt"),
			"p2": {{"nombre": "apunte.txt", "ubicacion": ""}},
		}, "empty ubicacion"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			f.initOK(t)
			f.writePlan(t, defaultParts()...)
			f.patchPlanProvenance(t, "completa", material("apunte.txt"), tc.fuentes)
			f.advanceExpectBlocked(t, "preparation", "plan-provenance", tc.want)
		})
	}
}

// Rule 2: a source declared in plan.material that no part cites fails. That is
// the silent drop this task exists to catch.
func TestCoursePlanSourceNoPartCitesIsRefused(t *testing.T) {
	f := newFixture(t)
	f.initOK(t)
	f.writePlan(t, defaultParts()...)
	f.patchPlanProvenance(t, "completa",
		material("apunte.txt", "final.txt", "clase.txt"),
		map[string][]source{"p1": citing("apunte.txt"), "p2": citing("final.txt")})

	rep := f.advanceExpectBlocked(t, "preparation", "plan-provenance", "no part cites")
	c, _ := hasCheck(rep, "plan-provenance")
	if !strings.Contains(c.Reason, "clase.txt") {
		t.Fatalf("reason %q does not name the dropped source", c.Reason)
	}
	if strings.Contains(c.Reason, "apunte.txt") || strings.Contains(c.Reason, "final.txt") {
		t.Fatalf("reason %q blames a source every part cites", c.Reason)
	}
}

// Rule 3: a part that cites a source absent from plan.material fails.
func TestCoursePartCitingUndeclaredSourceIsRefused(t *testing.T) {
	f := newFixture(t)
	f.initOK(t)
	f.writePlan(t, defaultParts()...)
	f.patchPlanProvenance(t, "completa",
		material("apunte.txt", "final.txt"),
		map[string][]source{"p1": citing("apunte.txt", "inventado.txt"), "p2": citing("final.txt")})

	rep := f.advanceExpectBlocked(t, "preparation", "plan-provenance", `cites "inventado.txt"`)
	c, _ := hasCheck(rep, "plan-provenance")
	if !strings.Contains(c.Reason, "never declares") {
		t.Fatalf("reason %q does not say the plan never declared it", c.Reason)
	}
}

// Rule 4: cobertura "pareto" keeps requiring its declared descartado and the
// pareto cap still applies to a pareto route, even when the run's state scope
// was recorded as complete.
func TestParetoCoursePlanKeepsItsTrimAndCap(t *testing.T) {
	t.Run("a declared trim passes", func(t *testing.T) {
		f := newFixture(t)
		f.initOK(t)
		f.writePlan(t, defaultParts()...)
		f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80% de esta parte")
		f.patchPlanProvenance(t, "pareto", material("apunte.txt"), citeAll(2, "apunte.txt"))

		rep := f.advanceOK(t, "preparation")
		expecting(t, rep, "pareto-plan", "PASS", "pareto trim declared")
		expecting(t, rep, "plan-cobertura", "PASS", "pareto")
		expecting(t, rep, "plan-provenance", "PASS", "")
	})

	t.Run("the trim is still required", func(t *testing.T) {
		f := newFixture(t)
		f.initOK(t)
		f.writePlan(t, defaultParts()...)
		f.patchPlanProvenance(t, "pareto", material("apunte.txt"), citeAll(2, "apunte.txt"))

		f.advanceExpectBlocked(t, "preparation", "pareto-plan", "descartado")
	})

	t.Run("the cap still applies to a pareto route", func(t *testing.T) {
		f := newFixture(t)
		f.initOK(t)
		f.writePlan(t, manyParts(5)...)
		f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80% de esta parte")
		f.patchPlanProvenance(t, "pareto", material("apunte.txt"), citeAll(5, "apunte.txt"))

		f.advanceExpectBlocked(t, "preparation", "pareto-plan", "at most 4 parts")
	})
}

// Rule 5: maxParts no longer truncates a cobertura "completa" run. A course run
// that also carries the exam is pareto-scoped by the engine, so the cap is
// exactly what used to reduce complete coverage to four parts.
func TestCompletaCoursePlanIsNotTruncated(t *testing.T) {
	const n = 7
	names := make([]string, 0, n)
	for i := 1; i <= n; i++ {
		names = append(names, fmt.Sprintf("apunte-%d.txt", i))
	}
	f := newFixture(t)
	f.initScope(t, "pareto")
	f.writePlan(t, manyParts(n)...)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80% de esta parte")
	f.patchPlanProvenance(t, "completa", material(names...), citeAll(n, names...))
	if n <= 4 {
		t.Fatal("the route must exceed the pareto cap for this test to prove anything")
	}

	rep := f.advanceOK(t, "preparation")
	c := expecting(t, rep, "pareto-plan", "PASS", "")
	if strings.Contains(c.Reason, "at most") {
		t.Fatalf("a complete-coverage route was truncated: %s", c.Reason)
	}
	expecting(t, rep, "plan-cobertura", "PASS", "completa")
	expecting(t, rep, "plan-provenance", "PASS", "")
}

// Rule 6: a run with no course material keeps exactly today's behaviour and
// today's checks: an exam-only run, and a plain topic the learner typed.
func TestPlanWithoutCourseMaterialKeepsTodaysBehaviour(t *testing.T) {
	t.Run("a plain topic", func(t *testing.T) {
		f := newFixture(t)
		f.initOK(t)
		f.writePlan(t, defaultParts()...)

		rep := f.advanceOK(t, "preparation")
		// Every declared preparation gate still runs and none of them fails.
		r, err := rules.Load(repoRulesPath)
		if err != nil {
			t.Fatalf("fixture rules do not load: %v", err)
		}
		for _, decl := range r.ChecksFor("preparation") {
			c, ok := hasCheck(rep, decl.ID)
			if !ok {
				t.Fatalf("preparation check %q did not run", decl.ID)
			}
			if c.Status == "FAIL" {
				t.Fatalf("preparation check %q failed on a plan with no course material: %s", decl.ID, c.Reason)
			}
		}
		expecting(t, rep, "plan-structure", "PASS", "declares topic")
		for _, id := range []string{"plan-cobertura", "plan-provenance"} {
			expecting(t, rep, id, "SKIP", "no course material")
		}
	})

	t.Run("an exam-only run", func(t *testing.T) {
		f := newExamFixture(t)
		setExamState(t, f, "oral", "")
		writeExamPlan(t, f, "oral", "", strings.Repeat("oral purpose ", 3))

		rep := f.advanceOK(t, "preparation")
		expecting(t, rep, "exam-plan", "PASS", "oral")
		expecting(t, rep, "pareto-plan", "PASS", "")
		for _, id := range []string{"plan-cobertura", "plan-provenance"} {
			expecting(t, rep, id, "SKIP", "no course material")
		}
	})

	t.Run("the shipped rules load and declare the provenance gates", func(t *testing.T) {
		r, err := rules.Load(productionRulesPath)
		if err != nil {
			t.Fatalf("shipped rules/deep.json does not load: %v", err)
		}
		for _, stage := range []string{"preparation", "planning"} {
			for _, kind := range []string{"plan_cobertura", "plan_provenance"} {
				found := false
				for _, decl := range r.ChecksFor(stage) {
					if decl.Kind == kind && decl.Path == "plan.json" {
						found = true
					}
				}
				if !found {
					t.Fatalf("stage %q declares no %q check on plan.json", stage, kind)
				}
			}
		}
	})
}
