package engine

import (
	"os"
	"strings"
	"testing"
)

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
		{"standalone control and script", "explicaciones/apps/p1.html", `<button>Next</button><script>document.querySelector('button').onclick = () => {};</script>`, true},
		{"existing interactive app", "explicaciones/apps/p1.html", string(example), true},
		{"existing interactive demo", "explicaciones/demos/p1-demo.html", string(example), true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := demoThroughPlanning(t)
			f.writeExplanationWithDemo(t, "p1", "Texto sin demo.")
			f.write(t, tc.path, tc.body)
			rep, code := f.run(t, f.opts("validate", "explanation"))
			ch, found := hasCheck(rep, "demo-part")
			if !found || (tc.ok && (ch.Status != "PASS" || code != 0 || !strings.Contains(ch.Reason, tc.path))) || (!tc.ok && (ch.Status != "FAIL" || code != 1 || !strings.Contains(ch.Reason, "planned a demo"))) {
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
	if !ok || ch.Status != "PASS" || code != 0 {
		t.Fatalf("demo-part = %s exit %d (%s)", ch.Status, code, ch.Reason)
	}
}
