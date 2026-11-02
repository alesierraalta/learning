package engine

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A run whose frozen rules count only lk-widget as a demo binds the part's page
// in the receipt even though the note carries its walkthrough. Changing or
// deleting that page must still stale the certified part: the walkthrough rule
// did not weaken the page receipts older runs rely on.
func TestLegacyPageReceiptStillGuardsTheCertifiedPart(t *testing.T) {
	for _, mutation := range []string{"replace", "delete"} {
		t.Run(mutation, func(t *testing.T) {
			var doc map[string]any
			raw, err := os.ReadFile(repoRulesPath)
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(raw, &doc); err != nil {
				t.Fatal(err)
			}
			doc["thresholds"].(map[string]any)["demoElements"] = []string{"lk-widget"}
			legacy, _ := json.Marshal(doc)
			rulesFile := filepath.Join(t.TempDir(), "rules.json")
			if err := os.WriteFile(rulesFile, legacy, 0o600); err != nil {
				t.Fatal(err)
			}

			f := newFixture(t)
			f.rules = rulesFile
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
			f.writeExplanationWithDemo(t, "p1", fixtureWalkthrough)
			page := "explicaciones/apps/p1.html"
			f.write(t, page, `<button>Next</button><script>let x = 1</script>`)
			f.advanceOK(t, "explanation")
			if !strings.Contains(string(f.tryReadState(t)), page) {
				t.Fatalf("receipt does not bind the page %s", page)
			}

			if mutation == "delete" {
				if err := os.Remove(filepath.Join(f.ws, page)); err != nil {
					t.Fatal(err)
				}
			} else {
				f.write(t, page, "<svg><rect/></svg>")
			}
			rep, code := f.run(t, f.opts("status", ""))
			ch, ok := hasCheck(rep, "receipts-fresh")
			if code != 1 || !ok || ch.Status != "FAIL" || !strings.Contains(ch.Reason, page) {
				t.Fatalf("page %s of a certified part: status exit %d, receipts-fresh %+v", mutation, code, ch)
			}
		})
	}
}

func TestDemoPageFilesSatisfyTheDemoPromise(t *testing.T) {
	example, err := os.ReadFile("../../integrations/pi/kit/examples/rl-parte-3.html")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, path, body string
		ok               bool
	}{
		{"static app", "explicaciones/apps/p1.html", "<!doctype html><html><body><svg><rect/></svg></body></html>", false},
		{"static demo", "explicaciones/demos/p1-static.html", "<!doctype html><html><body><svg><rect/></svg></body></html>", false},
		{"control only inside script", "explicaciones/apps/p1.html", `<script>const sample = "<button>";</script><svg><rect/></svg>`, false},
		{"legacy app with a control", "explicaciones/apps/p1.html", `<button>Next</button><script>document.querySelector('button').onclick = () => {};</script>`, true},
		{"legacy app with the interactive page", "explicaciones/apps/p1.html", string(example), true},
		{"existing interactive demo", "explicaciones/demos/p1-demo.html", string(example), true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := demoThroughPlanning(t)
			f.writeExplanationWithDemo(t, "p1", "Texto sin demo.")
			f.write(t, tc.path, tc.body)
			rep, code := f.run(t, f.opts("validate", "explanation"))
			ch, found := hasCheck(rep, "demo-part")
			// The note carries no walkthrough, so explanation-content fails the
			// stage (exit 1) whatever the page does; demo-part is judged alone.
			if !found || code != 1 || (tc.ok && (ch.Status != "PASS" || !strings.Contains(ch.Reason, tc.path))) || (!tc.ok && (ch.Status != "FAIL" || code != 1 || !strings.Contains(ch.Reason, "planned a demo"))) {
				t.Fatalf("demo-part = %s exit %d reason %q", ch.Status, code, ch.Reason)
			}
		})
	}
}

func TestInlineDemoStillSatisfiesThePromise(t *testing.T) {
	f := demoThroughPlanning(t)
	widget := `<lk-widget title="Prueba la política"><p>Mueve el robot.</p><div class="lab"></div></lk-widget>` + "\nCómo leerlo: mueve el robot y mira el acumulado.\n"
	f.writeExplanationWithDemo(t, "p1", widget)
	rep, code := f.run(t, f.opts("validate", "explanation"))
	ch, ok := hasCheck(rep, "demo-part")
	// Without its walkthrough the part still fails explanation-content (exit 1).
	if !ok || ch.Status != "PASS" || code != 1 {
		t.Fatalf("demo-part = %s exit %d (%s)", ch.Status, code, ch.Reason)
	}
}

