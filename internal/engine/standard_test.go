package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"learning/internal/rules"
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
	return standardFrontierOn(t, productionRulesPath)
}

// standardFrontierOn is standardFrontier with the run enrolled on the given
// rules file. The rules snapshot is taken at init, so the path has to be set
// before the run starts: a snapshot written earlier keeps its own standard.
func standardFrontierOn(t *testing.T, rulesPath string) *fixture {
	t.Helper()
	f := newFixture(t)
	f.rules = rulesPath
	f.initOK(t)
	f.writePlan(t, defaultParts()...)
	f.advanceOK(t, "preparation")
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
{"viewBox":"0 0 760 200","title":"El mismo robot, dos horizontes","caption":"La misma decisión se juzga distinto según dónde pongas el final de la cuenta.","scene":{"boxes":[{"x":88,"y":24,"w":212,"h":100,"label":"aspiro ahora","tone":"amber","size":22}],"arrows":[{"x1":304,"y1":74,"x2":456,"y2":74,"label":"la hora decide","tone":"slate","width":3}],"icons":[{"kind":"robot","x":520,"y":74,"size":72,"tone":"blue"}]}}
</script>
</lk-scene>`

// fixtureStory is the story-language deck the standard asks for (#237): three
// steps of actors with state, a narrator per step and a mark that closes it. It
// draws no formula, so the formula rule stays out of the way, and it is the deck
// the classic `<lk-walkthrough>` is legacy for.
const fixtureStory = `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"El robot sube","viewBox":"0 0 360 300","steps":[
 {"title":"La salida","narrator":"El robot empieza en la casilla de abajo.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","tag":"robot"}]}}},
 {"title":"Sube","narrator":"El robot sube una casilla y deja la de abajo.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","state":"faded"},{"id":"u","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"}],"marks":[{"kind":"ok","actors":["u"]}]}}},
 {"title":"Paga","narrator":"Cada paso cuesta menos cero coma cero cuatro.","stage":{"scene":{"actors":[{"id":"u","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"}],"marks":[{"kind":"ok","actors":["u"]}]}}}
]}
</script>
</lk-story>
Cómo leerlo: avanza y mira la casilla que cambia.`

// standardNote is the part shape the approved example uses: a route, two
// content sections, one scene, one story and the mini-quiz.
func standardNote(body string) string {
	return "---\ntipo: explicacion\nnodo: T.p1\nnivel: medio\n---\n# Parte 1\n\n" +
		"## Ruta\n\nVamos a construirlo en este orden:\n\n" +
		"1. Una decisión que no se puede juzgar ahora.\n" +
		"2. El mismo robot con el 4 % de batería.\n" +
		"3. En qué se diferencia del supervisado.\n\n" +
		"## 1. Contestar bien y contestar tarde\n\n" + body + "\n\n" + standardScene + "\n\n" +
		"## 2. Nadie te dice la respuesta\n\nEl ejemplo vuelve con el mismo robot.\n\n" +
		fixtureStory + "\n\n" +
		"**Fuente**: Sutton & Barto, verificación de fixture.\n\n## Mini-quiz\n"
}

// writeStandardPart writes the part the given body produces and links it in the
// index, the way the tutor would.
func (f *fixture) writeStandardPart(t *testing.T, body string) string {
	t.Helper()
	note := standardNote(body)
	f.writePartNote(t, note)
	return note
}

// writePartNote writes the given note as the part under test and links it in
// the index.
func (f *fixture) writePartNote(t *testing.T, note string) {
	t.Helper()
	rel := f.canonicalPartFile(t, "p1")
	f.write(t, rel, note)
	f.linkPartInIndex(t, rel)
}

// standardNoteWithoutScene is the standard-shaped part with its scene removed:
// the walkthrough stays, because a walkthrough is not a drawn example.
func standardNoteWithoutScene(body string) string {
	return strings.Replace(standardNote(body), standardScene, "", 1)
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
	f := standardFrontierOn(t, snapshotWithoutFormulaWalkthrough(t))
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

// annotatedFormulaScene draws the gaussian density symbol by symbol: one
// numbered callout per symbol, and one labels line per number naming it. The
// scene is the formula's legend, so the part owes no separate list of symbols.
const annotatedFormulaScene = `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 380","title":"La densidad gaussiana, símbolo por símbolo","caption":"Cada número señala un símbolo de la fórmula y dice qué es.","scene":{
  "formulas":[{"x":380,"y":104,"size":28,"atoms":[{"t":"f"},{"t":"("},{"t":"x"},{"t":")"},{"t":" = "},{"t":"1/(σ√(2π))"},{"t":" · "},{"t":"exp(−(x−μ)²/(2σ²))"}]}],
  "callouts":[{"n":1,"x":96,"y":40,"to":[96,92],"tone":"blue"},{"n":2,"x":150,"y":40,"to":[150,92],"tone":"amber"},{"n":3,"x":420,"y":40,"to":[420,92],"tone":"green"},{"n":4,"x":300,"y":40,"to":[300,92],"tone":"slate"},{"n":5,"x":560,"y":40,"to":[560,92],"tone":"red"},{"n":6,"x":660,"y":40,"to":[660,92],"tone":"blue"}],
  "labels":[
    {"x":380,"y":190,"text":"① f: la densidad, la altura de la curva"},
    {"x":380,"y":222,"text":"② x: el valor que miras, la latencia"},
    {"x":380,"y":254,"text":"③ μ: el centro, dónde está el pico"},
    {"x":380,"y":286,"text":"④ σ: el ancho, cuánto se abre la campana"},
    {"x":380,"y":318,"text":"⑤ 1/(σ√(2π)): el factor que normaliza; π: 3,1416"},
    {"x":380,"y":350,"text":"⑥ exp(…): el exponente, la distancia al centro"}
  ]}}
</script>
</lk-scene>`

// annotatedFormulaSceneWithoutSigma is the same scene with the σ line removed:
// the symbol is drawn and never named, so the legend has to refuse it. A scene
// that draws a formula is a formula the reader has to be able to read.
var annotatedFormulaSceneWithoutSigma = strings.Replace(annotatedFormulaScene,
	"    {\"x\":380,\"y\":286,\"text\":\"④ σ: el ancho, cuánto se abre la campana\"},\n", "", 1)

// writeStandardPartWithScene writes the standard part with the given scene in
// place of the shipped one: a part carries one scene, so the fixture swaps it
// instead of adding a second.
func (f *fixture) writeStandardPartWithScene(t *testing.T, body, scene string) {
	t.Helper()
	f.writePartNote(t, strings.Replace(standardNote(body), standardScene, scene, 1))
}

// A formula drawn as an annotated scene names its symbols in its callouts. The
// scene is the legend, so a symbol no callout names is a formula the reader
// cannot read — the rule reads the scene's formulas like the <lk-math> blocks.
func TestPartStandardRefusesAFormulaSceneThatNeverNamesItsSymbols(t *testing.T) {
	f := standardFrontier(t)
	f.writeStandardPartWithScene(t, "La densidad se dibuja símbolo por símbolo.\n", annotatedFormulaSceneWithoutSigma)
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" || !strings.Contains(c.Reason, "never named") {
		t.Fatalf("explanation-standard = %s (%s), want FAIL on the annotated formula's legend", c.Status, c.Reason)
	}
	for _, fragment := range []string{"σ", "annotated formula scene", "one numbered callout per symbol"} {
		if !strings.Contains(c.Reason, fragment) {
			t.Fatalf("reason %q misses %q", c.Reason, fragment)
		}
	}
	// The fix is the annotated scene, never the equation element: <lk-math>
	// draws a clean equation with no arrows, which is what the learner refused.
	if strings.Contains(c.Reason, "so the kit draws it") {
		t.Fatalf("reason %q still sends the tutor to <lk-math> as the fix", c.Reason)
	}
	t.Logf("annotated formula refusal: %s", c.Reason)
}

// With one callout per symbol the same scene passes: the rule is the legend,
// and the scene's callouts are the legend.
func TestPartStandardAcceptsAFormulaSceneWhoseCalloutsNameEverySymbol(t *testing.T) {
	f := standardFrontierOn(t, snapshotWithoutFormulaWalkthrough(t))
	f.writeStandardPartWithScene(t, "La densidad se dibuja símbolo por símbolo.\n", annotatedFormulaScene)
	rep, code, c := standardCheck(t, f)
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("advance explanation = %q (exit %d), want accepted: %+v", rep.Status, code, rep.Checks)
	}
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the callouts name every symbol", c.Status, c.Reason)
	}
}

// A Greek letter is a symbol like any other: the legend reads it in a formula
// and accepts the callout form («① γ: …») that names it.
func TestPartStandardRefusesAGreekSymbolNeverNamed(t *testing.T) {
	f := standardFrontier(t)
	f.writeStandardPart(t, "El valor se escribe así:\n\n<lk-math>Q(s,a) = c/(1-γ)</lk-math>\n\n"+
		"Donde:\n\n- `Q` es el valor de hacer `a` en `s`.\n- `c` es el coste de un paso.\n")
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" || !strings.Contains(c.Reason, "never named") || !strings.Contains(c.Reason, "γ") {
		t.Fatalf("explanation-standard = %s (%s), want FAIL naming γ", c.Status, c.Reason)
	}
	t.Logf("greek symbol refusal: %s", c.Reason)
}

// The approved example's shape passes whole: two content sections, one scene,
// one walkthrough, and the scene counts as the visual the part planned. A part
// built exactly to the standard must never be refused for it.
func TestPartStandardAcceptsTheApprovedPartShape(t *testing.T) {
	f := standardFrontier(t)
	f.writeStandardPart(t, "Imagina un robot en una habitación sucia.\n\n**Robot**: es quien decide qué hacer. Antes decidía a ciegas; después mira su batería.\n\nHay decisiones donde acertar ahora no sirve. Le queda 4 % de batería.")
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

// livePartOne is the shape of the first Part 1 written under the standard
// (topic `probabilidad-representacion-y-sistemas-complejos`, 2026-11-11): 411
// prose words, two content sections, a three-line route, one walkthrough, three
// quiz questions, plain `$$` equations and no drawn scene. It passed the size
// rules, so the learner got a part with no drawing, walls of prose and formulas
// they could not read. The size rules must keep passing it; the shape rules
// must refuse it.
const livePartOne = `---
tipo: explicacion
nodo: T.p1
nivel: medio
---
# Parte 1

## Ruta

Vamos a construirlo en este orden:

1. Qué hace complejo a un sistema.
2. Cómo se representa con probabilidad.
3. Por qué la representación decide lo que puedes calcular.

## 1. Muchas piezas que se miran entre sí

Un sistema complejo tiene muchas piezas y cada una depende de las demás, de modo que ninguna se entiende por separado. No puedes estudiar una sola pieza y suponer que el resto del sistema se queda quieto mientras la miras con calma. Lo que importa son las relaciones entre las piezas, no las piezas sueltas ni el catálogo de sus nombres.

Cuando dos variables se mueven juntas, la probabilidad conjunta no es el producto de las marginales. Escribimos la conjunta como $$P(A \cap B)$$ y la condicional como $$P(A \mid B)$$, que se lee como la probabilidad de A dado que ya sabes B. Si las dos variables no son independientes, la condicional no coincide con la marginal y el producto te da un número que no significa nada.

La representación importa porque el número de estados crece muy rápido con cada variable que añades. Con diez variables binarias tienes mil combinaciones posibles, y todavía las puedes enumerar en una hoja. Con veinte tienes un millón, y ninguna tabla cabe en la cabeza ni en la memoria de una máquina.

## 2. La cuenta que se vuelve intratable

Un grafo dirigido acíclico te dice qué depende de qué, flecha por flecha y sin ambigüedad. Cada flecha es una condicional y el grafo entero factoriza la conjunta en factores pequeños. Esa factorización es lo que hace tratable el cálculo, y es la razón de dibujar el grafo antes de contar nada.

Cuando el grafo tiene ciclos, la factorización se rompe y el orden de las flechas deja de ser un orden. La conjunta deja de escribirse como producto de condicionales locales, porque cada variable vuelve a depender de las anteriores. Ahí aparece la aproximación, y con ella el error que nadie mide cuando el resultado parece razonable.

Una tabla de probabilidades conjuntas guarda un número por cada combinación de valores de todas las variables. Si tienes veinte variables binarias, esa tabla tiene un millón de filas y cada fila pide una cuenta. Nadie la escribe a mano, y casi nadie la puede leer sin perderse en la tercera columna.

` + fixtureWalkthrough + `

**Fuente**: Pearl, representación de la independencia condicional.

## Mini-quiz

1. ¿Qué cambia cuando dos variables dejan de ser independientes?
2. ¿Qué pieza del grafo convierte la conjunta en un producto?
3. ¿Qué se pierde cuando el grafo tiene ciclos?
`

// A part without a drawn scene is refused: the learner asked for the example
// drawn, and a walkthrough is not a substitute for the scene.
func TestPartStandardRefusesAPartWithoutADrawnScene(t *testing.T) {
	cases := []struct {
		name string
		note string
	}{
		{"no scene at all", standardNoteWithoutScene("Hay decisiones donde acertar ahora no sirve.")},
		{"a scene that draws nothing", strings.Replace(standardNote("Hay decisiones donde acertar ahora no sirve."),
			standardScene, "<lk-scene>\n<script type=\"application/json\">\n{\"viewBox\":\"0 0 760 200\",\"scene\":{}}\n</script>\n</lk-scene>", 1)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := standardFrontier(t)
			f.writePartNote(t, tc.note)
			rep, code, c := standardCheck(t, f)
			assertBlocked(t, rep, code)
			if c.Status != "FAIL" {
				t.Fatalf("explanation-standard = %s (%s), want FAIL", c.Status, c.Reason)
			}
			t.Logf("scene refusal: %s", c.Reason)
			for _, fragment := range []string{
				"0 drawn <lk-scene> scene(s)",
				"dibuja el ejemplo con <lk-scene>",
				"<lk-walkthrough> does not substitute",
				"references/visuales.md",
			} {
				if !strings.Contains(c.Reason, fragment) {
					t.Fatalf("reason %q misses %q", c.Reason, fragment)
				}
			}
		})
	}
}

// The live Part 1 passed every size rule and still skipped the shape the learner
// asked for. The refusal names the three shape rules and none of the size ones.
func TestPartStandardRefusesTheLivePartOneShape(t *testing.T) {
	f := standardFrontier(t)
	f.writePartNote(t, livePartOne)
	// The fixture is the live part's size: the size rules must pass it, or the
	// test would prove the wrong rule.
	if words := proseWords(livePartOne); words > 450 {
		t.Fatalf("fixture counts %d prose words, over the 450 budget: it no longer reproduces the live part", words)
	} else {
		t.Logf("live Part 1 fixture: %d prose words", words)
	}
	if sections := contentSections(livePartOne); len(sections) != 2 {
		t.Fatalf("fixture has %d content sections (%v), want the live part's 2", len(sections), sections)
	}
	if found, lines := routeLines(livePartOne); !found || lines != 3 {
		t.Fatalf("fixture route = %v/%d lines, want 3", found, lines)
	}
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" {
		t.Fatalf("explanation-standard = %s (%s), want FAIL", c.Status, c.Reason)
	}
	t.Logf("live Part 1 refusal: %s", c.Reason)
	for _, fragment := range []string{
		"0 drawn <lk-scene> scene(s)",
		"dibuja el ejemplo con <lk-scene>",
		"6 paragraph(s) with more than 2 sentences",
		"the first opens «Un sistema complejo tiene muchas piezas",
		"formula symbol(s)",
		"never named",
		"<lk-math>",
	} {
		if !strings.Contains(c.Reason, fragment) {
			t.Fatalf("reason %q misses %q", c.Reason, fragment)
		}
	}
	for _, fragment := range []string{"prose words (limit", "content sections (limit", "numbered line(s)"} {
		if strings.Contains(c.Reason, fragment) {
			t.Fatalf("reason %q fails a size rule the live part passed (%q)", c.Reason, fragment)
		}
	}
}

// A paragraph of three sentences is a wall: the standard asks for short
// phrases, and the refusal quotes the paragraph so the tutor can find it.
func TestPartStandardRefusesAParagraphOfThreeSentences(t *testing.T) {
	f := standardFrontier(t)
	f.writeStandardPart(t, "Una. Dos. Tres.")
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" {
		t.Fatalf("explanation-standard = %s (%s), want FAIL", c.Status, c.Reason)
	}
	t.Logf("paragraph refusal: %s", c.Reason)
	for _, fragment := range []string{
		"1 paragraph(s) with more than 2 sentences",
		"«Una. Dos. Tres.»",
		"one idea per sentence",
	} {
		if !strings.Contains(c.Reason, fragment) {
			t.Fatalf("reason %q misses %q", c.Reason, fragment)
		}
	}
}

// Plain `$$…$$` math is read by the legend rule too, and the refusal names the
// fix the standard asks for: the annotated formula scene, one numbered callout
// per symbol. `<lk-math>` is for a calculation, never for explaining a formula.
func TestPartStandardRefusesPlainMathWithoutLegend(t *testing.T) {
	f := standardFrontier(t)
	f.writeStandardPart(t, "El valor se escribe así:\n\n$$Q(s,a) = c/(1-\\gamma)$$\n")
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" || !strings.Contains(c.Reason, "never named") {
		t.Fatalf("explanation-standard = %s (%s), want FAIL on the formula legend", c.Status, c.Reason)
	}
	t.Logf("plain math refusal: %s", c.Reason)
	for _, fragment := range []string{"gamma", "annotated formula scene", "one numbered callout per symbol", "<lk-math> is for a calculation"} {
		if !strings.Contains(c.Reason, fragment) {
			t.Fatalf("reason %q misses %q", c.Reason, fragment)
		}
	}
	if strings.Contains(c.Reason, "so the kit draws it") {
		t.Fatalf("reason %q still sends the tutor to <lk-math> as the fix", c.Reason)
	}
}

// The same plain math with its legend passes: the rule is the legend, and the
// formula element is the fix a refusal names.
func TestPartStandardAcceptsPlainMathWithItsLegend(t *testing.T) {
	f := standardFrontierOn(t, snapshotWithoutFormulaWalkthrough(t))
	f.writeStandardPart(t, "El valor se escribe así:\n\n$$Q(s,a) = c/(1-\\gamma)$$\n\n"+
		"Donde:\n\n- `Q` es el valor de hacer `a` en `s`.\n- `c` es el coste de un paso.\n- `\\gamma` es el descuento.\n")
	rep, code, c := standardCheck(t, f)
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("advance explanation = %q (exit %d), want accepted: %+v", rep.Status, code, rep.Checks)
	}
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS", c.Status, c.Reason)
	}
}

// The engine's paragraph count is the tool's count: the tutor runs
// `node tools/explain-check.mjs` and must get the same number of walls.
func TestPartStandardCountsParagraphsLikeExplainCheck(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	tool, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(tool); err != nil {
		t.Skipf("explain-check.mjs is not here: %v", err)
	}
	note := standardNote("Una. Dos. Tres.\n\nOtra frase corta.\n\n" +
		"Cuatro frases aquí. Y la segunda. Y la tercera. Y la cuarta.\n\nCorta y clara.")
	file := filepath.Join(t.TempDir(), "parte.md")
	if err := os.WriteFile(file, []byte(note), 0o644); err != nil {
		t.Fatal(err)
	}
	// explain-check exits 1 when a rule fails; the JSON is what matters here.
	out, _ := exec.Command(node, tool, file, "--json").CombinedOutput()
	var parsed struct {
		Rows []struct {
			Rule   string `json:"rule"`
			OK     bool   `json:"ok"`
			Detail string `json:"detail"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("explain-check printed no JSON: %v\n%s", err, out)
	}
	var detail string
	for _, row := range parsed.Rows {
		if row.Rule == "parrafos" {
			detail = row.Detail
		}
	}
	m := regexp.MustCompile(`(\d+) párrafo`).FindStringSubmatch(detail)
	if m == nil {
		t.Fatalf("explain-check printed no paragraph count: %q", detail)
	}
	toolCount, err := strconv.Atoi(m[1])
	if err != nil {
		t.Fatal(err)
	}
	if got := len(wallParagraphs(note, 2)); got != toolCount {
		t.Fatalf("wallParagraphs = %d, tools/explain-check.mjs = %d: the engine and the tutor's tool disagree", got, toolCount)
	}
	if toolCount != 2 {
		t.Fatalf("the fixture has 2 walls, the tool counted %d", toolCount)
	}
}

// The engine and the tutor's tool read the same annotated formula: the scene's
// callouts are the legend in both, and both refuse the same symbol. The tutor
// runs `node tools/explain-check.mjs` and must get the engine's verdict.
func TestPartStandardReadsFormulaScenesLikeExplainCheck(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	tool, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(tool); err != nil {
		t.Skipf("explain-check.mjs is not here: %v", err)
	}
	leyenda := func(note string) (bool, string) {
		t.Helper()
		file := filepath.Join(t.TempDir(), "parte.md")
		if err := os.WriteFile(file, []byte(note), 0o644); err != nil {
			t.Fatal(err)
		}
		out, _ := exec.Command(node, tool, file, "--json").CombinedOutput()
		var parsed struct {
			Rows []struct {
				Rule   string `json:"rule"`
				OK     bool   `json:"ok"`
				Detail string `json:"detail"`
			} `json:"rows"`
		}
		if err := json.Unmarshal(out, &parsed); err != nil {
			t.Fatalf("explain-check printed no JSON: %v\n%s", err, out)
		}
		for _, row := range parsed.Rows {
			if row.Rule == "leyenda" {
				return row.OK, row.Detail
			}
		}
		t.Fatalf("explain-check printed no legend row: %s", out)
		return false, ""
	}

	complete := standardNote("La densidad se dibuja símbolo por símbolo.\n\n" + annotatedFormulaScene)
	if got := unnamedSymbols(complete); len(got) != 0 {
		t.Fatalf("the engine refuses the annotated formula's legend: %v", got)
	}
	if ok, detail := leyenda(complete); !ok {
		t.Fatalf("the tool refuses the annotated formula the engine accepts: %s", detail)
	}

	incomplete := strings.Replace(complete, annotatedFormulaScene, annotatedFormulaSceneWithoutSigma, 1)
	if got := unnamedSymbols(incomplete); strings.Join(got, ",") != "σ" {
		t.Fatalf("unnamedSymbols = %v, want [σ]", got)
	}
	ok, detail := leyenda(incomplete)
	if ok {
		t.Fatalf("the tool accepts a formula the engine refuses: %s", detail)
	}
	for _, fragment := range []string{"σ", "escena anotada", "un callout numerado por símbolo"} {
		if !strings.Contains(detail, fragment) {
			t.Fatalf("the tool's legend detail %q misses %q", detail, fragment)
		}
	}

	// The letter is the same one in both: a `q` elsewhere in the part does not
	// name `Q`, so neither reads it as named.
	mismatch := standardNote("El valor se escribe así:\n\n<lk-math>Q(s,a) = c/(1-\\gamma)</lk-math>\n\n" +
		"Donde:\n\n- `q` es el valor de hacer `a` en `s`.\n- `c` es el coste de un paso.\n- `\\gamma` es el descuento.\n")
	if got := unnamedSymbols(mismatch); strings.Join(got, ",") != "Q" {
		t.Fatalf("unnamedSymbols = %v, want [Q]", got)
	}
	if ok, detail := leyenda(mismatch); ok {
		t.Fatalf("the tool names Q with a q: %s", detail)
	}
}

// The shape rules are additive keys of the same block: a snapshot that declared
// the standard before they existed keeps accepting the parts it accepted.
func TestPartStandardSnapshotWithoutTheShapeKeysKeepsAccepting(t *testing.T) {
	f := standardFrontierOn(t, snapshotWithoutShapeKeys(t))
	f.writeStandardPart(t, "Una. Dos. Tres. Cuatro.")
	rep, code, c := standardCheck(t, f)
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("advance explanation under the earlier snapshot = %q (exit %d), want accepted: %+v", rep.Status, code, rep.Checks)
	}
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the new keys are additive", c.Status, c.Reason)
	}
}

// The shape rules read what the reader sees: a scene inside a code fence is
// code, a price in prose is not a formula, and the plain LaTeX forms are read
// like the element.
func TestPartStandardReadsScenesAndFormulasLikeTheReader(t *testing.T) {
	cases := []struct {
		name    string
		text    string
		scenes  int
		symbols []string
		plain   bool
	}{
		{"a price is not math", "Cuesta $5 y $6 en la tienda.", 0, nil, false},
		{"inline math", "Con $x$ y $y$ se decide.", 0, []string{"x", "y"}, true},
		// `\cap` is an operator, not a symbol: the legend asks for the sets, never for
		// the command that intersects them.
		{"display math", `$$P(A \cap B)$$`, 0, []string{"P", "A", "B"}, true},
		{"the kit element is not plain", "<lk-math>Q(s,a)</lk-math>", 0, []string{"Q", "s", "a"}, false},
		{"a fenced scene is code", "```html\n" + standardScene + "\n```", 0, nil, false},
		{"a drawn scene", standardScene, 1, nil, false},
		// Una distribución es su curva: una escena que solo traza la campana dibuja.
		{"a curve draws", `<lk-scene><script type="application/json">{"scene":{"paths":[{"d":"M 48 214 C 51.7 213.9 62.7 214.2 70 213.6","arrow":false}]}}</script></lk-scene>`, 1, nil, false},
		{"a bent curve draws", `<lk-scene><script type="application/json">{"scene":{"curves":[{"x1":60,"y1":220,"x2":700,"y2":220}]}}</script></lk-scene>`, 1, nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := drawnScenes(tc.text); got != tc.scenes {
				t.Fatalf("drawnScenes = %d, want %d", got, tc.scenes)
			}
			bodies, plain := formulaBodies(tc.text)
			if plain != tc.plain {
				t.Fatalf("plain math = %v, want %v (bodies %v)", plain, tc.plain, bodies)
			}
			if got := formulaSymbols(tc.text); strings.Join(got, ",") != strings.Join(tc.symbols, ",") {
				t.Fatalf("formulaSymbols = %v, want %v", got, tc.symbols)
			}
		})
	}
}

// La fórmula viva de una parte real, la misma que mide `explain-check.mjs`: los
// comandos de LaTeX (\frac, \sqrt, \left, \right) no son símbolos, \pi y `e` son
// constantes, y las griegas que sí lo son se leen en las dos formas. Antes de esto
// la leyenda pedía nombrar los comandos y el tutor corregía una fórmula correcta.
func TestFormulaSymbolsReadsTheLiveFormula(t *testing.T) {
	const live = `f(x) = \frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{1}{2}\left(\frac{x-\mu}{\sigma}\right)^2}`
	got := formulaSymbols("<lk-math>" + live + "</lk-math>")
	names := map[string]bool{}
	for _, symbol := range got {
		names[strings.TrimPrefix(symbol, `\`)] = true
	}
	want := []string{"f", "x", "sigma", "mu"}
	if len(names) != len(want) {
		t.Fatalf("formulaSymbols = %v, want %v", got, want)
	}
	for _, name := range want {
		if !names[name] {
			t.Fatalf("formulaSymbols = %v, want %v", got, want)
		}
	}
}

// snapshotWithoutShapeKeys writes the production rules without the scene,
// paragraph and formula-element keys: what a run enrolled when the standard
// arrived (#185) carries in its frozen .learning/rules.json.
func snapshotWithoutShapeKeys(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	block, ok := doc["thresholds"].(map[string]any)["partStandard"].(map[string]any)
	delete(block, "register") // an older snapshot predates the register block
	if !ok {
		t.Fatal("the production rules declare no partStandard block")
	}
	for _, key := range []string{"minScenes", "maxSentencesPerParagraph", "formulaElement"} {
		delete(block, key)
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "standard-without-shape.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// snapshotWithoutFormulaWalkthrough is the production rules with the additive
// formula-walkthrough key removed: a run frozen before the rule keeps accepting
// the parts it accepted, exactly like the shape keys before it.
func snapshotWithoutFormulaWalkthrough(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	block, ok := doc["thresholds"].(map[string]any)["partStandard"].(map[string]any)
	delete(block, "register") // an older snapshot predates the register block
	if !ok {
		t.Fatal("the production rules declare no partStandard block")
	}
	delete(block, "formulaWalkthrough")
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "standard-without-formula-walkthrough.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// formulaStory is the formula walkthrough the rule asks for: the whole formula
// first, one symbol per middle step, and the evaluated formula last.
const formulaStory = `<lk-story>
<script type="application/json">
{"kind":"formula","title":"La densidad","viewBox":"0 0 360 250","formula":{"size":18,"atoms":[{"t":"f","id":"f"},{"t":"(","id":"open"},{"t":"x","id":"x"},{"t":")","id":"close"}]},
 "steps":[
  {"title":"La fórmula entera","focus":[],"narrator":"Es la densidad «f» en el punto «x».","stage":{"scene":{"actors":[{"id":"curva","x":120,"y":80,"w":120,"h":40,"label":"f(x)","tone":"blue"}],"labels":[{"x":180,"y":170,"text":"la campana"}]}}},
  {"title":"f: la densidad","focus":["f"],"narrator":"«f» es la densidad: la altura de la curva.","stage":{"scene":{"actors":[{"id":"curva","x":120,"y":80,"w":120,"h":40,"label":"f(x)","tone":"blue"}],"labels":[{"x":180,"y":170,"text":"la altura"}]}}},
  {"title":"x: el punto","focus":["x"],"narrator":"«x» es el punto que miras.","stage":{"scene":{"actors":[{"id":"curva","x":120,"y":80,"w":120,"h":40,"label":"f(x)","tone":"blue"}],"labels":[{"x":180,"y":170,"text":"la latencia"}]}}},
  {"title":"Con el ejemplo","focus":[],"narrator":"Con «x = 184», «f(184) = 0,000 65».","stage":{"scene":{"actors":[{"id":"curva","x":120,"y":80,"w":120,"h":40,"label":"f(184)","tone":"green"}],"labels":[{"x":180,"y":170,"text":"el resultado"}]}}}
 ]}
</script>
</lk-story>`

// The first formula of a part is taught by a formula walkthrough: a bare
// <lk-math> or a still scene is refused, and the refusal names the fix.
func TestPartStandardRefusesAFormulaWithoutAFormulaWalkthrough(t *testing.T) {
	f := standardFrontier(t)
	f.writeStandardPart(t, "La densidad se escribe así:\n\n<lk-math>f(x) = 1/(\\sigma\\sqrt{2\\pi})\\,\\exp(-(x-\\mu)^2/(2\\sigma^2))</lk-math>\n\n"+
		"Donde:\n\n- `f` es la densidad.\n- `x` es el punto.\n- `\\sigma` es el ancho.\n- `\\mu` es el centro.\n")
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" || !strings.Contains(c.Reason, "formula walkthrough") {
		t.Fatalf("explanation-standard = %s (%s), want FAIL on the formula walkthrough", c.Status, c.Reason)
	}
	for _, fragment := range []string{"<lk-story kind=\"formula\">", "step 1 the whole formula", "its value in the example"} {
		if !strings.Contains(c.Reason, fragment) {
			t.Fatalf("reason %q misses %q", c.Reason, fragment)
		}
	}
	t.Logf("formula walkthrough refusal: %s", c.Reason)
}

// With the formula walkthrough the same part passes: the rule is the deck, not
// the formula.
func TestPartStandardAcceptsAFormulaTaughtByAFormulaWalkthrough(t *testing.T) {
	f := standardFrontier(t)
	note := strings.Replace(standardNote("Imagina una campana de valores.\n\n**Densidad**: es la forma de la campana.\n\nLa densidad se explica paso a paso. Antes era plana; después se ve el pico.\n"), fixtureStory, formulaStory, 1)
	f.writePartNote(t, note)
	rep, code, c := standardCheck(t, f)
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("advance explanation = %q (exit %d), want accepted: %+v", rep.Status, code, rep.Checks)
	}
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the formula has its walkthrough", c.Status, c.Reason)
	}
}

// A frozen snapshot that does not declare the formula-walkthrough key keeps
// accepting the parts it accepted: the key is additive.
func TestPartStandardSnapshotWithoutFormulaWalkthroughKeepsAccepting(t *testing.T) {
	f := standardFrontierOn(t, snapshotWithoutFormulaWalkthrough(t))
	f.writeStandardPart(t, "La densidad se escribe así:\n\n<lk-math>f(x) = 1/(\\sigma\\sqrt{2\\pi})</lk-math>\n\n"+
		"Donde:\n\n- `f` es la densidad.\n- `x` es el punto.\n- `\\sigma` es el ancho.\n")
	rep, code, c := standardCheck(t, f)
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("advance explanation = %q (exit %d), want accepted: %+v", rep.Status, code, rep.Checks)
	}
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the key is additive", c.Status, c.Reason)
	}
}

// The engine and the tutor's tool read the formula walkthrough the same way: the
// first formula of the part without a formula story is refused by both, and both
// name the fix; with the story, both accept it. The tutor runs
// `node tools/explain-check.mjs` and must get the engine's verdict.
func TestPartStandardReadsTheFormulaWalkthroughLikeExplainCheck(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	tool, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(tool); err != nil {
		t.Skipf("explain-check.mjs is not here: %v", err)
	}
	row := func(note string) (bool, string) {
		t.Helper()
		file := filepath.Join(t.TempDir(), "parte.md")
		if err := os.WriteFile(file, []byte(note), 0o644); err != nil {
			t.Fatal(err)
		}
		out, _ := exec.Command(node, tool, file, "--json").CombinedOutput()
		var parsed struct {
			Rows []struct {
				Rule   string `json:"rule"`
				OK     bool   `json:"ok"`
				Detail string `json:"detail"`
			} `json:"rows"`
		}
		if err := json.Unmarshal(out, &parsed); err != nil {
			t.Fatalf("explain-check printed no JSON: %v\n%s", err, out)
		}
		for _, r := range parsed.Rows {
			if r.Rule == "formula-walkthrough" {
				return r.OK, r.Detail
			}
		}
		t.Fatalf("explain-check printed no formula-walkthrough row: %s", out)
		return false, ""
	}

	without := standardNote("La densidad se escribe así:\n\n<lk-math>f(x) = 1/(\\sigma\\sqrt{2\\pi})</lk-math>\n\n" +
		"Donde:\n\n- `f` es la densidad.\n- `x` es el punto.\n- `\\sigma` es el ancho.\n")
	if ok, detail := row(without); ok {
		t.Fatalf("the tool accepts a formula the engine refuses: %s", detail)
	} else if !strings.Contains(detail, "<lk-story kind=\"formula\">") {
		t.Fatalf("the tool's refusal %q does not name the fix", detail)
	}
	if findings := formulaWalkthroughFindings(without, rules.PartStandardThresholds{FormulaWalkthrough: true}); len(findings) == 0 {
		t.Fatal("the engine accepts a formula without its walkthrough")
	} else if !strings.Contains(findings[0], "<lk-story kind=\"formula\">") {
		t.Fatalf("the engine's refusal %q does not name the fix", findings[0])
	}

	with := strings.Replace(standardNote("La densidad se explica paso a paso.\n"), fixtureStory, formulaStory, 1)
	if ok, detail := row(with); !ok {
		t.Fatalf("the tool refuses the formula walkthrough the engine accepts: %s", detail)
	}
	if findings := formulaWalkthroughFindings(with, rules.PartStandardThresholds{FormulaWalkthrough: true}); len(findings) != 0 {
		t.Fatalf("the engine refuses the formula walkthrough the tool accepts: %v", findings)
	}
}

// snapshotWithoutStoryLanguage is the production rules with the additive
// story-language key removed: a run frozen before the rule keeps accepting the
// parts it accepted, exactly like the formula-walkthrough key before it.
func snapshotWithoutStoryLanguage(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	block, ok := doc["thresholds"].(map[string]any)["partStandard"].(map[string]any)
	delete(block, "register") // an older snapshot predates the register block
	if !ok {
		t.Fatal("the production rules declare no partStandard block")
	}
	delete(block, "storyLanguage")
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "standard-without-story-language.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// sqlPartOne is the part the learner refused (#237): a scene and a classic
// `<lk-walkthrough>`, the deck whose free-form boxes and arrows draw badly. It
// was written by the studio with the agy runtime and passed every gate.
func sqlPartOne(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "sql-parte-1.md"))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// The story language is not optional: a part whose step-by-step visual is a
// classic `<lk-walkthrough>` is refused, and the refusal names the element to
// use instead of the deck it must drop.
func TestPartStandardRefusesAPartWithOnlyAClassicWalkthrough(t *testing.T) {
	f := standardFrontier(t)
	f.writePartNote(t, sqlPartOne(t))
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" {
		t.Fatalf("explanation-standard = %s (%s), want FAIL on the story language", c.Status, c.Reason)
	}
	t.Logf("story-language refusal: %s", c.Reason)
	for _, fragment := range []string{
		"no story and no piece",
		"usa una historia por pasos <lk-story>",
		"<lk-cards>",
		"<lk-memory>",
		"<lk-tables>",
		"<lk-venn>",
		"a classic <lk-walkthrough> alone does not count",
	} {
		if !strings.Contains(c.Reason, fragment) {
			t.Fatalf("reason %q misses %q", c.Reason, fragment)
		}
	}
}

// A part with only a scene (or only SVG) carries no story and no piece: the story
// language is required, not offered. The refusal names the element to use.
func TestPartStandardRefusesAPartWithOnlyAScene(t *testing.T) {
	f := standardFrontier(t)
	f.writePartNote(t, strings.Replace(standardNote("Hay decisiones donde acertar ahora no sirve."), fixtureStory, "", 1))
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" {
		t.Fatalf("explanation-standard = %s (%s), want FAIL on the story language", c.Status, c.Reason)
	}
	t.Logf("scene-only refusal: %s", c.Reason)
	for _, fragment := range []string{
		"no story and no piece",
		"usa una historia por pasos <lk-story>",
		"<lk-cards>",
		"a classic <lk-walkthrough> alone does not count",
	} {
		if !strings.Contains(c.Reason, fragment) {
			t.Fatalf("reason %q misses %q", c.Reason, fragment)
		}
	}
}

// The same part with its deck written as a story passes the rule: the standard
// asks for the story language, not for a particular drawing. The live part also
// carries walls of prose, so the deck is swapped on the standard-shaped part.
func TestPartStandardAcceptsAPartWhoseDeckIsAStory(t *testing.T) {
	f := standardFrontier(t)
	f.writeStandardPart(t, "Imagina un robot en una habitación sucia.\n\n**Robot**: es quien decide qué hacer. Antes decidía a ciegas; después mira su batería.\n\nHay decisiones donde acertar ahora no sirve.")
	rep, code, c := standardCheck(t, f)
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("advance explanation = %q (exit %d), want accepted: %+v", rep.Status, code, rep.Checks)
	}
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the deck is a story", c.Status, c.Reason)
	}
	if !strings.Contains(c.Reason, "story or piece block(s) (at least 1)") {
		t.Fatalf("pass reason does not report the story count: %s", c.Reason)
	}
}

// A frozen snapshot that does not declare the story-language key keeps accepting
// the parts it accepted: the key is additive.
func TestPartStandardSnapshotWithoutStoryLanguageKeepsAccepting(t *testing.T) {
	f := standardFrontierOn(t, snapshotWithoutStoryLanguage(t))
	// The standard-shaped part with its deck written as the classic walkthrough:
	// the only rule it misses is the story language, so a frozen snapshot that
	// does not declare the key keeps accepting it.
	f.writePartNote(t, strings.Replace(standardNote("Hay decisiones donde acertar ahora no sirve."), fixtureStory, fixtureWalkthrough, 1))
	rep, code, c := standardCheck(t, f)
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("advance explanation = %q (exit %d), want accepted: %+v", rep.Status, code, rep.Checks)
	}
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the key is additive", c.Status, c.Reason)
	}
}

// The rule is mandatory: a story or a piece is the story language, and a scene,
// an inline SVG or the classic walkthrough is not. Markup inside a code fence is
// an example, not a drawing, so it does not count either.
func TestStoryLanguageCountsAStoryOrAPiece(t *testing.T) {
	th := rules.PartStandardThresholds{StoryLanguage: true}
	cards := `<lk-cards>
<script type="application/json">
{"cards":[{"verdict":"ok","title":"compila"},{"verdict":"no","title":"no compila"}]}
</script>
</lk-cards>`
	for _, tc := range []struct {
		name string
		note string
		ok   bool
	}{
		{"a story", fixtureStory, true},
		{"verdict cards", cards, true},
		{"a classic walkthrough", fixtureWalkthrough, false},
		{"a classic walkthrough and a piece", fixtureWalkthrough + "\n\n" + cards, true},
		{"a still scene with no deck", standardScene, false},
		{"an inline SVG", `<svg viewBox="0 0 100 50"><text x="10" y="20">hola</text></svg>`, false},
		{"a classic walkthrough inside a code fence", "```html\n" + fixtureWalkthrough + "\n```", false},
		{"a story inside a code fence", "```html\n" + fixtureStory + "\n```", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			findings := storyLanguageFindings(tc.note, th)
			if tc.ok && len(findings) != 0 {
				t.Fatalf("refused a part that carries the story language: %v", findings)
			}
			if !tc.ok && len(findings) == 0 {
				t.Fatal("accepted a part that carries no story and no piece")
			}
		})
	}
	if findings := storyLanguageFindings(fixtureWalkthrough, rules.PartStandardThresholds{}); len(findings) != 0 {
		t.Fatalf("a snapshot without the key applied the rule: %v", findings)
	}
}

// The engine and the tutor's tool read the story language the same way: both
// refuse the part whose only deck is the classic walkthrough and both name the
// element to use, and both accept the same part once its deck is a story. The
// tutor runs `node tools/explain-check.mjs` and must get the engine's verdict.
func TestPartStandardReadsTheStoryLanguageLikeExplainCheck(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	tool, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(tool); err != nil {
		t.Skipf("explain-check.mjs is not here: %v", err)
	}
	row := func(note string) (bool, string) {
		t.Helper()
		file := filepath.Join(t.TempDir(), "parte.md")
		if err := os.WriteFile(file, []byte(note), 0o644); err != nil {
			t.Fatal(err)
		}
		out, _ := exec.Command(node, tool, file, "--json").CombinedOutput()
		var parsed struct {
			Rows []struct {
				Rule   string `json:"rule"`
				OK     bool   `json:"ok"`
				Detail string `json:"detail"`
			} `json:"rows"`
		}
		if err := json.Unmarshal(out, &parsed); err != nil {
			t.Fatalf("explain-check printed no JSON: %v\n%s", err, out)
		}
		for _, r := range parsed.Rows {
			if r.Rule == "historia" {
				return r.OK, r.Detail
			}
		}
		t.Fatalf("explain-check printed no historia row: %s", out)
		return false, ""
	}

	without := sqlPartOne(t)
	if ok, detail := row(without); ok {
		t.Fatalf("the tool accepts a part the engine refuses: %s", detail)
	} else if !strings.Contains(detail, "usa una historia por pasos <lk-story>") {
		t.Fatalf("the tool's refusal %q does not name the fix", detail)
	}
	if findings := storyLanguageFindings(without, rules.PartStandardThresholds{StoryLanguage: true}); len(findings) == 0 {
		t.Fatal("the engine accepts a part without the story language")
	} else if !strings.Contains(findings[0], "usa una historia por pasos <lk-story>") {
		t.Fatalf("the engine's refusal %q does not name the fix", findings[0])
	}

	// A part with only a scene carries no story and no piece: both refuse it, with
	// the same fix named, so the tutor's own run of the tool matches the engine.
	sceneOnly := strings.Replace(standardNote("Hay decisiones donde acertar ahora no sirve."), fixtureStory, "", 1)
	if ok, detail := row(sceneOnly); ok {
		t.Fatalf("the tool accepts a scene-only part the engine refuses: %s", detail)
	} else if !strings.Contains(detail, "usa una historia por pasos <lk-story>") {
		t.Fatalf("the tool's refusal %q does not name the fix", detail)
	}
	if findings := storyLanguageFindings(sceneOnly, rules.PartStandardThresholds{StoryLanguage: true}); len(findings) == 0 {
		t.Fatal("the engine accepts a scene-only part")
	} else if !strings.Contains(findings[0], "usa una historia por pasos <lk-story>") {
		t.Fatalf("the engine's refusal %q does not name the fix", findings[0])
	}

	with := standardNote("Hay decisiones donde acertar ahora no sirve.")
	if ok, detail := row(with); !ok {
		t.Fatalf("the tool refuses the story the engine accepts: %s", detail)
	}
	if findings := storyLanguageFindings(with, rules.PartStandardThresholds{StoryLanguage: true}); len(findings) != 0 {
		t.Fatalf("the engine refuses the story the tool accepts: %v", findings)
	}
}

// ── Story quality (#243) ─────────────────────────────────────────────────────
// La Parte 1 de PL/SQL pasó el estándar y el alumno la rechazó: su historia no
// lleva la línea de SQL en la cabecera y sus pasos dibujan solo cajas con texto.
// Las dos reglas son estructurales y aditivas, como el lenguaje de historia.

// plsqlPartOne is the part the learner refused (#243): one scene and one story,
// every gate green, and the story is a row of boxes with an empty header.
func plsqlPartOne(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "plsql-parte-1.md"))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// boxesOnlyStory is a story whose every step draws two boxes with their text: no
// actor, no prop, no move, no pointer, no connector and no piece.
const boxesOnlyStory = `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Las dos cuentas","viewBox":"0 0 360 210","steps":[
 {"title":"Los saldos","narrator":"Las dos cuentas están en reposo.","stage":{"scene":{"boxes":[{"x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","sub":"saldo: 1000","tone":"slate"},{"x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","sub":"saldo: 1000","tone":"slate"}]}}},
 {"title":"El débito","narrator":"El débito resta 200 en la cuenta 10.","stage":{"scene":{"boxes":[{"x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","sub":"saldo: 800","tone":"blue"},{"x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","sub":"saldo: 1000","tone":"slate"}],"marks":[{"kind":"ok","actors":["c10"]}]}}},
 {"title":"El commit","narrator":"El commit graba el saldo 800 en disco.","stage":{"scene":{"boxes":[{"x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","sub":"saldo: 800","tone":"green"},{"x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","sub":"saldo: 1000","tone":"green"}],"marks":[{"kind":"ok","actors":["c10"]}]}}}
]}
</script>
</lk-story>`

// A story that draws the action: actors with their state and a mark that closes
// it. Its header carries the line of the part, one token highlighted per step.
const storyWithHeader = `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"El débito","viewBox":"0 0 360 210","steps":[
 {"title":"Débito","equation":{"size":18,"atoms":[{"t":"UPDATE ","id":"u"},{"t":"cuentas","id":"t"},{"t":" SET saldo = saldo - 200","id":"set"}]},"focus":["set"],
  "narrator":"El débito resta 200 en la cuenta 10.","stage":{"scene":{"actors":[{"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","tone":"blue"}],"marks":[{"kind":"ok","actors":["c10"]}]}}}
]}
</script>
</lk-story>`

// The header rule: a part that teaches code carries that line in the story
// header. The real part is the proof, and the fix names the keys that fill it.
func TestStoryHeaderRefusesAStoryWithAnEmptyHeader(t *testing.T) {
	th := rules.PartStandardThresholds{StoryHeader: true}
	findings := storyHeaderFindings(plsqlPartOne(t), th)
	if len(findings) == 0 {
		t.Fatal("the engine accepts a story with an empty header on a part that teaches SQL")
	}
	for _, fragment := range []string{"equation.atoms", "formula.atoms", "focus"} {
		if !strings.Contains(findings[0], fragment) {
			t.Fatalf("the refusal %q does not name %q", findings[0], fragment)
		}
	}
	if findings := storyHeaderFindings(storyWithHeader, th); len(findings) != 0 {
		t.Fatalf("the engine refuses a story that carries its line: %v", findings)
	}
	// A part that teaches no code and no formula has no line to carry.
	if findings := storyHeaderFindings(fixtureStory, th); len(findings) != 0 {
		t.Fatalf("the engine asked a part with no code for a header line: %v", findings)
	}
	// A snapshot that does not declare the key keeps accepting the part.
	if findings := storyHeaderFindings(plsqlPartOne(t), rules.PartStandardThresholds{}); len(findings) != 0 {
		t.Fatalf("a snapshot without the key applied the rule: %v", findings)
	}
}

// The stage rule: a story whose every step draws only boxes with text is
// refused, and the refusal names the vocabulary to use.
func TestStoryStageRefusesAStoryOfBoxesWithText(t *testing.T) {
	th := rules.PartStandardThresholds{StoryStage: true}
	findings := storyStageFindings(plsqlPartOne(t), th)
	if len(findings) == 0 {
		t.Fatal("the engine accepts a story whose every step draws only boxes with text")
	}
	for _, fragment := range []string{"actors", "props", "moves", "<lk-cards>", "<lk-memory>", "<lk-tables>", "<lk-venn>"} {
		if !strings.Contains(findings[0], fragment) {
			t.Fatalf("the refusal %q does not name %q", findings[0], fragment)
		}
	}
	if findings := storyStageFindings(storyWithHeader, th); len(findings) != 0 {
		t.Fatalf("the engine refuses a story that draws actors: %v", findings)
	}
	// A piece is the action: a step that draws cards is not a row of boxes.
	withPiece := strings.Replace(fixtureStory, `"stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","tag":"robot"}]}}`,
		`"stage":{"cards":{"cards":[{"verdict":"ok","title":"compila"}]}}`, 1)
	if findings := storyStageFindings(withPiece, th); len(findings) != 0 {
		t.Fatalf("the engine refuses a story that draws a piece: %v", findings)
	}
	if findings := storyStageFindings(plsqlPartOne(t), rules.PartStandardThresholds{}); len(findings) != 0 {
		t.Fatalf("a snapshot without the key applied the rule: %v", findings)
	}
}

// The story-quality keys are additive: the production rules declare them, and a
// snapshot with them removed keeps accepting the part they refuse. A story of
// boxes with text carries no actor, no move and no prop, so it is also quiet: the
// motion key belongs to the same family and is removed here too (#246).
func TestPartStandardSnapshotWithoutStoryQualityKeepsAccepting(t *testing.T) {
	raw, err := os.ReadFile(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	block, ok := doc["thresholds"].(map[string]any)["partStandard"].(map[string]any)
	delete(block, "register") // an older snapshot predates the register block
	if !ok {
		t.Fatal("the production rules declare no partStandard block")
	}
	for _, key := range []string{"storyHeader", "storyStage", "storyMotion", "arrowFlows", "deadKeys"} {
		if block[key] != true {
			t.Fatalf("the production rules do not declare %q", key)
		}
		delete(block, key)
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "standard-without-story-quality.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}

	// The part the rules refuse: a fenced line of code and a story of boxes.
	body := "El débito se escribe así:\n\n```sql\nUPDATE cuentas SET saldo = saldo - 200;\n```\n"
	note := strings.Replace(standardNote(body), fixtureStory, boxesOnlyStory, 1)

	f := standardFrontierOn(t, path)
	f.writePartNote(t, note)
	rep, code, c := standardCheck(t, f)
	if code != 0 || rep.Status != "accepted" {
		for _, check := range rep.Checks {
			if check.Status != "PASS" {
				t.Logf("blocking check %s = %s: %s", check.ID, check.Status, check.Reason)
			}
		}
		t.Fatalf("advance explanation = %q (exit %d), want accepted", rep.Status, code)
	}
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the keys are additive", c.Status, c.Reason)
	}

	// The same part on the production rules is refused, and the refusal names
	// both rules.
	f2 := standardFrontier(t)
	f2.writePartNote(t, note)
	rep2, code2, c2 := standardCheck(t, f2)
	assertBlocked(t, rep2, code2)
	if c2.Status != "FAIL" {
		t.Fatalf("explanation-standard = %s (%s), want FAIL on the story quality", c2.Status, c2.Reason)
	}
	for _, fragment := range []string{"story header is empty", "solo cajas con texto"} {
		if !strings.Contains(c2.Reason, fragment) {
			t.Fatalf("reason %q misses %q", c2.Reason, fragment)
		}
	}
}

// The engine and the tutor's tool read the story quality the same way: both
// refuse the real part and both name the same fix, so the tutor's own run of
// `node tools/explain-check.mjs` matches the refusal it gets here.
func TestPartStandardReadsTheStoryQualityLikeExplainCheck(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	tool, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(tool); err != nil {
		t.Skipf("explain-check.mjs is not here: %v", err)
	}
	rows := func(note string) map[string]string {
		t.Helper()
		file := filepath.Join(t.TempDir(), "parte.md")
		if err := os.WriteFile(file, []byte(note), 0o644); err != nil {
			t.Fatal(err)
		}
		out, _ := exec.Command(node, tool, file, "--json").CombinedOutput()
		var parsed struct {
			Rows []struct {
				Rule   string `json:"rule"`
				OK     bool   `json:"ok"`
				Detail string `json:"detail"`
			} `json:"rows"`
		}
		if err := json.Unmarshal(out, &parsed); err != nil {
			t.Fatalf("explain-check printed no JSON: %v\n%s", err, out)
		}
		seen := map[string]string{}
		for _, r := range parsed.Rows {
			seen[r.Rule] = r.Detail
		}
		return seen
	}
	th := rules.PartStandardThresholds{StoryHeader: true, StoryStage: true}
	part := plsqlPartOne(t)
	seen := rows(part)
	for rule, findings := range map[string][]string{
		"historia-cabecera":  storyHeaderFindings(part, th),
		"escenario-de-cajas": storyStageFindings(part, th),
	} {
		detail, ok := seen[rule]
		if !ok {
			t.Fatalf("explain-check printed no %s row", rule)
		}
		if detail == "" {
			t.Fatalf("the tool accepts the real part on %s, the engine refuses it: %v", rule, findings)
		}
		if len(findings) == 0 {
			t.Fatalf("the engine accepts the real part on %s, the tool refuses it: %s", rule, detail)
		}
	}
}

// ── Actor characters and still scenes (#245) ────────────────────────────────
// La Parte 1 de PL/SQL pasó todas las puertas y el alumno la rechazó igual: sus
// actores son rectángulos con su nombre («Cuenta 10») cuando la idea tiene
// personaje, y su escena quieta es dos cajas y una flecha. Las dos reglas se leen
// del JSON, son estructurales y aditivas, como el lenguaje de historia.

// plsqlActorsPart is the part the learner refused (#245): every gate green, and
// its actors are boxes with a name tag while a character fits.
func plsqlActorsPart(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "plsql-parte-1-actores.md"))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// charactersStory draws the same two rows as characters: a table row carries its
// value and a session runs the block.
const charactersStory = `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Las dos cuentas","viewBox":"0 0 360 210","steps":[
 {"title":"Los saldos","equation":{"atoms":[{"t":"SELECT saldo FROM cuentas;","id":"q"}]},"focus":["q"],"narrator":"Las dos cuentas están en reposo.","stage":{"scene":{"actors":[{"id":"c10","kind":"row","x":90,"y":120,"size":64,"tone":"slate","tag":"Cuenta 10"},{"id":"c20","kind":"row","x":270,"y":120,"size":64,"tone":"slate","tag":"Cuenta 20"}],"props":[{"id":"saldo10","kind":"value","on":"c10","side":"below","label":"1000"}]}}}
]}
</script>
</lk-story>`

// namedBoxesStory draws the same two rows as boxes with their name: it draws the
// action in every step (actors, props, marks), so the story-stage rule is
// satisfied, and it is refused only by the character rule.
const namedBoxesStory = `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Las dos cuentas","viewBox":"0 0 360 210","steps":[
 {"title":"Los saldos","equation":{"atoms":[{"t":"SELECT saldo FROM cuentas;","id":"q"}]},"focus":["q"],"narrator":"Las dos cuentas están en reposo.","stage":{"scene":{"actors":[{"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","tone":"slate"},{"id":"c20","x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","tone":"slate"}],"props":[{"id":"saldo10","kind":"value","on":"c10","side":"below","label":"1000"}]}}},
 {"title":"El débito","equation":{"atoms":[{"t":"UPDATE cuentas SET saldo = saldo - 200;","id":"u"}]},"focus":["u"],"narrator":"El débito resta 200 en la cuenta 10.","stage":{"scene":{"actors":[{"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","tone":"blue"},{"id":"c20","x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","tone":"slate"}],"props":[{"id":"saldo10","kind":"value","on":"c10","side":"below","label":"800"}],"marks":[{"kind":"ok","actors":["c10"]}]}}},
 {"title":"El commit","equation":{"atoms":[{"t":"COMMIT;","id":"c"}]},"focus":["c"],"narrator":"El commit graba el saldo 800 en disco.","stage":{"scene":{"actors":[{"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","tone":"green"},{"id":"c20","x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","tone":"green"}],"props":[{"id":"saldo10","kind":"value","on":"c10","side":"below","label":"800"}],"marks":[{"kind":"ok","actors":["c10"]}]}}}
]}
</script>
</lk-story>`

// boxesScene is the still scene the learner refused (#245): two boxes with their
// text and the arrow between them, and nothing else.
const boxesScene = `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 200","title":"Dos cajas","caption":"El estado entra y la acción sale.","scene":{"boxes":[{"x":88,"y":48,"w":212,"h":100,"label":"el estado","tone":"blue","size":22},{"x":420,"y":48,"w":212,"h":100,"label":"la acción","tone":"green","size":22}],"arrows":[{"x1":306,"y1":98,"x2":412,"y2":98,"tone":"slate","width":3,"label":"sale"}]}}
</script>
</lk-scene>`

// charactersScene is a still scene that draws a character instead of a second box.
const charactersScene = `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 200","title":"La sesión y el disco","caption":"La sesión escribe en el disco.","scene":{"boxes":[{"x":88,"y":48,"w":212,"h":100,"label":"la sesión","tone":"blue","size":22}],"icons":[{"kind":"database","x":352,"y":98,"size":72,"tone":"green"}]}}
</script>
</lk-scene>`

// The character rule: a story whose actors are all boxes, when the name of one
// names a character, is refused, and the refusal names the character that fits
// and the ones the kit draws.
func TestActorCharacterRefusesActorsThatAreBoxes(t *testing.T) {
	th := rules.PartStandardThresholds{ActorCharacter: true}
	findings := actorCharacterFindings(plsqlActorsPart(t), th)
	if len(findings) == 0 {
		t.Fatal("the engine accepts actors that are boxes with a name when a character fits")
	}
	for _, fragment := range []string{"Cuenta 10", "row", "database", "session", "lock", "server", "process", "file", "packet", "robot"} {
		if !strings.Contains(findings[0], fragment) {
			t.Fatalf("the refusal %q does not name %q", findings[0], fragment)
		}
	}
	if findings := actorCharacterFindings(charactersStory, th); len(findings) != 0 {
		t.Fatalf("the engine refuses a story that draws its characters: %v", findings)
	}
	// A story whose actors name no character has no character to draw.
	if findings := actorCharacterFindings(fixtureStory, th); len(findings) != 0 {
		t.Fatalf("the engine asked a story with no character for one: %v", findings)
	}
	// A snapshot that does not declare the key keeps accepting the part.
	if findings := actorCharacterFindings(plsqlActorsPart(t), rules.PartStandardThresholds{}); len(findings) != 0 {
		t.Fatalf("a snapshot without the key applied the rule: %v", findings)
	}
}

// The still-scene rule: a `<lk-scene>` that only draws boxes with text and arrows
// is refused, with the same bar the story stage is held to.
func TestSceneStageRefusesASceneOfBoxesAndArrows(t *testing.T) {
	th := rules.PartStandardThresholds{SceneStage: true}
	findings := sceneStageFindings(plsqlActorsPart(t), th)
	if len(findings) == 0 {
		t.Fatal("the engine accepts a still scene of boxes with text and arrows")
	}
	for _, fragment := range []string{"<lk-scene>", "lk-memory", "lk-tables", "kind"} {
		if !strings.Contains(findings[0], fragment) {
			t.Fatalf("the refusal %q does not name %q", findings[0], fragment)
		}
	}
	if findings := sceneStageFindings(charactersScene, th); len(findings) != 0 {
		t.Fatalf("the engine refuses a scene that draws a character: %v", findings)
	}
	// A scene that draws a piece is not a scene of boxes either.
	if findings := sceneStageFindings(fixtureStory, th); len(findings) != 0 {
		t.Fatalf("the engine refused a part with no still scene: %v", findings)
	}
	if findings := sceneStageFindings(plsqlActorsPart(t), rules.PartStandardThresholds{}); len(findings) != 0 {
		t.Fatalf("a snapshot without the key applied the rule: %v", findings)
	}
}

// The two keys are additive: the production rules declare them, and a snapshot
// with them removed keeps accepting the part they refuse.
func TestPartStandardSnapshotWithoutCharactersKeepsAccepting(t *testing.T) {
	raw, err := os.ReadFile(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	block, ok := doc["thresholds"].(map[string]any)["partStandard"].(map[string]any)
	delete(block, "register") // an older snapshot predates the register block
	if !ok {
		t.Fatal("the production rules declare no partStandard block")
	}
	for _, key := range []string{"actorCharacter", "sceneStage"} {
		if block[key] != true {
			t.Fatalf("the production rules do not declare %q", key)
		}
		delete(block, key)
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "standard-without-characters.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}

	// The part the rules refuse: a still scene of boxes and arrows, and actors
	// that are boxes with a name a character fits.
	note := strings.Replace(standardNote("El débito se escribe así."), standardScene, boxesScene, 1)
	note = strings.Replace(note, fixtureStory, namedBoxesStory, 1)

	f := standardFrontierOn(t, path)
	f.writePartNote(t, note)
	rep, code, c := standardCheck(t, f)
	if code != 0 || rep.Status != "accepted" {
		for _, check := range rep.Checks {
			if check.Status != "PASS" {
				t.Logf("blocking check %s = %s: %s", check.ID, check.Status, check.Reason)
			}
		}
		t.Fatalf("advance explanation = %q (exit %d), want accepted", rep.Status, code)
	}
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the keys are additive", c.Status, c.Reason)
	}

	// The same part on the production rules is refused, and the refusal names
	// both rules.
	f2 := standardFrontier(t)
	f2.writePartNote(t, note)
	rep2, code2, c2 := standardCheck(t, f2)
	assertBlocked(t, rep2, code2)
	if c2.Status != "FAIL" {
		t.Fatalf("explanation-standard = %s (%s), want FAIL on the characters", c2.Status, c2.Reason)
	}
	for _, fragment := range []string{"cajas con su nombre", "solo dibuja cajas"} {
		if !strings.Contains(c2.Reason, fragment) {
			t.Fatalf("reason %q misses %q", c2.Reason, fragment)
		}
	}
}

// The engine and the tutor's tool read the characters the same way: both refuse
// the real part and both name the same fix.
func TestPartStandardReadsTheCharactersLikeExplainCheck(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	tool, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(tool); err != nil {
		t.Skipf("explain-check.mjs is not here: %v", err)
	}
	rows := func(note string) map[string]string {
		t.Helper()
		file := filepath.Join(t.TempDir(), "parte.md")
		if err := os.WriteFile(file, []byte(note), 0o644); err != nil {
			t.Fatal(err)
		}
		out, _ := exec.Command(node, tool, file, "--json").CombinedOutput()
		var parsed struct {
			Rows []struct {
				Rule   string `json:"rule"`
				OK     bool   `json:"ok"`
				Detail string `json:"detail"`
			} `json:"rows"`
		}
		if err := json.Unmarshal(out, &parsed); err != nil {
			t.Fatalf("explain-check printed no JSON: %v\n%s", err, out)
		}
		seen := map[string]string{}
		for _, r := range parsed.Rows {
			seen[r.Rule] = r.Detail
		}
		return seen
	}
	th := rules.PartStandardThresholds{ActorCharacter: true, SceneStage: true}
	part := plsqlActorsPart(t)
	seen := rows(part)
	for rule, findings := range map[string][]string{
		"actor-sin-personaje": actorCharacterFindings(part, th),
		"escenario-de-cajas":  sceneStageFindings(part, th),
	} {
		detail, ok := seen[rule]
		if !ok {
			t.Fatalf("explain-check printed no %s row", rule)
		}
		if detail == "" {
			t.Fatalf("the tool accepts the real part on %s, the engine refuses it: %v", rule, findings)
		}
		if len(findings) == 0 {
			t.Fatalf("the engine accepts the real part on %s, the tool refuses it: %s", rule, detail)
		}
	}
}

// ── What the bench measured (#246) ──────────────────────────────────────────
// The five parts of the bench passed every gate and taught nothing: their
// derivations are two still robots for three steps, their story header is a
// text-arrow flow («Cliente ---[ SYN ]---> Servidor»), and every step carries a
// `scene` the schema never reads. The three rules are structural and additive.

func tcpPartOne(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "tcp-parte-1-banco.md"))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// The motion rule: a derivation whose steps move nothing — no `moves`, no actor
// state change, no prop that changes, no pointer — is the same picture three times.
func TestStoryMotionRefusesAStoryThatNeverMoves(t *testing.T) {
	th := rules.PartStandardThresholds{StoryMotion: true}
	findings := storyMotionFindings(tcpPartOne(t), th)
	if len(findings) == 0 {
		t.Fatal("the engine accepts a derivation whose steps move nothing")
	}
	for _, fragment := range []string{"moves", "estado", "3 paso"} {
		if !strings.Contains(findings[0], fragment) {
			t.Fatalf("the refusal %q does not name %q", findings[0], fragment)
		}
	}
	// The approved fixture changes a state (the robot fades), so it moves.
	if findings := storyMotionFindings(fixtureStory, th); len(findings) != 0 {
		t.Fatalf("the engine refuses a story that changes a state: %v", findings)
	}
	// A formula story advances by its header token, not by its stage.
	if findings := storyMotionFindings(formulaStory, th); len(findings) != 0 {
		t.Fatalf("the engine asked a formula story for stage motion: %v", findings)
	}
	if findings := storyMotionFindings(tcpPartOne(t), rules.PartStandardThresholds{}); len(findings) != 0 {
		t.Fatalf("a snapshot without the key applied the rule: %v", findings)
	}
}

// The arrow rule: a story header or a scene label written as a text flow is
// geometry written, not drawn, and the prose rule covers it too.
func TestArrowFlowRefusesAHeaderWrittenWithDashes(t *testing.T) {
	th := rules.PartStandardThresholds{ArrowFlows: true}
	findings := arrowFlowFindings(tcpPartOne(t), th)
	if len(findings) == 0 {
		t.Fatal("the engine accepts a story header written as a text-arrow flow")
	}
	for _, fragment := range []string{"cabecera", "--->", "---["} {
		if !strings.Contains(findings[0], fragment) {
			t.Fatalf("the refusal %q does not name %q", findings[0], fragment)
		}
	}
	if findings := arrowFlowFindings(storyWithHeader, th); len(findings) != 0 {
		t.Fatalf("the engine refused a header that carries its code line: %v", findings)
	}
	// A label of the scene with a flow is the same defect.
	labelled := `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 200","scene":{"labels":[{"x":380,"y":120,"text":"[Inicio] ---> [Perfil]","size":18}],"icons":[{"kind":"gear","x":200,"y":60,"size":48}]}}
</script>
</lk-scene>`
	if findings := arrowFlowFindings(labelled, th); len(findings) == 0 {
		t.Fatal("the engine accepts a scene label written as a text-arrow flow")
	}
	// The prose rule uses the same pattern: the geometry is drawn, not written.
	if drawn := drawnLines("El flujo es Cliente ---> Servidor y vuelve.", th); drawn != 1 {
		t.Fatalf("drawnLines counted %d for a prose text arrow, want 1", drawn)
	}
	if findings := arrowFlowFindings(tcpPartOne(t), rules.PartStandardThresholds{}); len(findings) != 0 {
		t.Fatalf("a snapshot without the key applied the rule: %v", findings)
	}
}

// The dead-key rule: a step key the schema never reads is a drawing nobody draws,
// and it teaches the tutor the wrong schema.
func TestDeadKeysRefusesAStepKeyTheSchemaNeverReads(t *testing.T) {
	th := rules.PartStandardThresholds{DeadKeys: true}
	findings := deadKeyFindings(tcpPartOne(t), th)
	if len(findings) == 0 {
		t.Fatal("the engine accepts a step key the schema never reads")
	}
	for _, fragment := range []string{"`scene`", "stage", "paso 1"} {
		if !strings.Contains(findings[0], fragment) {
			t.Fatalf("the refusal %q does not name %q", findings[0], fragment)
		}
	}
	if findings := deadKeyFindings(fixtureStory, th); len(findings) != 0 {
		t.Fatalf("the engine refused a story with no dead key: %v", findings)
	}
	if findings := deadKeyFindings(tcpPartOne(t), rules.PartStandardThresholds{}); len(findings) != 0 {
		t.Fatalf("a snapshot without the key applied the rule: %v", findings)
	}
}

// tcpStory is the bench's story (#246): three steps of two still robots, a header
// written as a text-arrow flow and a `scene` the schema never reads.
const tcpStory = `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"El handshake","viewBox":"0 0 360 220","steps":[
 {"title":"SYN","equation":{"size":18,"atoms":[{"t":"Cliente","id":"c"},{"t":" ---[ SYN, Seq=1000 ]---> ","id":"syn"},{"t":"Servidor","id":"s"}]},"focus":["syn"],"narrator":"El cliente abre la conexión.","scene":{"arrows":[{"x1":70,"y1":140,"x2":270,"y2":140}]},"stage":{"scene":{"actors":[{"id":"cli","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"Cliente"},{"id":"srv","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"Servidor"}],"props":[{"id":"p1","kind":"value","on":"cli","side":"right","label":"SYN","tone":"blue"}]}}},
 {"title":"SYN-ACK","equation":{"size":18,"atoms":[{"t":"Servidor","id":"s"},{"t":" <---[ SYN-ACK ]--- ","id":"synack"},{"t":"Cliente","id":"c"}]},"focus":["synack"],"narrator":"El servidor responde con su acuse.","scene":{"arrows":[{"x1":270,"y1":140,"x2":70,"y2":140}]},"stage":{"scene":{"actors":[{"id":"cli","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"Cliente"},{"id":"srv","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"Servidor"}],"props":[{"id":"p2","kind":"value","on":"srv","side":"left","label":"SYN-ACK","tone":"green"}],"marks":[{"kind":"ok","actors":["srv"]}]}}},
 {"title":"ACK","equation":{"size":18,"atoms":[{"t":"Cliente","id":"c"},{"t":" ---[ ACK ]---> ","id":"ack"},{"t":"Servidor","id":"s"}]},"focus":["ack"],"narrator":"El cliente confirma y el canal queda abierto.","scene":{"arrows":[{"x1":70,"y1":140,"x2":270,"y2":140}]},"stage":{"scene":{"actors":[{"id":"cli","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"Cliente"},{"id":"srv","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"Servidor"}],"props":[{"id":"p3","kind":"value","on":"cli","side":"right","label":"ACK","tone":"green"}],"marks":[{"kind":"ok","actors":["cli"]}]}}}
]}
</script>
</lk-story>`

// The three keys are additive: the production rules declare them, and a snapshot// The three keys are additive: the production rules declare them, and a snapshot
// with them removed keeps accepting the part they refuse.
func TestPartStandardSnapshotWithoutBenchKeysKeepsAccepting(t *testing.T) {
	raw, err := os.ReadFile(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	block, ok := doc["thresholds"].(map[string]any)["partStandard"].(map[string]any)
	delete(block, "register") // an older snapshot predates the register block
	if !ok {
		t.Fatal("the production rules declare no partStandard block")
	}
	for _, key := range []string{"storyMotion", "arrowFlows", "deadKeys"} {
		if block[key] != true {
			t.Fatalf("the production rules do not declare %q", key)
		}
		delete(block, key)
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "standard-without-bench-keys.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}
	// The part the rules refuse: a still scene, a quiet story of boxes, a header
	// written with dashes and a step key the schema never reads.
	note := strings.Replace(standardNote("El débito se escribe así."), standardScene, charactersScene, 1)
	note = strings.Replace(note, fixtureStory, tcpStory, 1)

	f := standardFrontierOn(t, path)
	f.writePartNote(t, note)
	rep, code, c := standardCheck(t, f)
	if code != 0 || rep.Status != "accepted" {
		for _, check := range rep.Checks {
			if check.Status != "PASS" {
				t.Logf("blocking check %s = %s: %s", check.ID, check.Status, check.Reason)
			}
		}
		t.Fatalf("advance explanation = %q (exit %d), want accepted", rep.Status, code)
	}
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the keys are additive", c.Status, c.Reason)
	}

	f2 := standardFrontier(t)
	f2.writePartNote(t, note)
	rep2, code2, c2 := standardCheck(t, f2)
	assertBlocked(t, rep2, code2)
	if c2.Status != "FAIL" {
		t.Fatalf("explanation-standard = %s (%s), want FAIL on the bench defects", c2.Status, c2.Reason)
	}
	for _, fragment := range []string{"no mueve nada", "esquema en texto", "no lee"} {
		if !strings.Contains(c2.Reason, fragment) {
			t.Fatalf("reason %q misses %q", c2.Reason, fragment)
		}
	}
}

// The engine and the tutor's tool read the bench the same way.
func TestPartStandardReadsTheBenchLikeExplainCheck(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	tool, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(tool); err != nil {
		t.Skipf("explain-check.mjs is not here: %v", err)
	}
	rows := func(note string) map[string]string {
		t.Helper()
		file := filepath.Join(t.TempDir(), "parte.md")
		if err := os.WriteFile(file, []byte(note), 0o644); err != nil {
			t.Fatal(err)
		}
		out, _ := exec.Command(node, tool, file, "--json").CombinedOutput()
		var parsed struct {
			Rows []struct {
				Rule   string `json:"rule"`
				OK     bool   `json:"ok"`
				Detail string `json:"detail"`
			} `json:"rows"`
		}
		if err := json.Unmarshal(out, &parsed); err != nil {
			t.Fatalf("explain-check printed no JSON: %v\n%s", err, out)
		}
		seen := map[string]string{}
		for _, r := range parsed.Rows {
			seen[r.Rule] = r.Detail
		}
		return seen
	}
	th := rules.PartStandardThresholds{StoryMotion: true, ArrowFlows: true, DeadKeys: true}
	part := tcpPartOne(t)
	seen := rows(part)
	for rule, findings := range map[string][]string{
		"historia-quieta":      storyMotionFindings(part, th),
		"cabecera-con-flechas": arrowFlowFindings(part, th),
		"clave-muerta":         deadKeyFindings(part, th),
	} {
		detail, ok := seen[rule]
		if !ok {
			t.Fatalf("explain-check printed no %s row", rule)
		}
		if detail == "" {
			t.Fatalf("the tool accepts the bench part on %s, the engine refuses it: %v", rule, findings)
		}
		if len(findings) == 0 {
			t.Fatalf("the engine accepts the bench part on %s, the tool refuses it: %s", rule, detail)
		}
	}
}
