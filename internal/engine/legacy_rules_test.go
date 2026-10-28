package engine

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// legacyRulesFile writes the given rules file without the thresholds and checks
// that arrived after the first topics were enrolled: no minVisuals, no
// howToReadLine, no minDemos/demoElements, no pareto or demo checks and no
// pareto-value rubric. That is what a frozen snapshot taken before those rules
// existed looks like.
func legacyRulesFile(t *testing.T, src string) string {
	t.Helper()
	raw, err := os.ReadFile(src)
	if err != nil {
		t.Fatalf("read %s: %v", src, err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("decode %s: %v", src, err)
	}
	if th, ok := doc["thresholds"].(map[string]any); ok {
		for _, k := range []string{"minVisuals", "howToReadLine", "minDemos", "demoElements"} {
			delete(th, k)
		}
	}
	drop := map[string]bool{"pareto_plan": true, "pareto_part": true, "demo_part": true}
	if checks, ok := doc["checks"].(map[string]any); ok {
		for stage, value := range checks {
			list, _ := value.([]any)
			kept := make([]any, 0, len(list))
			for _, item := range list {
				decl, _ := item.(map[string]any)
				kind, _ := decl["kind"].(string)
				if drop[kind] {
					continue
				}
				kept = append(kept, item)
			}
			checks[stage] = kept
		}
	}
	if rubrics, ok := doc["rubrics"].([]any); ok {
		kept := make([]any, 0, len(rubrics))
		for _, item := range rubrics {
			rub, _ := item.(map[string]any)
			if id, _ := rub["id"].(string); id == "pareto-value" {
				continue
			}
			kept = append(kept, item)
		}
		doc["rubrics"] = kept
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatalf("encode legacy rules: %v", err)
	}
	path := filepath.Join(t.TempDir(), "frozen-rules.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatalf("write legacy rules: %v", err)
	}
	return path
}

// A rules snapshot is frozen when a topic is enrolled, so a topic that started
// before the visual, guide and demo thresholds existed keeps a file without them.
// Loading that file must still work and its checks must simply not apply: a
// learner's running topic cannot change behaviour because the engine learned new
// rules. Content that the current rules reject stays accepted under the snapshot.
func TestFrozenRulesWithoutNewThresholdsKeepWorking(t *testing.T) {
	t.Run("frozen snapshot stays lenient", func(t *testing.T) {
		f := newFixture(t)
		f.rules = legacyRulesFile(t, "testdata/rules-fixed-diagnosis.json")
		f.readyThroughPlanning(t, 2, 6)
		// one embed, no reading guide: below the current minimum and unguided
		f.writeExplanationWithVisual(t, "p1", "![diagrama](diagrama.png)")
		rep := f.advanceOK(t, "explanation")
		c, ok := hasCheck(rep, "explanation-content")
		if !ok {
			t.Fatal("explanation-content missing from the advance")
		}
		if c.Status != "PASS" {
			t.Fatalf("explanation-content = %s (%s), want PASS under the frozen rules", c.Status, c.Reason)
		}
		if strings.Contains(c.Reason, "below the minimum") || strings.Contains(c.Reason, "reading guide") {
			t.Fatalf("frozen rules applied a threshold they never declared: %s", c.Reason)
		}
	})

	t.Run("current rules reject the same content", func(t *testing.T) {
		f := newFixture(t)
		f.readyThroughPlanning(t, 2, 6)
		f.writeExplanationWithVisual(t, "p1", "![diagrama](diagrama.png)")
		rep, code := f.run(t, f.opts("advance", "explanation"))
		if code != 1 || rep.Status != "blocked" {
			t.Fatalf("advance explanation = %q (code %d), want blocked/1: %+v", rep.Status, code, rep.Checks)
		}
		c, ok := hasCheck(rep, "explanation-content")
		if !ok {
			t.Fatal("explanation-content missing from the advance")
		}
		if c.Status != "FAIL" || !strings.Contains(c.Reason, "below the minimum of 2") {
			t.Fatalf("explanation-content = %s (%s), want FAIL below the minimum of 2", c.Status, c.Reason)
		}
	})
}
