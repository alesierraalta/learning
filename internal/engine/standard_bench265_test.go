package engine

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The third bench run (#264) is the evidence: its part notes passed every gate while the rich page the reader
// served dropped the note's story and turned the mini-quiz into a numbered list. The bench files are copied
// unchanged under tools/register/fixtures/bench265; clean/ is the fixed pair the tests expect to pass.
const bench265 = "../../tools/register/fixtures/bench265"

func bench265File(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(bench265, name))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// Five «Término: Es …» paragraphs in a row are a glossary block (#265): the explanation spreads them with
// the example, so the standard refuses the run and names it.
func TestPartStandardRefusesTheBenchGlossaryBlock(t *testing.T) {
	f := standardFrontier(t)
	f.writePartNote(t, bench265File(t, "notas/tcp-handshake.md"))
	_, _, c := standardCheck(t, f)
	if c.Status != "FAIL" || !strings.Contains(c.Reason, "glosario") {
		t.Fatalf("explanation-standard = %s (%s), want FAIL naming the glossary block", c.Status, c.Reason)
	}
}

// The page a turn writes beside its note is measured with the same thresholds (#265): the bench page drops
// the note's story and repeats the glossary block, and the standard refuses it by its own file name.
func TestPartStandardMeasuresTheRichPageBesideTheNote(t *testing.T) {
	f := standardFrontier(t)
	f.writePartNote(t, bench265File(t, "clean/tcp-handshake.md"))
	rel := f.canonicalPartFile(t, "p1")
	f.write(t, strings.TrimSuffix(rel, ".md")+".html", bench265File(t, "paginas/tcp-handshake.html"))
	_, _, c := standardCheck(t, f)
	if c.Status != "FAIL" || !strings.Contains(c.Reason, ".html") {
		t.Fatalf("explanation-standard = %s (%s), want FAIL naming the page", c.Status, c.Reason)
	}
}

// The clean pair passes: every figure of the note is on the page, the definitions are spread, the quiz is interactive.
func TestPartStandardAcceptsTheCleanPageBesideTheCleanNote(t *testing.T) {
	f := standardFrontier(t)
	f.writePartNote(t, bench265File(t, "clean/tcp-handshake.md"))
	rel := f.canonicalPartFile(t, "p1")
	f.write(t, strings.TrimSuffix(rel, ".md")+".html", bench265File(t, "clean/tcp-handshake.html"))
	_, _, c := standardCheck(t, f)
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS for the clean pair", c.Status, c.Reason)
	}
}

// The keys are additive (#265): a run frozen before them keeps accepting the bench note it accepted.
func TestPartStandardSnapshotWithoutBench265KeysKeepsAccepting(t *testing.T) {
	f := standardFrontierOn(t, snapshotWithoutBench265Keys(t))
	f.writePartNote(t, bench265File(t, "notas/tcp-handshake.md"))
	_, _, c := standardCheck(t, f)
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the keys are additive", c.Status, c.Reason)
	}
}

// The production rules declare the three keys on, so the refusals above are live.
func TestProductionRulesDeclareTheBench265Keys(t *testing.T) {
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
	for _, key := range []string{"glosarioEnBloque", "richPage", "interactiveQuiz"} {
		if block[key] != true {
			t.Fatalf("partStandard.%s = %v, want true in the production rules", key, block[key])
		}
	}
}

// snapshotWithoutBench265Keys is the production rules with the three additive keys removed: a run frozen
// before #265 keeps the part checks it started with.
func snapshotWithoutBench265Keys(t *testing.T) string {
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
	for _, key := range []string{"glosarioEnBloque", "richPage", "interactiveQuiz"} {
		delete(block, key)
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "standard-without-bench265-keys.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// snapshotWithout265Keys is the production rules without the #265 keys: the rules #261 shipped with.
func snapshotWithout265Keys(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	removeBench265Keys(doc)
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "standard-without-265-keys.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// removeBench265Keys drops the #265 keys from a rules document: the glossary, the interactive quiz and the page
// rule of partStandard, and the positional key of options.
func removeBench265Keys(doc map[string]any) {
	thresholds := doc["thresholds"].(map[string]any)
	if block, ok := thresholds["partStandard"].(map[string]any); ok {
		for _, key := range []string{"glosarioEnBloque", "interactiveQuiz", "richPage"} {
			delete(block, key)
		}
	}
	if options, ok := thresholds["options"].(map[string]any); ok {
		delete(options, "positionalKeys")
	}
}

// The #265 rules refuse the #261 Bayes bench on the production rules: its numbered mini-quiz is a list, and the
// reason names it.
func TestPartStandardRefusesTheBench261NumberedQuizOnTheProductionRules(t *testing.T) {
	f := standardFrontier(t)
	f.writePartNote(t, bench261Part(t, "bayes-theorem.md"))
	_, _, c := standardCheck(t, f)
	if c.Status != "FAIL" || !strings.Contains(c.Reason, "lista numerada") {
		t.Fatalf("explanation-standard = %s (%s), want FAIL naming the numbered mini-quiz", c.Status, c.Reason)
	}
}
