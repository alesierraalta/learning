package engine

import (
	"bytes"
	"encoding/json"
	"errors"
	"os/exec"
	"path/filepath"
	"testing"
)

// cliRunner drives the real compiled binary as a subprocess: the public
// contract an adapter relies on (argv, exit code, one JSON object on stdout).
type cliRunner struct {
	t   *testing.T
	bin string
	f   *fixture
}

func buildCLI(t *testing.T) string {
	t.Helper()
	bin := filepath.Join(t.TempDir(), "learning")
	out, err := exec.Command("go", "build", "-o", bin, "../../cmd/learning").CombinedOutput()
	if err != nil {
		t.Fatalf("build CLI: %v\n%s", err, out)
	}
	return bin
}

func (c cliRunner) run(args ...string) (Report, int) {
	c.t.Helper()
	cmd := exec.Command(c.bin, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	code := 0
	if err := cmd.Run(); err != nil {
		var exit *exec.ExitError
		if !errors.As(err, &exit) {
			c.t.Fatalf("run %v: %v", args, err)
		}
		code = exit.ExitCode()
	}
	var rep Report
	dec := json.NewDecoder(&stdout)
	if err := dec.Decode(&rep); err != nil {
		c.t.Fatalf("%v: stdout is not one JSON report: %v (stderr %q)", args, err, stderr.String())
	}
	if dec.More() {
		c.t.Fatalf("%v: stdout carries more than one JSON object", args)
	}
	return rep, code
}

func (c cliRunner) cmd(command, stage string) (Report, int) {
	c.t.Helper()
	args := []string{command, "--root", c.f.root, "--workspace", c.f.ws, "--rules", repoRulesPath, "--mode", "deep", "--json"}
	if stage != "" {
		args = append(args, "--stage", stage)
	}
	return c.run(args...)
}

// reviewPending records every pending review through the CLI, as the chat
// would after judging the artifact.
func (c cliRunner) reviewPending(stage string) {
	c.t.Helper()
	rep, code := c.cmd("validate", stage)
	if code != 0 {
		return // objective failures surface on advance itself
	}
	for _, p := range pendingListOf(rep.Evidence) {
		rule, _ := p["rule"].(string)
		rrep, rcode := c.run("review",
			"--root", c.f.root, "--workspace", c.f.ws, "--rules", repoRulesPath, "--mode", "deep",
			"--stage", stage, "--rule", rule, "--verdict", "PASS",
			"--reason", "chat review of the artifact against the rubric",
			"--reviewer", "chat", "--json")
		if rcode != 0 || rrep.Status != "accepted" {
			c.t.Fatalf("review %s: status=%q exit=%d detail=%q", rule, rrep.Status, rcode, rrep.Detail)
		}
	}
}

func (c cliRunner) ok(command, stage, want string) Report {
	c.t.Helper()
	if command == "advance" {
		c.reviewPending(stage)
	}
	rep, code := c.cmd(command, stage)
	if code != 0 || rep.Status != want || len(failIDs(rep)) > 0 {
		c.t.Fatalf("%s %s: status=%q exit=%d want %q, checks=%+v", command, stage, rep.Status, code, want, rep.Checks)
	}
	return rep
}

func (c cliRunner) rejected(stage, failID string) {
	c.t.Helper()
	before := c.f.tryReadState(c.t)
	rep, code := c.cmd("advance", stage)
	if code != 1 || rep.Status != "blocked" {
		c.t.Fatalf("advance %s: status=%q exit=%d, want blocked/1", stage, rep.Status, code)
	}
	if chk, found := hasCheck(rep, failID); !found || chk.Status != "FAIL" {
		c.t.Fatalf("advance %s: want FAIL %s, got %+v", stage, failID, rep.Checks)
	}
	if !bytes.Equal(before, c.f.tryReadState(c.t)) {
		c.t.Fatalf("rejected advance %s mutated state", stage)
	}
}

// A complete one-part deep topic driven only through the compiled CLI.
func TestCLIEndToEndDeepTopic(t *testing.T) {
	if testing.Short() {
		t.Skip("builds and runs the real binary")
	}
	f := newFixture(t)
	c := cliRunner{t: t, bin: buildCLI(t), f: f}
	p1 := partCfg{id: "p1", ex: true, vis: true, title: "Parte"}

	c.ok("init", "", "accepted")
	f.writePlan(t, p1)
	c.ok("advance", "preparation", "accepted")

	f.writeDiagQuestions(t, buildDiagQuestions(6, 6, p1))
	c.ok("status", "", "waiting")
	c.rejected("diagnosis", "quiz-answers")
	f.writeDiagAnswersFor(t, []partCfg{p1}, 2, 6)
	if rep := c.ok("advance", "diagnosis", "accepted"); rep.Evidence["diagnosticScore"] != "10/12" {
		t.Fatalf("diagnosticScore = %v, want 10/12", rep.Evidence["diagnosticScore"])
	}
	f.writePlanWith(t, "Dificultades detectadas en consenso.", []string{"d3"}, p1)
	c.ok("advance", "planning", "accepted")

	f.writeExplanation(t, "p1", true, "v1")
	c.ok("advance", "explanation", "accepted")
	f.writeOwnWordsText(t, "p1", "Lo entendí a medias.")
	c.ok("advance", "own_words", "accepted")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 5)
	c.ok("advance", "quiz", "accepted")
	f.writeFeedback(t, "p1", true)
	c.ok("advance", "feedback", "accepted")

	c.rejected("adaptation", "feedback-condition")
	f.writePlanWith(t, "Plan revisado tras el feedback.", []string{"d3"}, p1)
	c.ok("advance", "planning", "accepted")
	c.ok("advance", "adaptation", "accepted")

	f.writeClosingArtifacts(t, "B", "Cada réplica acepta el mismo registro.", "1/1")
	c.ok("advance", "exercises", "accepted")
	c.ok("advance", "final_quiz", "accepted")
	c.rejected("final", "all-stages-current")
	f.rescoreMap(t, "cierre")
	c.ok("advance", "final", "completed")
	c.ok("status", "", "completed")

	// 8 core stages + 1 planning repair + 3 closing stages; rejections never count.
	if n := successfulAdvances(t, f.state(t)); n != 12 {
		t.Fatalf("successfulAdvances = %v, want 12", n)
	}
}

// Conceptual mode stays light and writes nothing; paths outside the root fail.
func TestCLIConceptualAndOutsideRoot(t *testing.T) {
	if testing.Short() {
		t.Skip("builds and runs the real binary")
	}
	f := newFixture(t)
	c := cliRunner{t: t, bin: buildCLI(t), f: f}

	rep, code := c.run("init", "--root", f.root, "--workspace", f.ws, "--rules", repoRulesPath, "--mode", "conceptual", "--json")
	if code != 0 || rep.Status != "skipped" {
		t.Fatalf("conceptual: status=%q exit=%d, want skipped/0", rep.Status, code)
	}
	if f.tryReadState(t) != nil {
		t.Fatal("conceptual mode created engine state")
	}

	outside := t.TempDir()
	rep, code = c.run("status", "--root", f.root, "--workspace", outside, "--rules", repoRulesPath, "--mode", "deep", "--json")
	if code != 2 || rep.Status != "error" {
		t.Fatalf("outside root: status=%q exit=%d, want error/2", rep.Status, code)
	}
}
