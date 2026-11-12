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
  {"title":"La fórmula entera","focus":[],"narrator":"Es la densidad «f» en el punto «x».","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la campana"}]}}},
  {"title":"f: la densidad","focus":["f"],"narrator":"«f» es la densidad: la altura de la curva.","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la altura"}]}}},
  {"title":"x: el punto","focus":["x"],"narrator":"«x» es el punto que miras.","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la latencia"}]}}},
  {"title":"Con el ejemplo","focus":[],"narrator":"Con «x = 184», «f(184) = 0,000 65».","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"el resultado"}]}}}
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
	note := strings.Replace(standardNote("La densidad se explica paso a paso.\n"), fixtureWalkthrough, formulaStory, 1)
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

	with := strings.Replace(standardNote("La densidad se explica paso a paso.\n"), fixtureWalkthrough, formulaStory, 1)
	if ok, detail := row(with); !ok {
		t.Fatalf("the tool refuses the formula walkthrough the engine accepts: %s", detail)
	}
	if findings := formulaWalkthroughFindings(with, rules.PartStandardThresholds{FormulaWalkthrough: true}); len(findings) != 0 {
		t.Fatalf("the engine refuses the formula walkthrough the tool accepts: %v", findings)
	}
}
