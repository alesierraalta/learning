package engine

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"learning/internal/rules"
)

// The three authoring cues (#305) are measured by the engine and by explain-check, and the two must agree.
// These helpers build the shapes the rules read: a walkthrough or a story of drawn steps, a story of piece
// steps, and a payload whose keys the dead-key rule must read as the schema does.

// cueSummary is the closing card a walkthrough or a story carries after its last step.
const cueSummary = `,"summary":{"title":"Lo que queda","metrics":[["Pasos","3"]]}`

// cueThresholds reads the thresholds a rules file would declare: the cue keys switch their rules on.
func cueThresholds(t *testing.T, keys string) rules.PartStandardThresholds {
	t.Helper()
	var th rules.PartStandardThresholds
	if err := json.Unmarshal([]byte(keys), &th); err != nil {
		t.Fatal(err)
	}
	return th
}

// productionThresholds reads the thresholds the production rules declare.
func productionThresholds(t *testing.T) rules.PartStandardThresholds {
	t.Helper()
	doc, err := rules.Load(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	if doc.Thresholds.PartStandard == nil {
		t.Fatal("the production rules declare no partStandard block")
	}
	return *doc.Thresholds.PartStandard
}

// cueWalk builds a walkthrough of n drawn steps, each one box. top is written after the viewBox (a summary,
// a kind); step2 is written before the second step's title (a ring, a focus), each key followed by a comma.
func cueWalk(n int, top, step2 string) string {
	steps := make([]string, 0, n)
	for i := 1; i <= n; i++ {
		head := `{"title":"Paso ` + strconv.Itoa(i) + `",`
		if i == 2 {
			head += step2
		}
		steps = append(steps, head+`"text":"Una caja.","scene":{"boxes":[{"id":"a","x":60,"y":120,"w":200,"h":110,"label":"Cuenta 10"}]}}`)
	}
	return "<lk-walkthrough>\n<script type=\"application/json\">\n{\"viewBox\":\"0 0 900 320\"" + top + ",\"steps\":[" + strings.Join(steps, ",") + "]}\n</script>\n</lk-walkthrough>"
}

// cueStory builds a story of n steps: drawn steps move a robot, and piece steps draw two cards. top is
// written after the payload's viewBox; step2 is written before the second step's title.
func cueStory(kind, top, step2 string, n int, pieces bool) string {
	steps := make([]string, 0, n)
	for i := 1; i <= n; i++ {
		head := `{"title":"Paso ` + strconv.Itoa(i) + `",`
		if i == 2 {
			head += step2
		}
		body := `"narrator":"El robot sube.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"}],"marks":[{"kind":"ok","actors":["r"]}]}}}`
		if pieces {
			body = `"narrator":"Las tarjetas.","stage":{"cards":{"cards":[{"verdict":"ok","label":"ok"},{"verdict":"no","label":"no"}]}}}`
		}
		steps = append(steps, head+body)
	}
	return "<lk-story>\n<script type=\"application/json\">\n{\"kind\":\"" + kind + "\",\"title\":\"Un robot\",\"viewBox\":\"0 0 360 300\"" + top + ",\"steps\":[" + strings.Join(steps, ",") + "]}\n</script>\n</lk-story>"
}

// cueBareStory is the robot story as #304 wrote it, before the cues: three drawn steps, no closing card, no
// legend and no ring. The production rules refuse a part that carries it; a frozen snapshot keeps accepting it.
const cueBareStory = `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"El robot sube","viewBox":"0 0 360 300","steps":[
 {"title":"La salida","narrator":"El robot empieza en la casilla de abajo.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","tag":"robot"}]}}},
 {"title":"Sube","narrator":"El robot sube una casilla y deja la de abajo.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","state":"faded"},{"id":"u","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"}],"marks":[{"kind":"ok","actors":["u"]}]}}},
 {"title":"Paga","narrator":"Cada paso cuesta menos cero coma cero cuatro.","stage":{"scene":{"actors":[{"id":"u","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"}],"marks":[{"kind":"ok","actors":["u"]}]}}}
]}
</script>
</lk-story>`

// snapshotWithoutCues is the production rules with the three #305 cue keys removed: a run frozen before #305
// declares none of them, and keeps the parts it accepted.
func snapshotWithoutCues(t *testing.T) string {
	t.Helper()
	return snapshotWithout(t, "storySummary", "formulaLegend", "storyFocus")
}

// snapshotWithout is the production rules with the named keys removed from their partStandard block: a run frozen
// before those keys existed declares none of them, and keeps the parts it accepted.
func snapshotWithout(t *testing.T, keys ...string) string {
	t.Helper()
	raw, err := os.ReadFile(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	thresholds, _ := doc["thresholds"].(map[string]any)
	block, ok := thresholds["partStandard"].(map[string]any)
	if !ok {
		t.Fatal("the production rules declare no partStandard block")
	}
	for _, key := range keys {
		delete(block, key)
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "standard-without-cues.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// A part whose story carries none of the cues is refused by the production rules, which declare them, and is
// accepted by a frozen snapshot that does not: a run frozen before #305 keeps accepting what it accepted.
func TestCueRulesRefuseANewPartAndAFrozenSnapshotKeepsAcceptingIt(t *testing.T) {
	body := "Imagina un robot que aprende.\n\n**Estado**: es la casilla donde está el robot.\n\nEl robot sube una casilla y deja la de abajo. Antes estaba abajo; después, arriba.\n"
	bare := strings.Replace(standardNote(body), fixtureStory, cueBareStory, 1)

	f := standardFrontier(t)
	f.writePartNote(t, bare)
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	for _, word := range []string{"resumen", "leyenda", "foco"} {
		if c.Status != "FAIL" || !strings.Contains(c.Reason, word) {
			t.Fatalf("explanation-standard = %s (%s), want FAIL naming the %s cue", c.Status, c.Reason, word)
		}
	}

	old := standardFrontierOn(t, snapshotWithoutCues(t))
	old.writePartNote(t, bare)
	oldRep, oldCode, oldCheck := standardCheck(t, old)
	if oldCode != 0 || oldRep.Status != "accepted" {
		t.Fatalf("a frozen snapshot refuses the part: %q (exit %d): %+v", oldRep.Status, oldCode, oldRep.Checks)
	}
	if oldCheck.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the cue keys are additive", oldCheck.Status, oldCheck.Reason)
	}
}

// explainCueRows runs explain-check on one note and reports whether each row passes. explain-check exits 1
// when a rule fails: the JSON on stdout is what matters.
func explainCueRows(t *testing.T, node, toolPath, file string) map[string]bool {
	t.Helper()
	out, _ := exec.Command(node, toolPath, file, "--json").Output()
	var parsed struct {
		Rows []struct {
			Rule string `json:"rule"`
			OK   bool   `json:"ok"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("explain-check printed no JSON for %s: %v\n%s", file, err, out)
	}
	rows := map[string]bool{}
	for _, row := range parsed.Rows {
		rows[row.Rule] = row.OK
	}
	return rows
}

// checkCueAgreement holds the engine's verdict on the three cue rules against explain-check's, for one note.
func checkCueAgreement(t *testing.T, node, toolPath string, th rules.PartStandardThresholds, name, text, file string) {
	t.Helper()
	engine := map[string]bool{
		"calculo-en-texto": len(calculoEnTextoFindings(text, th)) == 0,
		"falta-resumen":    len(faltaResumenFindings(text, th)) == 0,
		"falta-leyenda":    len(faltaLeyendaFindings(text, th)) == 0,
		"falta-foco":       len(faltaFocoFindings(text, th)) == 0,
	}
	tool := explainCueRows(t, node, toolPath, file)
	for rule, want := range engine {
		if got, ok := tool[rule]; !ok || got != want {
			t.Errorf("%s: %s is ok=%v in explain-check and ok=%v in the engine", name, rule, got, want)
		}
	}
}

// The engine and explain-check agree on the three cue rules: on the shapes each rule reads, and on the kit's
// and the skill's examples. The tutor runs the tool and must get the engine's verdict.
func TestCueRulesAgreeWithExplainCheck(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	toolPath, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(toolPath); err != nil {
		t.Skipf("explain-check.mjs is not here: %v", err)
	}
	th := productionThresholds(t)
	notes := map[string]string{
		"a walkthrough of three without summary or ring": cueWalk(3, "", ""),
		"a walkthrough of three with summary and ring":   cueWalk(3, cueSummary, `"ring":"a",`),
		"a walkthrough of two without summary":           cueWalk(2, "", ""),
		"a walkthrough with a text focus":                cueWalk(3, cueSummary, `"focus":"a",`),
		"a formula story without legend":                 cueStory("formula", cueSummary, `"ring":"r",`, 3, false),
		"a formula story with legend, summary and ring":  cueStory("formula", cueSummary, `"ring":"r","facts":[["r","el robot"]],`, 3, false),
		"a derivation of pieces without ring":            cueStory("derivation", cueSummary, "", 3, true),
		"a derivation with a focus list":                 cueStory("derivation", cueSummary, `"focus":["r"],"facts":[["r","el robot"]],`, 3, false),
		"a calculation written as text":                  "```text\nz = (184 - 120) / 32\nz = 64 / 32\nz = 2\n```",
		"a single result line":                           "z = 2\n",
		"a derivation of the calculation":                cueStory("derivation", cueSummary, "", 3, false),
	}
	for name, text := range notes {
		file := filepath.Join(t.TempDir(), "nota.md")
		if err := os.WriteFile(file, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
		checkCueAgreement(t, node, toolPath, th, name, text, file)
	}
	// Decision 4 (#324): two display formulas that substitute and operate are a calculation written as formulas; a single
	// display formula with its values in one line, and a formula with a value line, are not.
	displayNotes := map[string]string{
		"a display run of two calculations": `\[ G=0+0.9(1)+0.9^2(10) \] \[ G=9 \]`,
		"a single display formula":          `$$f(184) = \frac{1}{32\sqrt{2\pi}}\,e^{-\frac{(184-120)^2}{2\cdot 32^2}} \approx 0{,}00065$$`,
		"a formula and its value line":      `$$f(x) = \frac{1}{\sigma\sqrt{2\pi}}\,e^{-\frac{(x-\mu)^2}{2\sigma^2}}$$ $$f(184) = \frac{1}{32\sqrt{2\pi}}\,e^{-\frac{(184-120)^2}{2\cdot 32^2}}$$`,
	}
	for name, text := range displayNotes {
		file := filepath.Join(t.TempDir(), "nota.md")
		if err := os.WriteFile(file, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
		checkCueAgreement(t, node, toolPath, th, name, text, file)
	}
	// The lines of one display and the bare <lk-math> run (#324, items 1 and 2): the engine and the tool agree on those
	// shapes, and on the entities an HTML page writes inside a formula.
	lineNotes := []struct{ name, text string }{
		{"an aligned display with three calculation lines", `\[
\begin{aligned}
V(0,2)&=-0{,}04+0{,}9\cdot0{,}6206\\
&=-0{,}04+0{,}55854\\
&=+0{,}51854\approx+0{,}5185
\end{aligned}
\]`},
		{"two bare calculations on consecutive lines", "<lk-math>2 + 3 = 5</lk-math>\n<lk-math>5 + 5 = 10</lk-math>"},
		{"two bare calculations inside a sentence", "Así, <lk-math>2 + 3 = 5</lk-math> y <lk-math>5 + 5 = 10</lk-math> dan 15."},
		{"an aligned display written with entities", `<lk-math display>\begin{aligned}a&amp;=2+3\\&amp;=5\end{aligned}</lk-math>`},
	}
	for _, c := range lineNotes {
		file := filepath.Join(t.TempDir(), "nota.md")
		if err := os.WriteFile(file, []byte(c.text), 0o644); err != nil {
			t.Fatal(err)
		}
		checkCueAgreement(t, node, toolPath, th, c.name, c.text, file)
	}
	var paths []string
	for _, pattern := range []string{"../../integrations/pi/kit/examples/*.md", "../../integrations/pi/kit/examples/*.html", "../../skills/explicacion-interactiva/references/ejemplo-aprobado.md", "../../skills/explicacion-interactiva/references/visuales.md"} {
		found, err := filepath.Glob(pattern)
		if err != nil {
			t.Fatal(err)
		}
		paths = append(paths, found...)
	}
	if len(paths) == 0 {
		t.Fatal("no examples found: the cross-check would prove nothing")
	}
	for _, path := range paths {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		// A page is read as its note, as the engine reads it in production (richPageFindings), so both sides see the same text.
		text := string(raw)
		if strings.HasSuffix(path, ".html") {
			text = notaDeHTML(text)
		}
		checkCueAgreement(t, node, toolPath, th, path, text, path)
	}
}

// The dead-key rule reads the keys the schema reads: a ring and a facts table are part of it (#305), and a key
// the schema does not read is still a dead key.
func TestDeadKeysReadRingAndFacts(t *testing.T) {
	th := cueThresholds(t, `{"deadKeys":true}`)
	story := func(step string) string {
		return "<lk-story>\n<script type=\"application/json\">\n{\"kind\":\"derivation\",\"title\":\"T\",\"viewBox\":\"0 0 360 250\",\"steps\":[" + step + "]}\n</script>\n</lk-story>"
	}
	legit := story(`{"title":"Uno","narrator":"Dos.","ring":"r","facts":[["r","el robot"]],"stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":1,"y":1,"size":10,"tone":"slate"}]}}}`)
	if findings := deadKeyFindings(legit, th); len(findings) != 0 {
		t.Fatalf("ring and facts are read by the schema, got %v", findings)
	}
	dead := story(`{"title":"Uno","narrator":"Dos.","leyenda":"x","stage":{"scene":{"actors":[]}}}`)
	if findings := deadKeyFindings(dead, th); len(findings) != 1 || !strings.Contains(findings[0], "leyenda") {
		t.Fatalf("an unknown step key is not a dead key: %v", findings)
	}
}
