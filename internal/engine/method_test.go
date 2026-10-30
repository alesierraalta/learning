package engine

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// strictRulesFile is the fixture rules with the strict university flow on: after
// the diagnosis the learner chooses how to be taught before anything is planned.
func strictRulesFile(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(repoRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	doc["thresholds"].(map[string]any)["strictFlow"] = true
	// The strict part order is the production one: mini-quiz before own words.
	prodRaw, err := os.ReadFile(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	var prod map[string]any
	if err := json.Unmarshal(prodRaw, &prod); err != nil {
		t.Fatal(err)
	}
	doc["stageOrder"], doc["partStages"] = prod["stageOrder"], prod["partStages"]
	// The quiz comes first, so its reviews cannot read the own words written after it.
	for _, raw := range doc["rubrics"].([]any) {
		rub := raw.(map[string]any)
		if rub["stage"] != "quiz" {
			continue
		}
		ctx, _ := rub["context"].([]any)
		var keep []any
		for _, c := range ctx {
			if c != "own-words" {
				keep = append(keep, c)
			}
		}
		rub["context"] = keep
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "strict-rules.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func (f *fixture) method(t *testing.T, choice string) (Report, int) {
	t.Helper()
	opts := f.opts("method", "")
	opts.Method = choice
	return f.run(t, opts)
}

func (f *fixture) stateBytes(t *testing.T) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(f.ws, ".learning", "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestStrictRunWaitsForTheMethodAfterTheDiagnosis(t *testing.T) {
	f := newFixture(t)
	f.rules = strictRulesFile(t)
	f.diagnosed(t, defaultParts(), []int{}...)

	rep, _ := f.run(t, f.opts("status", ""))
	if rep.NextStage != "method" {
		t.Fatalf("status nextStage = %q, want method after the diagnosis", rep.NextStage)
	}
	before := f.stateBytes(t)
	f.writePlanWith(t, "Dificultades detectadas.", []string{"d3"}, defaultParts()...)
	if rep, code := f.run(t, f.opts("advance", "planning")); code == ExitOK {
		t.Fatalf("planning advanced before the method was chosen: %+v", rep)
	}
	if !bytes.Equal(before, f.stateBytes(t)) {
		t.Fatal("a refused planning advance changed the state")
	}
}

func TestMethodIsRecordedOnceAndOpensPlanning(t *testing.T) {
	f := newFixture(t)
	f.rules = strictRulesFile(t)
	f.diagnosed(t, defaultParts(), []int{}...)

	rep, code := f.method(t, "pareto")
	if code != ExitOK || rep.Status != "accepted" || rep.NextStage != "planning" {
		t.Fatalf("method pareto = exit %d %+v, want accepted with next planning", code, rep)
	}
	status, _ := f.run(t, f.opts("status", ""))
	if status.Method != "pareto" || status.Scope != scopePareto || status.NextStage != "planning" {
		t.Fatalf("status after pareto = method %q scope %q next %q", status.Method, status.Scope, status.NextStage)
	}

	before := f.stateBytes(t)
	rep, code = f.method(t, "preferencias")
	if code != ExitFailedCheck || rep.Status != "blocked" {
		t.Fatalf("a second choice = exit %d %+v, want blocked", code, rep)
	}
	if !bytes.Equal(before, f.stateBytes(t)) {
		t.Fatal("a refused second choice changed the state")
	}
}

func TestMethodPreferenciasKeepsTheCompleteScopeAndPlanningProceeds(t *testing.T) {
	f := newFixture(t)
	f.rules = strictRulesFile(t)
	f.readyParts(t, defaultParts(), 2)
	status, _ := f.run(t, f.opts("status", ""))
	if status.Method != "preferencias" || status.Scope != scopeComplete {
		t.Fatalf("status = method %q scope %q, want preferencias/complete", status.Method, status.Scope)
	}
	if status.NextStage != "explanation" || status.Part != "p1" {
		t.Fatalf("status next = %q part %q, want the explanation of p1", status.NextStage, status.Part)
	}
}

func TestMethodRejectsAChoiceOutsideTheTwoAndBeforeTheDiagnosis(t *testing.T) {
	f := newFixture(t)
	f.rules = strictRulesFile(t)
	f.initOK(t)
	before := f.stateBytes(t)

	rep, code := f.method(t, "otro")
	if code != ExitOperational || !strings.Contains(rep.Detail, "pareto") || !strings.Contains(rep.Detail, "preferencias") {
		t.Fatalf("unknown choice = exit %d %+v, want an error naming both methods", code, rep)
	}
	rep, code = f.method(t, "pareto")
	if code != ExitFailedCheck || rep.Status != "blocked" {
		t.Fatalf("choice before the diagnosis = exit %d %+v, want blocked", code, rep)
	}
	if !bytes.Equal(before, f.stateBytes(t)) {
		t.Fatal("a refused choice changed the state")
	}
}

// A topic enrolled before the strict flow keeps its snapshot: no method stage.
func TestSnapshotWithoutStrictFlowGoesStraightToPlanning(t *testing.T) {
	f := newFixture(t)
	f.diagnosed(t, defaultParts(), []int{}...)
	rep, _ := f.run(t, f.opts("status", ""))
	if rep.NextStage != "planning" {
		t.Fatalf("status nextStage = %q, want planning under the old rules", rep.NextStage)
	}
	before := f.stateBytes(t)
	rep, code := f.method(t, "pareto")
	if code != ExitOperational || !strings.Contains(rep.Detail, "does not ask") {
		t.Fatalf("method under old rules = exit %d %+v, want an operational error", code, rep)
	}
	if !bytes.Equal(before, f.stateBytes(t)) {
		t.Fatal("method under old rules changed the state")
	}
}
