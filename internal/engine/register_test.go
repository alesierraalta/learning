package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"learning/internal/rules"
)

// The register is a measure explain-check takes too. The engine mirrors its structural part —
// sentences, bold terms, definition before the scene, contrast, stepped calculations — with
// additive keys: a snapshot without `register` keeps accepting the parts it accepted. The term rule
// needs the common-Spanish lexicon, so it lives in the tool only.

var registerDefaults = rules.RegisterLimits{
	MeanWords: 8, P90Words: 13, Negritas: 5, Contrast: 4,
	Steps: 12, Run: 3, EscenaAntes: 1,
}

const registerDefinitionFirst = "**Estado**: es todo lo que hace falta saber para decidir.\n\nImagina un robot aspirador en la sala."
const registerExampleFirst = "Imagina un robot aspirador en la sala.\n\n**Estado**: es todo lo que hace falta saber para decidir."

func registerFixture(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "tools", "register", "fixtures", "limpia.md"))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestRegisterRefusesARealPartWhoseSentencesRunOverTheCap(t *testing.T) {
	findings := registerFindings(plsqlPartOne(t), rules.RegisterLimits{MeanWords: 8, P90Words: 13})
	if len(findings) == 0 {
		t.Fatal("the engine accepts a part whose sentences average about 12 words against a cap of 8")
	}
	if !strings.HasPrefix(findings[0], "frases-largas:") || !strings.Contains(findings[0], "tope 8") {
		t.Fatalf("the refusal %q does not name the rule and the cap", findings[0])
	}
}

func TestRegisterAcceptsTheCleanFixture(t *testing.T) {
	if findings := registerFindings(registerFixture(t), registerDefaults); len(findings) != 0 {
		t.Fatalf("the engine refused the clean fixture: %v", findings)
	}
}

func TestRegisterIsAdditive(t *testing.T) {
	// A snapshot without the block declares nothing: zero thresholds refuse nothing.
	if findings := registerFindings(plsqlPartOne(t), rules.RegisterLimits{}); len(findings) != 0 {
		t.Fatalf("an undeclared register refused a part: %v", findings)
	}
}

func TestRegisterRefusesABoldlessPart(t *testing.T) {
	findings := registerFindings(plsqlPartOne(t), rules.RegisterLimits{Negritas: 5})
	if len(findings) == 0 || !strings.HasPrefix(findings[0], "sin-negritas:") {
		t.Fatalf("the engine did not refuse a part without bold terms: %v", findings)
	}
}

func TestRegisterRefusesADefinitionBeforeItsScene(t *testing.T) {
	th := rules.RegisterLimits{EscenaAntes: 1}
	if findings := registerFindings(registerDefinitionFirst, th); len(findings) == 0 || !strings.HasPrefix(findings[0], "sin-escena-antes:") {
		t.Fatalf("the engine accepted a definition before its example: %v", findings)
	}
	if findings := registerFindings(registerExampleFirst, th); len(findings) != 0 {
		t.Fatalf("the engine refused the example first: %v", findings)
	}
}

func TestRegisterRefusesAContrastlessPart(t *testing.T) {
	plano := "El robot limpia la sala. La batería baja con cada paso. El cargador repone la energía del robot."
	findings := registerFindings(plano, rules.RegisterLimits{Contrast: 4})
	if len(findings) == 0 || !strings.HasPrefix(findings[0], "sin-contraste:") {
		t.Fatalf("the engine accepted a part without a before-and-after: %v", findings)
	}
}

func TestRegisterRefusesACalculationWithoutSteps(t *testing.T) {
	th := rules.RegisterLimits{Steps: 12, Run: 3}
	enFrase := "La recompensa suma 10 - 0.9 + 8.1 = 17.2 en total. El robot repite el ciclo."
	if findings := registerFindings(enFrase, th); len(findings) == 0 || !strings.HasPrefix(findings[0], "cuentas-sin-pasos:") {
		t.Fatalf("the engine accepted a calculation written in one line: %v", findings)
	}
	renglones := "La recompensa suma así:\n\n```\n10 - 0.9\n+ 8.1\n= 17.2\n```\n\nEl robot repite el ciclo."
	if findings := registerFindings(renglones, th); len(findings) != 0 {
		t.Fatalf("the engine refused the calculation written line by line: %v", findings)
	}
}

// The engine and explain-check answer the same question on the same text: the same register rules fail.
func TestRegisterMatchesExplainCheck(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	tool, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct{ name, text string }{
		{"la parte real de PL/SQL", plsqlPartOne(t)},
		{"la parte limpia", registerFixture(t)},
		{"una cuenta en la frase", "La recompensa suma 10 - 0.9 + 8.1 = 17.2 en total. El robot repite el ciclo."},
		{"una definición antes del ejemplo", registerDefinitionFirst},
	}
	for _, c := range cases {
		file := filepath.Join(t.TempDir(), "parte.md")
		if err := os.WriteFile(file, []byte(c.text), 0o644); err != nil {
			t.Fatal(err)
		}
		cmd := exec.Command(node, tool, file, "--json")
		cmd.Env = append(os.Environ(), "STUDIO_DB=")
		// explain-check exits 1 when a rule fails: the JSON on stdout is what matters.
		out, _ := cmd.Output()
		var doc struct {
			Rows []struct {
				Rule string `json:"rule"`
				Ok   bool   `json:"ok"`
			} `json:"rows"`
		}
		if err := json.Unmarshal(out, &doc); err != nil {
			t.Fatalf("%s: explain-check printed no JSON: %v\n%s", c.name, err, out)
		}
		failing := map[string]bool{}
		for _, row := range doc.Rows {
			failing[row.Rule] = !row.Ok
		}
		// A rule the tool does not print is not a pass: the cross-check needs every row it compares.
		for _, rule := range []string{"frases-largas", "sin-negritas", "sin-escena-antes", "sin-contraste", "cuentas-sin-pasos"} {
			seen := false
			for _, row := range doc.Rows {
				seen = seen || row.Rule == rule
			}
			if !seen {
				t.Fatalf("%s: explain-check printed no %s row", c.name, rule)
			}
		}
		engine := map[string]bool{}
		for _, finding := range registerFindings(c.text, registerDefaults) {
			engine[strings.SplitN(finding, ":", 2)[0]] = true
		}
		for _, rule := range []string{"frases-largas", "sin-negritas", "sin-escena-antes", "sin-contraste", "cuentas-sin-pasos"} {
			if failing[rule] != engine[rule] {
				t.Errorf("%s: %s — explain-check fails=%v, engine fails=%v", c.name, rule, failing[rule], engine[rule])
			}
		}
	}
}

// A source line (`**Fuente**: …`) names where the text comes from. It is not prose: the engine
// must not measure it, the same as explain-check.
func TestRegisterLeavesSourceLinesOutOfTheProse(t *testing.T) {
	text := "Imagina un robot aspirador en la sala.\n\n**Fuente**: Feuerstein y Pribyl (2014) y documentación oficial de Oracle PL/SQL.\n\nFuente de datos es la tabla que consultas."
	prose, _ := registerProse(text)
	if strings.Contains(prose, "Feuerstein") {
		t.Fatalf("the source line is measured as prose: %q", prose)
	}
	if !strings.Contains(prose, "Fuente de datos es la tabla") {
		t.Fatalf("a sentence that starts with «Fuente» is dropped from the prose: %q", prose)
	}
}

// A definition before its example: the default «más» refuses it, and sencillez «menos» allows it.
const definitionBeforeExample = "**Estado**: es todo lo que hace falta saber para decidir.\n\nImagina un robot aspirador en la sala.\n\nAntes el robot no sabía nada. Después sabe que la sala está sucia."

// writeLearnerLevels writes the learner's two register levels where the engine and explain-check look
// for them: `niveles-alumno.json` in the Learnings root, the workspace's parent.
func writeLearnerLevels(t *testing.T, root, sencillez, tecnicidad string) {
	t.Helper()
	doc := fmt.Sprintf(`{"version":1,"aspectos":[{"id":"sencillez","nivel":"%s"},{"id":"tecnicidad","nivel":"%s"}]}`, sencillez, tecnicidad)
	if err := os.WriteFile(filepath.Join(root, "niveles-alumno.json"), []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
}

// The learner's levels reach the engine (#250): with sencillez «menos» the engine accepts a definition
// before its example, which the default «más» refuses. The levels come from the same file explain-check reads.
func TestRegisterHonorsTheLearnersLevels(t *testing.T) {
	defaults := standardFrontier(t)
	defaults.writeStandardPart(t, definitionBeforeExample)
	_, _, c := standardCheck(t, defaults)
	if c.Status == "PASS" {
		t.Fatal("the default «más» accepts a definition before its example")
	}

	menos := standardFrontier(t)
	writeLearnerLevels(t, menos.root, "menos", "menos")
	menos.writeStandardPart(t, definitionBeforeExample)
	_, _, c = standardCheck(t, menos)
	if c.Status != "PASS" {
		t.Fatalf("with sencillez «menos» the engine refuses a part the learner allows: %s", c.Reason)
	}
}

// explain-check and the engine answer the same question about the same note, at the same levels.
func TestEngineAndExplainCheckAgreeOnTheLearnersLevels(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	tool, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	for _, level := range []string{"menos", "más"} {
		f := standardFrontier(t)
		writeLearnerLevels(t, f.root, level, level)
		f.writeStandardPart(t, definitionBeforeExample)
		_, _, c := standardCheck(t, f)
		note := filepath.Join(f.ws, f.canonicalPartFile(t, "p1"))
		cmd := exec.Command(node, tool, note, "--json")
		cmd.Env = append(os.Environ(), "STUDIO_DB=")
		// explain-check exits 1 when a rule fails: the JSON on stdout is what matters.
		out, _ := cmd.Output()
		var doc struct {
			Rows []struct {
				Rule string `json:"rule"`
				Ok   bool   `json:"ok"`
			} `json:"rows"`
		}
		if err := json.Unmarshal(out, &doc); err != nil {
			t.Fatalf("sencillez=%s: explain-check printed no JSON: %v\n%s", level, err, out)
		}
		toolRefuses := false
		for _, row := range doc.Rows {
			if row.Rule == "sin-escena-antes" {
				toolRefuses = !row.Ok
			}
		}
		engineRefuses := c.Status != "PASS" && strings.Contains(c.Reason, "sin-escena-antes:")
		if toolRefuses != engineRefuses {
			t.Fatalf("sencillez=%s: explain-check refuses=%v, the engine refuses=%v (%s)", level, toolRefuses, engineRefuses, c.Reason)
		}
	}
}

// One table for both languages: at every pair of levels, the limits the engine measures a part against
// are the numbers `tools/register/niveles.mjs` gives explain-check from the same rules/deep.json.
func TestRegisterLevelsAreOneTableForBothLanguages(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	script := `const m = await import('./tools/register/niveles.mjs');
const out = {};
for (const s of m.NIVELES) for (const t of m.NIVELES) out[s + '|' + t] = m.umbralesDe({ aspectos: [{ id: 'sencillez', nivel: s }, { id: 'tecnicidad', nivel: t }] });
process.stdout.write(JSON.stringify(out));`
	cmd := exec.Command(node, "--input-type=module", "-e", script)
	cmd.Dir = filepath.Join("..", "..")
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("niveles.mjs did not run: %v", err)
	}
	var tool map[string]struct {
		FrasesMedia float64 `json:"frasesMedia"`
		FrasesP90   float64 `json:"frasesP90"`
		Contraste   float64 `json:"contraste"`
		Pasos       float64 `json:"pasos"`
		Racha       float64 `json:"racha"`
		EscenaAntes float64 `json:"escenaAntes"`
		Explicado   float64 `json:"explicado"`
		Negritas    float64 `json:"negritas"`
	}
	if err := json.Unmarshal(out, &tool); err != nil {
		t.Fatalf("niveles.mjs printed no table: %v\n%s", err, out)
	}
	doc, err := rules.Load(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	reg := doc.Thresholds.PartStandard.Register
	for _, sencillez := range rules.RegisterLevels {
		for _, tecnicidad := range rules.RegisterLevels {
			want := tool[sencillez+"|"+tecnicidad]
			got := reg.Limits(sencillez, tecnicidad)
			expected := rules.RegisterLimits{
				MeanWords: want.FrasesMedia, P90Words: want.FrasesP90, Contrast: want.Contraste, Steps: want.Pasos,
				Run: want.Racha, EscenaAntes: want.EscenaAntes, Explicado: want.Explicado, Negritas: want.Negritas,
			}
			if got != expected {
				t.Errorf("sencillez=%s tecnicidad=%s: the engine reads %+v, the tool reads %+v", sencillez, tecnicidad, got, expected)
			}
		}
	}
}
