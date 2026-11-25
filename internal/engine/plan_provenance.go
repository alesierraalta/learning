package engine

import (
	"fmt"
	"strings"

	"learning/internal/rules"
)

// --- course-derived route provenance (#408, specs S2 and S3) ---------------
//
// A route derived from a course's material has to be provable, not promised.
// S2 decided complete coverage of the material with the exam weighting the
// order; S3 decided the plan stays hidden and the engine — never prose —
// verifies it. The plan therefore declares the coverage it claims (cobertura)
// and the sources it was derived from (material), and every part declares the
// sources it cites with a location (fuentes). The engine proves the three
// things a promise cannot: no part without provenance, no declared source that
// no part cites (the silent drop), and no part citing material the plan never
// declared.
//
// A run without course material — an exam-only run, a plain topic the learner
// typed — declares neither plan-level field and keeps exactly the checks it
// had. Messages name parts by id and sources by their own name, as the pareto
// and exam checks already do: nothing here enumerates the hidden route.

// evalPlanCobertura proves the plan-level half: the coverage it claims is one
// the engine knows, and the material it was derived from is a real list.
func evalPlanCobertura(c *evalCtx, decl rules.CheckDecl) Check {
	if c.planErr != nil {
		return failCheck(decl.ID, c.planErr.Error())
	}
	doc := *c.plan
	if !declaresCourseMaterial(doc) {
		return skipCheck(decl.ID, "no course material declared: the route is not derived from a course")
	}
	cobertura := strings.ToLower(strings.TrimSpace(doc.Cobertura))
	switch cobertura {
	case coberturaCompleta, coberturaPareto:
	default:
		return failCheck(decl.ID, fmt.Sprintf(
			"cobertura must be %q or %q when the route comes from course material (got %q)",
			coberturaCompleta, coberturaPareto, doc.Cobertura))
	}
	if len(doc.Material) == 0 {
		return failCheck(decl.ID,
			"plan.material must list the sources the route was derived from: a declared coverage over no material proves nothing")
	}
	var problems []string
	seen := map[string]bool{}
	for i, item := range doc.Material {
		nombre := strings.TrimSpace(item.Nombre)
		if nombre == "" {
			problems = append(problems, fmt.Sprintf("material #%d has an empty nombre", i+1))
			continue
		}
		if strings.TrimSpace(item.Tipo) == "" {
			problems = append(problems, fmt.Sprintf("material %q has an empty tipo", nombre))
		}
		if seen[nombre] {
			problems = append(problems, fmt.Sprintf("material %q is declared twice", nombre))
		}
		seen[nombre] = true
	}
	if len(problems) > 0 {
		return failCheck(decl.ID, "plan material invalid: "+strings.Join(problems, "; "))
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"cobertura %q declared over %d source(s) of course material", cobertura, len(doc.Material)))
}

// evalPlanProvenance proves every part declares where it came from and that the
// plan neither dropped a source nor invented one.
func evalPlanProvenance(c *evalCtx, decl rules.CheckDecl) Check {
	if c.planErr != nil {
		return failCheck(decl.ID, c.planErr.Error())
	}
	doc := *c.plan
	if !declaresCourseMaterial(doc) {
		return skipCheck(decl.ID, "no course material declared: there is no provenance to prove")
	}
	declared := map[string]bool{}
	for _, item := range doc.Material {
		if nombre := strings.TrimSpace(item.Nombre); nombre != "" {
			declared[nombre] = true
		}
	}
	var problems []string
	cited := map[string]bool{}
	for _, part := range doc.Parts {
		if len(part.Fuentes) == 0 {
			problems = append(problems, fmt.Sprintf("part %q cites no fuentes: every part declares the material it came from", part.ID))
			continue
		}
		for i, fuente := range part.Fuentes {
			nombre := strings.TrimSpace(fuente.Nombre)
			if nombre == "" {
				problems = append(problems, fmt.Sprintf("part %q fuente #%d has an empty nombre", part.ID, i+1))
			}
			if strings.TrimSpace(fuente.Ubicacion) == "" {
				problems = append(problems, fmt.Sprintf("part %q fuente %q has an empty ubicacion: cite where in the source it came from", part.ID, nombre))
			}
			if nombre == "" {
				continue
			}
			cited[nombre] = true
			if !declared[nombre] {
				problems = append(problems, fmt.Sprintf("part %q cites %q, which plan.material never declares", part.ID, nombre))
			}
		}
	}
	var dropped []string
	for _, item := range doc.Material {
		nombre := strings.TrimSpace(item.Nombre)
		if nombre != "" && !cited[nombre] {
			dropped = append(dropped, nombre)
		}
	}
	if len(dropped) > 0 {
		problems = append(problems, fmt.Sprintf(
			"plan.material declares %d source(s) no part cites: %s",
			len(dropped), strings.Join(dropped, ", ")))
	}
	if len(problems) > 0 {
		return failCheck(decl.ID, strings.Join(problems, "; "))
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"provenance proven: %d part(s) cite %d declared source(s)", len(doc.Parts), len(declared)))
}
