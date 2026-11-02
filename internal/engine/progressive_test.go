package engine

import (
	"strings"
	"testing"

	"learning/internal/rules"
)

// The person learns a part by watching its example change, the way the studio
// tutorial draws the thing itself and points at it step by step. A part without
// that walkthrough, or with one whose figure is a table that updates, is not
// ready: "No me sirve que me muestres una tabla e iconos que se van actualizando
// abajo ... Quiero algo que me muestre visualmente, que me muestre la flecha,
// dónde tengo que ver".

// sceneStep draws the example itself: a cell, the agent and the arrow that says
// where to look.
const sceneStep = `{"boxes":[{"x":40,"y":60,"w":120,"h":90,"label":"(0,2)"}],"nodes":[{"x":100,"y":105,"r":26,"label":"R"}],"arrows":[{"x1":100,"y1":60,"x2":100,"y2":20,"label":"sube"}]}`

// sqlStep is a table that is the example itself (rows of data) with the arrow
// pointing at the row that matters: allowed, the table is the scene.
const sqlStep = `{"grids":[{"x":20,"y":24,"width":320,"rowH":48,"cols":["id","salary"],"rows":[["7782","2450"],["7999","mucho"]]}],"boxes":[{"x":20,"y":220,"w":160,"h":60,"label":"NUMBER"}],"arrows":[{"x1":100,"y1":215,"x2":250,"y2":140,"label":"no cabe"}]}`

// tableStep is the rejected shape: a table on top and caption boxes below.
const tableStep = `{"grids":[{"x":20,"y":24,"width":320,"rowH":48,"cols":["x=0","x=1","x=2","x=3"],"rows":[["·","·","·","Puerta"],["·","Columna","·","Charco"],["Robot","·","·","·"]]}],"boxes":[{"x":12,"y":290,"w":116,"h":62,"label":"(0,2)"},{"x":232,"y":290,"w":116,"h":62,"label":"(0,1)"}],"arrows":[{"x1":136,"y1":321,"x2":224,"y2":321,"label":"subir"}]}`

// explanationFrontier drives a one-part run, with no demo planned, up to the
// part's explanation.
func explanationFrontier(t *testing.T) *fixture {
	t.Helper()
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
	return f
}

// prefixLines puts a container prefix (list indentation, blockquote marker)
// in front of every line of a snippet.
func prefixLines(text, prefix string) string {
	lines := strings.Split(text, "\n")
	for i := range lines {
		lines[i] = prefix + lines[i]
	}
	return strings.Join(lines, "\n")
}

func repeatSteps(step string, n int) []string {
	steps := make([]string, n)
	for i := range steps {
		steps[i] = step
	}
	return steps
}

func TestPartNeedsProgressiveWalkthrough(t *testing.T) {
	cases := []struct {
		name   string
		body   string
		ok     bool
		reason string
	}{
		{"scene deck of three steps", deck(t, repeatSteps(sceneStep, 3)...), true, ""},
		{"scene deck of six steps", deck(t, repeatSteps(sceneStep, 6)...), true, ""},
		{"no walkthrough at all", "Texto sin recorrido.", false, "needs a progressive walkthrough"},
		{"a widget does not replace the walkthrough", `<lk-widget title="Prueba"><p>Mueve el robot.</p><div class="lab"></div></lk-widget>` + "\nCómo leerlo: mueve el robot.\n", false, "needs a progressive walkthrough"},
		{"two steps are too few", deck(t, repeatSteps(sceneStep, 2)...), false, "3 to 6 steps"},
		{"seven steps are too many", deck(t, repeatSteps(sceneStep, 7)...), false, "3 to 6 steps"},
		{"a table no arrow points at", deck(t, sceneStep, tableStep, sceneStep), false, "table"},
		{"a table of data with the arrow on its row", deck(t, sqlStep, sqlStep, sqlStep), true, ""},
		{"a step without an arrow", deck(t, sceneStep, `{"boxes":[{"x":40,"y":60,"w":120,"h":90,"label":"(0,2)"}]}`, sceneStep), false, "arrow"},
		{"a step that only draws a table", deck(t, sceneStep, `{"grids":[{"x":20,"y":24,"width":320,"rowH":48,"cols":["a"],"rows":[["1"]]}],"arrows":[{"x1":10,"y1":10,"x2":60,"y2":10,"label":"mira"}]}`, sceneStep), false, "table"},
		{"a walkthrough inside a tilde code fence is code", "~~~html\n" + deck(t, repeatSteps(sceneStep, 3)...) + "\n~~~", false, "needs a progressive walkthrough"},
		{"a shorter inner fence does not close a longer one", "~~~~markdown\n~~~\n" + deck(t, repeatSteps(sceneStep, 3)...) + "\n~~~~", false, "needs a progressive walkthrough"},
		{"a closer indented four spaces is code, not a closer", "~~~\n    ~~~\n" + deck(t, repeatSteps(sceneStep, 3)...) + "\n~~~", false, "needs a progressive walkthrough"},
		{"a closer followed by a no-break space is not a closer", "~~~\n~~~\u00a0\n" + deck(t, repeatSteps(sceneStep, 3)...) + "\n~~~", false, "needs a progressive walkthrough"},
		{"a backtick run with a backtick in its info string opens nothing", "``` a`b\n" + deck(t, repeatSteps(sceneStep, 3)...), true, ""},
		{"a backtick line does not close a tilde fence", "~~~\n```\n" + deck(t, repeatSteps(sceneStep, 3)...) + "\n~~~", false, "needs a progressive walkthrough"},
		{"a fence inside a list item is code", "- ~~~html\n" + prefixLines(deck(t, repeatSteps(sceneStep, 3)...), "  ") + "\n  ~~~\n", false, "and has none"},
		{"a fence inside a blockquote is code", "> ~~~html\n" + prefixLines(deck(t, repeatSteps(sceneStep, 3)...), "> ") + "\n> ~~~\n", false, "and has none"},
		{"a fence line inside an HTML block opens nothing", "<div>\n~~~\n</div>\n\n" + deck(t, repeatSteps(sceneStep, 3)...), true, ""},
		{"a box without a size draws nothing", deck(t, sceneStep, `{"boxes":[{}],"arrows":[{"x1":0,"y1":0,"x2":20,"y2":20,"label":"mira"}]}`, sceneStep), false, "draws nothing"},
		{"a null box draws nothing", deck(t, sceneStep, `{"boxes":[null],"arrows":[{"x1":0,"y1":0,"x2":20,"y2":20,"label":"mira"}]}`, sceneStep), false, "draws nothing"},
		{"an arrow that stops beside the table does not point into it", deck(t, sceneStep, `{"grids":[{"x":20,"y":24,"width":320,"rowH":48,"cols":["id"],"rows":[["1"]]}],"arrows":[{"x1":400,"y1":50,"x2":352,"y2":50,"label":"esta"}]}`, sceneStep), false, "no arrow points at"},
		{"an arrow without coordinates draws nothing", deck(t, sceneStep, `{"boxes":[{"x":40,"y":60,"w":120,"h":90,"label":"(0,2)"}],"arrows":[{"label":"sube"}]}`, sceneStep), false, "arrow"},
		{"a dashed frame with its arrow is a scene", deck(t, sceneStep, `{"dashed":[{"x":20,"y":20,"w":300,"h":200,"label":"almacén"}],"arrows":[{"x1":160,"y1":300,"x2":160,"y2":230,"label":"entra"}]}`, sceneStep), true, ""},
		{"a gear keeps the size the kit draws", deck(t, sceneStep, `{"gears":[{"x":200,"y":200}],"grids":[{"x":10,"y":10,"width":100,"rowH":48,"cols":["a"],"rows":[["1"]]}],"arrows":[{"x1":300,"y1":300,"x2":250,"y2":250,"label":"gira"}]}`, sceneStep), true, ""},
		{"an unclosed walkthrough does not swallow the next one", strings.TrimSuffix(strings.Split(deck(t, repeatSteps(sceneStep, 3)...), "</lk-walkthrough>")[0], "\n") + "\n\n" + deck(t, tableStep, tableStep, tableStep), false, "walkthrough 2 step 1"},
		{"a deck that cannot render", "<lk-walkthrough>\n<script type=\"application/json\">{\"title\": \"roto\", \"steps\": [</script>\n</lk-walkthrough>\nCómo leerlo: un recorrido.", false, "needs a progressive walkthrough"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := explanationFrontier(t)
			f.writeExplanationWithDemo(t, "p1", tc.body)
			rep, code := f.run(t, f.opts("validate", "explanation"))
			check, found := hasCheck(rep, "explanation-content")
			if !found {
				t.Fatalf("explanation-content check missing: %+v", rep.Checks)
			}
			if tc.ok && (check.Status != "PASS" || code != 0) {
				t.Fatalf("part rejected: %s (exit %d)", check.Reason, code)
			}
			if !tc.ok {
				if check.Status != "FAIL" || code != 1 {
					t.Fatalf("part accepted: %s (exit %d)", check.Reason, code)
				}
				if !strings.Contains(check.Reason, tc.reason) {
					t.Fatalf("reason %q does not name %q", check.Reason, tc.reason)
				}
			}
		})
	}
}

// One good walkthrough does not excuse a table-based one elsewhere in the part:
// every walkthrough the person steps through has to draw the example.
func TestEveryWalkthroughMustDrawTheExample(t *testing.T) {
	f := explanationFrontier(t)
	good := deck(t, repeatSteps(sceneStep, 3)...)
	bad := deck(t, tableStep, tableStep, tableStep)
	f.writeExplanationWithDemo(t, "p1", good+"\n\n"+bad)
	rep, code := f.run(t, f.opts("validate", "explanation"))
	check, _ := hasCheck(rep, "explanation-content")
	if check.Status != "FAIL" || code != 1 {
		t.Fatalf("table deck beside a good deck accepted: %s (exit %d)", check.Reason, code)
	}
	if !strings.Contains(check.Reason, "walkthrough 2") {
		t.Fatalf("reason does not point at the second walkthrough: %s", check.Reason)
	}
}

// Structure is checked by code; whether the steps actually teach is a judgment,
// so new runs owe a recorded walkthrough-progression review for every part,
// with or without a planned visual.
func TestNewRunsJudgeTheWalkthroughProgression(t *testing.T) {
	r, err := rules.Load(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	var found *rules.Rubric
	for _, rub := range r.RubricsFor("explanation") {
		if rub.ID == "walkthrough-progression" {
			found = &rub
		}
	}
	if found == nil {
		t.Fatal("production rules declare no walkthrough-progression review for explanation")
	}
	if !found.IsGate() || found.When != "" {
		t.Fatalf("walkthrough-progression must be an unconditional gate, got kind %q when %q", found.Kind, found.When)
	}
	if !strings.Contains(found.Instruction, "table") || !strings.Contains(found.Instruction, "arrow") {
		t.Fatalf("instruction does not name the table and arrow criteria: %s", found.Instruction)
	}
	// The review must not fail what the deterministic rule accepts on purpose:
	// a table of data that is the example, with the arrow on its row.
	if !strings.Contains(found.Instruction, "data is the example") {
		t.Fatalf("instruction contradicts the data-table exception: %s", found.Instruction)
	}
}

// The rule lives in the engine, not in the frozen rules snapshot, so a run
// initialised before it still owes the walkthrough for the parts it has not
// certified yet.
func TestLegacySnapshotStillNeedsWalkthrough(t *testing.T) {
	f := explanationFrontier(t)
	f.writeExplanationWithDemo(t, "p1", "Texto sin recorrido.")
	rep, code := f.run(t, f.opts("validate", "explanation"))
	check, _ := hasCheck(rep, "explanation-content")
	if check.Status != "FAIL" || code != 1 {
		t.Fatalf("a part without a walkthrough passed: %s (exit %d)", check.Reason, code)
	}
	if strings.Contains(string(f.read(t, ".learning/rules.json")), "progressive") {
		t.Fatalf("the rule must not depend on the run's rules snapshot")
	}
}
