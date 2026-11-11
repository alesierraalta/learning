package engine

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// The measured explanation standard: a part is one idea, and the standard says
// how big one idea is (450 prose words, two content sections, a route of three
// or four lines, one scene, one walkthrough). `tools/part-lint.mjs` and
// `tools/explain-check.mjs` measure it; the engine must refuse the same parts
// and say the same numbers, so the tutor's own run of the tools and the refusal
// it gets from the engine agree.

// standardFrontier drives a one-part run under the production rules (the only
// ones that carry the standard) up to the part's explanation, with the part's
// visual planned so the visual minimum is measured too.
func standardFrontier(t *testing.T) *fixture {
	t.Helper()
	f := conceptFixture(t)
	qs := []diagQuestionWire{conceptQ("a1", 1, "T.p1", "B", "T.p1", "P0.1")}
	r := reasonsFor("a1")
	f.writeGuided(t, qs, map[string]string{"a1": "E"}, r, true)
	f.writeDiagVerdicts(t, coverAll(qs, r, nil)...)
	f.advanceOK(t, "diagnosis")
	// The plan keeps both parts defaultParts declares (the own-words skeleton
	// and the index are written for it); p1 is the part under test.
	f.writePlanWith(t, "Dificultades en T.p1.", []string{"a1"}, defaultParts()...)
	f.methodIfAsked(t)
	f.advanceOK(t, "planning")
	return f
}

// standardScene is a still scene with the caption the reader draws under it:
// that caption is the scene's own reading guide, so the part owes no separate
// "Cómo leerlo" line for it.
const standardScene = `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 200","title":"El mismo robot, dos horizontes","caption":"La misma decisión se juzga distinto según dónde pongas el final de la cuenta.","scene":{"boxes":[{"x":88,"y":24,"w":212,"h":100,"label":"aspiro ahora","tone":"amber","size":22}],"arrows":[{"x1":304,"y1":74,"x2":456,"y2":74,"label":"la hora decide","tone":"slate","width":3}]}}
</script>
</lk-scene>`

// standardNote is the part shape the approved example uses: a route, two
// content sections, one scene, one walkthrough and the mini-quiz.
func standardNote(body string) string {
	return "---\ntipo: explicacion\nnodo: T.p1\nnivel: medio\n---\n# Parte 1\n\n" +
		"## Ruta\n\nVamos a construirlo en este orden:\n\n" +
		"1. Una decisión que no se puede juzgar ahora.\n" +
		"2. El mismo robot con el 4 % de batería.\n" +
		"3. En qué se diferencia del supervisado.\n\n" +
		"## 1. Contestar bien y contestar tarde\n\n" + body + "\n\n" + standardScene + "\n\n" +
		"## 2. Nadie te dice la respuesta\n\nEl ejemplo vuelve con el mismo robot.\n\n" +
		fixtureWalkthrough + "\n\n" +
		"**Fuente**: Sutton & Barto, verificación de fixture.\n\n## Mini-quiz\n"
}

// writeStandardPart writes the part the given body produces and links it in the
// index, the way the tutor would.
func (f *fixture) writeStandardPart(t *testing.T, body string) string {
	t.Helper()
	note := standardNote(body)
	rel := f.canonicalPartFile(t, "p1")
	f.write(t, rel, note)
	f.linkPartInIndex(t, rel)
	return note
}

// standardCheck runs the explanation stage and returns the standard check.
func standardCheck(t *testing.T, f *fixture) (Report, int, Check) {
	t.Helper()
	f.reviewPending(t, "explanation")
	rep, code := f.run(t, f.opts("advance", "explanation"))
	c, _ := hasCheck(rep, "explanation-standard")
	return rep, code, c
}

// A part over the prose budget is refused with the measured count and the fix:
// the standard splits the part, it never compresses it.
func TestPartStandardRefusesAPartOverTheProseBudget(t *testing.T) {
	f := standardFrontier(t)
	note := f.writeStandardPart(t, strings.Repeat("palabra ", 500))
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" {
		t.Fatalf("explanation-standard = %s (%s), want FAIL", c.Status, c.Reason)
	}
	want := proseWords(note)
	if want <= 450 {
		t.Fatalf("fixture counts %d prose words, the test needs more than the 450 budget", want)
	}
	for _, fragment := range []string{
		fmt.Sprintf("%d prose words", want),
		"limit 450",
		"split the part in two",
	} {
		if !strings.Contains(c.Reason, fragment) {
			t.Fatalf("reason %q misses %q", c.Reason, fragment)
		}
	}
}

// Three content sections are three ideas: the standard allows two.
func TestPartStandardRefusesThreeContentSections(t *testing.T) {
	f := standardFrontier(t)
	note := standardNote("El estado es lo que hace falta saber para decidir.")
	note = strings.Replace(note, "## 2. Nadie te dice la respuesta",
		"## 3. Una sección de más\n\nUna idea que pide su propia parte.\n\n## 2. Nadie te dice la respuesta", 1)
	rel := f.canonicalPartFile(t, "p1")
	f.write(t, rel, note)
	f.linkPartInIndex(t, rel)
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" || !strings.Contains(c.Reason, "3 content sections (limit 2") {
		t.Fatalf("explanation-standard = %s (%s), want FAIL on 3 content sections", c.Status, c.Reason)
	}
	if !strings.Contains(c.Reason, "one idea per part") {
		t.Fatalf("reason does not say the fix: %s", c.Reason)
	}
}

// The route is the map of the part: three or four lines, never five.
func TestPartStandardRefusesAFiveLineRoute(t *testing.T) {
	f := standardFrontier(t)
	note := standardNote("El estado es lo que hace falta saber para decidir.")
	note = strings.Replace(note, "3. En qué se diferencia del supervisado.",
		"3. En qué se diferencia del supervisado.\n4. Qué aprende el agente.\n5. Cuánto importa el futuro.", 1)
	rel := f.canonicalPartFile(t, "p1")
	f.write(t, rel, note)
	f.linkPartInIndex(t, rel)
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" || !strings.Contains(c.Reason, "5 numbered line(s)") || !strings.Contains(c.Reason, "3 to 4") {
		t.Fatalf("explanation-standard = %s (%s), want FAIL on a five-line route", c.Status, c.Reason)
	}
	t.Logf("route refusal: %s", c.Reason)
}

// A formula that never names its symbols is a wall: the legend is part of the
// standard, and the refusal names the symbols that are missing.
func TestPartStandardRefusesAFormulaWithoutLegend(t *testing.T) {
	f := standardFrontier(t)
	f.writeStandardPart(t, "El valor se escribe así:\n\n<lk-math>Q(s,a) = c/(1-\\gamma)</lk-math>\n")
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" || !strings.Contains(c.Reason, "never named") {
		t.Fatalf("explanation-standard = %s (%s), want FAIL on the formula legend", c.Status, c.Reason)
	}
	for _, symbol := range []string{"gamma", "Q"} {
		if !strings.Contains(c.Reason, symbol) {
			t.Fatalf("reason %q does not name the symbol %q", c.Reason, symbol)
		}
	}
	t.Logf("legend refusal: %s", c.Reason)
}

// With its legend the same formula passes: the rule is the legend, not the
// formula.
func TestPartStandardAcceptsAFormulaWithItsLegend(t *testing.T) {
	f := standardFrontier(t)
	f.writeStandardPart(t, "El valor se escribe así:\n\n<lk-math>Q(s,a) = c/(1-\\gamma)</lk-math>\n\n"+
		"Donde:\n\n- `Q` es el valor de hacer `a` en `s`.\n- `c` es el coste de un paso.\n- `\\gamma` es el descuento.\n")
	rep, code, c := standardCheck(t, f)
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("advance explanation = %q (exit %d), want accepted: %+v", rep.Status, code, rep.Checks)
	}
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS", c.Status, c.Reason)
	}
}

// The approved example's shape passes whole: two content sections, one scene,
// one walkthrough, and the scene counts as the visual the part planned. A part
// built exactly to the standard must never be refused for it.
func TestPartStandardAcceptsTheApprovedPartShape(t *testing.T) {
	f := standardFrontier(t)
	f.writeStandardPart(t, "Hay decisiones donde acertar ahora no sirve.\n\nEl robot está en una habitación sucia. Le queda 4 % de batería.")
	f.reviewPending(t, "explanation")
	rep, code := f.run(t, f.opts("advance", "explanation"))
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("advance explanation = %q (exit %d), want accepted: %+v", rep.Status, code, rep.Checks)
	}
	standard, ok := hasCheck(rep, "explanation-standard")
	if !ok || standard.Status != "PASS" {
		t.Fatalf("explanation-standard = %+v, want PASS", standard)
	}
	if !strings.Contains(standard.Reason, "meets the explanation standard") {
		t.Fatalf("pass reason does not name the standard: %s", standard.Reason)
	}
	// The scene is the visual: one scene satisfies the minimum of one, so the
	// standard-shaped part is not refused for having no second visual.
	content, ok := hasCheck(rep, "explanation-content")
	if !ok || content.Status != "PASS" {
		t.Fatalf("explanation-content = %+v, want PASS", content)
	}
	if !strings.Contains(content.Reason, "verified 1/1") {
		t.Fatalf("explanation-content = %q, want the scene counted as the planned visual", content.Reason)
	}
}

// The live topic's Parte 1 (2734 words, 12 sections, one walkthrough, no
// formula) is the part the learner actually got. It must be refused with both
// measurements and the fix, not with a generic error.
func TestPartStandardRefusesTheLiveTopicShape(t *testing.T) {
	f := standardFrontier(t)
	var body strings.Builder
	body.WriteString(strings.Repeat("palabra ", 2734))
	for i := 1; i <= 10; i++ {
		body.WriteString(fmt.Sprintf("\n\n## %d. Una sección de más\n\nUna idea que pide su propia parte.\n", i))
	}
	f.writeStandardPart(t, body.String())
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" {
		t.Fatalf("explanation-standard = %s (%s), want FAIL", c.Status, c.Reason)
	}
	// The refusal the learner's own part gets, quoted so a reviewer reads it.
	t.Logf("live-topic refusal: %s", c.Reason)
	for _, fragment := range []string{
		"prose words (limit 450",
		"12 content sections (limit 2",
		"split the part in two",
	} {
		if !strings.Contains(c.Reason, fragment) {
			t.Fatalf("reason %q misses %q", c.Reason, fragment)
		}
	}
}

// A run initialised before the standard keeps its frozen rules: no standard
// thresholds, no standard check, and a long part it already accepted stays
// accepted. A learner's running topic cannot change behaviour because the
// engine learned a new rule.
func TestFrozenRulesWithoutTheStandardKeepAcceptingALongPart(t *testing.T) {
	f := newFixture(t)
	f.rules = legacyRulesFile(t, repoRulesPath)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, strings.Repeat("palabra ", 2000))
	f.reviewPending(t, "explanation")
	rep, code := f.run(t, f.opts("advance", "explanation"))
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("advance explanation under frozen rules = %q (exit %d), want accepted: %+v", rep.Status, code, rep.Checks)
	}
	if _, ok := hasCheck(rep, "explanation-standard"); ok {
		t.Fatal("frozen rules applied a check they never declared")
	}
	if strings.Contains(string(f.read(t, ".learning/rules.json")), "partStandard") {
		t.Fatal("the snapshot must be the frozen rules, without the standard thresholds")
	}
}

// The engine's prose count is the tool's count: the tutor runs
// `node tools/part-lint.mjs` and must get the same number the engine reports.
func TestPartStandardCountsWordsLikePartLint(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	tool, err := filepath.Abs("../../tools/part-lint.mjs")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(tool); err != nil {
		t.Skipf("part-lint.mjs is not here: %v", err)
	}
	note := standardNote("Hay decisiones donde acertar ahora no sirve.\n\n" +
		"| paso | recompensa |\n|---|---|\n| aspirar | +10 |\n\n" +
		"```js\nconst x = 1;\n```\n\n<lk-math>Q(s,a) = c/(1-\\gamma)</lk-math>")
	file := filepath.Join(t.TempDir(), "parte.md")
	if err := os.WriteFile(file, []byte(note), 0o644); err != nil {
		t.Fatal(err)
	}
	out, err := exec.Command(node, tool, file, "--max", "100000").CombinedOutput()
	if err != nil {
		t.Fatalf("part-lint failed: %v\n%s", err, out)
	}
	m := regexp.MustCompile(`(\d+) palabras`).FindStringSubmatch(string(out))
	if m == nil {
		t.Fatalf("part-lint printed no count: %s", out)
	}
	toolCount, err := strconv.Atoi(m[1])
	if err != nil {
		t.Fatal(err)
	}
	if got := proseWords(note); got != toolCount {
		t.Fatalf("proseWords = %d, tools/part-lint.mjs = %d: the engine and the tutor's tool disagree", got, toolCount)
	}
}

// A still scene is a visual: the reader draws it from the note's JSON, exactly
// like a figure. An empty payload draws nothing and does not count, and a
// captioned scene carries its own reading guide.
func TestVisualCounterCountsScenes(t *testing.T) {
	const draws = `{"viewBox":"0 0 760 200","scene":{"boxes":[{"x":8,"y":8,"w":100,"h":40,"label":"a"}]}}`
	const captioned = `{"viewBox":"0 0 760 200","caption":"Entra por la caja y sigue la flecha.","scene":{"boxes":[{"x":8,"y":8,"w":100,"h":40,"label":"a"}]}}`
	scene := func(payload string) string {
		return "<lk-scene>\n<script type=\"application/json\">\n" + payload + "\n</script>\n</lk-scene>"
	}
	cases := []struct {
		name   string
		text   string
		want   int
		guides int
	}{
		{"a scene that draws", scene(draws), 1, 1},
		{"a captioned scene guides itself", scene(captioned), 1, 0},
		{"an empty scene", scene(`{"viewBox":"0 0 760 200","scene":{}}`), 0, 0},
		// The reader draws spec.scene; a flat payload renders an empty stage.
		{"a payload without its scene object", scene(draws[:strings.Index(draws, `,"scene"`)] + "}"), 0, 0},
		{"a scene without a payload", "<lk-scene><div>vacío</div></lk-scene>", 0, 0},
		{"a scene inside a fence is code", "```html\n" + scene(draws) + "\n```", 0, 0},
		{"a captioned scene and a figure", scene(captioned) + "\n" + figureScene, 2, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, missing := countVisualsAndGuides(tc.text, []string{"mermaid"}, []string{"svg"}, "Cómo leerlo")
			if got != tc.want {
				t.Fatalf("countVisuals = %d, want %d", got, tc.want)
			}
			if missing != tc.guides {
				t.Fatalf("visuals without a reading guide = %d, want %d", missing, tc.guides)
			}
		})
	}
}
