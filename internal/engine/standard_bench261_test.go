package engine

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"learning/internal/rules"
)

// The second bench (#261): four real parts that passed every gate and were still
// generic. The engine refuses the three defects the tutor's tool names (a mark that
// echoes its move, a failing tint on a valid state, an icon the words do not name),
// with the same verdict `tools/explain-check.mjs` gives on the same text.

// bench261 holds the second bench's parts: the RED fixtures of #261.
const bench261 = "../../tools/register/fixtures/bench261"

// bench261Part reads one bench part as the tutor wrote it.
func bench261Part(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(bench261, name))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// refusedOnBench runs one bench part through the standard and returns the reason
// the explanation-standard check fails with.
func refusedOnBench(t *testing.T, name string) string {
	t.Helper()
	f := standardFrontier(t)
	f.writePartNote(t, bench261Part(t, name))
	rep, code, c := standardCheck(t, f)
	assertBlocked(t, rep, code)
	if c.Status != "FAIL" {
		t.Fatalf("explanation-standard = %s (%s), want FAIL on the %s bench part", c.Status, c.Reason, name)
	}
	return c.Reason
}

// The TCP part draws the arrow «SYN» and then «✓ SYN» under the client: the mark
// echoes the move of its own step.
func TestPartStandardRefusesAMarkThatEchoesItsMove(t *testing.T) {
	reason := refusedOnBench(t, "tcp-handshake.md")
	if !strings.Contains(reason, "marca «SYN», que repite la etiqueta «SYN»") {
		t.Fatalf("reason %q does not name the echoed mark", reason)
	}
}

// Git tints «DETACHED» with the failing red: a detached HEAD is a valid state, so the
// card is neutral, and the failing tint is for an error.
func TestPartStandardRefusesAFailingTintOnAValidState(t *testing.T) {
	reason := refusedOnBench(t, "git-branching.md")
	if !strings.Contains(reason, "«DETACHED»") || !strings.Contains(reason, "neutral") {
		t.Fatalf("reason %q does not name the failing tint on DETACHED", reason)
	}
}

// Git's eye and pencil sit on HEAD, and the card's words never read or write.
func TestPartStandardRefusesAnAccessoryIconTheWordsDoNotName(t *testing.T) {
	reason := refusedOnBench(t, "git-branching.md")
	if !strings.Contains(reason, "«HEAD en rama activa»") || !strings.Contains(reason, "icono de lectura") {
		t.Fatalf("reason %q does not name the accessory icon", reason)
	}
}

// The Bayes bench repeats no mark, tints no card and draws no icon: the three new
// rules leave it alone, so the explanation standard still passes it. The frontier's
// other checks (the reading guide under each visual) are not this test's concern.
func TestPartStandardAcceptsTheBayesBenchOnTheNewRules(t *testing.T) {
	// The #261 rules: the #265 keys refuse the bench's numbered mini-quiz, which the production rules test below.
	f := standardFrontierOn(t, snapshotWithout265Keys(t))
	f.writePartNote(t, bench261Part(t, "bayes-theorem.md"))
	_, _, c := standardCheck(t, f)
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the bench part echoes nothing", c.Status, c.Reason)
	}
}

// snapshotWithoutBench261Keys is the production rules with the three additive keys
// removed: a run frozen before #261 keeps accepting the parts it accepted. The
// register block goes too, as in the other frozen snapshots.
func snapshotWithoutBench261Keys(t *testing.T) string {
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
	delete(block, "register")
	for _, key := range []string{"markEcho", "verdictError", "accessorySense"} {
		delete(block, key)
	}
	// A run frozen before #261 declares none of the keys that came after it (#265).
	removeBench265Keys(doc)
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "standard-without-bench261-keys.json")
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// The keys are additive: without them the TCP bench that echoes its move is accepted.
func TestPartStandardSnapshotWithoutBench261KeysKeepsAccepting(t *testing.T) {
	f := standardFrontierOn(t, snapshotWithoutBench261Keys(t))
	f.writePartNote(t, bench261Part(t, "tcp-handshake.md"))
	_, _, c := standardCheck(t, f)
	if c.Status != "PASS" {
		t.Fatalf("explanation-standard = %s (%s), want PASS: the keys are additive", c.Status, c.Reason)
	}
}

// The production rules declare the three keys on, so the refusals above are live.
func TestProductionRulesDeclareTheBench261Keys(t *testing.T) {
	raw, err := os.ReadFile(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Thresholds struct {
			PartStandard map[string]json.RawMessage `json:"partStandard"`
		} `json:"thresholds"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"markEcho", "verdictError", "accessorySense"} {
		if got := string(doc.Thresholds.PartStandard[key]); got != "true" {
			t.Fatalf("partStandard.%s = %s in the production rules, want true", key, got)
		}
	}
}

// The engine and the tutor's tool read the three rules the same way: on each bench part
// and on clean kit examples, `tools/explain-check.mjs` and the engine agree rule by rule.
// The tutor runs the tool and must get the engine's verdict.
func TestPartStandardReadsTheSecondBenchLikeExplainCheck(t *testing.T) {
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
	files := []string{
		filepath.Join(bench261, "tcp-handshake.md"),
		filepath.Join(bench261, "git-branching.md"),
		filepath.Join(bench261, "rust-borrowing.md"),
		filepath.Join(bench261, "bayes-theorem.md"),
		"../../integrations/pi/kit/examples/prestamos-rust.md",
		"../../integrations/pi/kit/examples/derivacion-x.md",
	}
	for _, path := range files {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		text := string(raw)
		// The tool exits 1 when a rule fails; the JSON it prints is what is compared.
		out, _ := exec.Command(node, tool, path, "--json").Output()
		var report struct {
			Rows []struct {
				Rule string `json:"rule"`
				Ok   bool   `json:"ok"`
			} `json:"rows"`
		}
		if err := json.Unmarshal(out, &report); err != nil {
			t.Fatalf("explain-check printed no JSON for %s: %v\n%s", path, err, out)
		}
		toolOK := map[string]bool{}
		for _, row := range report.Rows {
			toolOK[row.Rule] = row.Ok
		}
		engineOK := map[string]bool{
			"marca-eco":             len(markEchoFindings(text, rules.PartStandardThresholds{MarkEcho: true})) == 0,
			"veredicto-sin-error":   len(verdictErrorFindings(text, rules.PartStandardThresholds{VerdictError: true})) == 0,
			"accesorio-sin-sentido": len(accessorySenseFindings(text, rules.PartStandardThresholds{AccessorySense: true})) == 0,
		}
		for rule, want := range engineOK {
			if toolOK[rule] != want {
				t.Fatalf("%s: %s is ok=%v in explain-check and ok=%v in the engine", path, rule, toolOK[rule], want)
			}
		}
	}
}
