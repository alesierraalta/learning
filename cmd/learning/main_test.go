package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const rulesPath = "../../rules/deep.json"

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}

type cliFixture struct {
	root string
	ws   string
}

func newCLIFixture(t *testing.T) *cliFixture {
	t.Helper()
	base := t.TempDir()
	root := filepath.Join(base, "Learnings")
	ws := filepath.Join(root, "topico")
	if err := os.MkdirAll(ws, 0o755); err != nil {
		t.Fatal(err)
	}
	return &cliFixture{root: root, ws: ws}
}

func (c *cliFixture) args(cmd string, extra ...string) []string {
	args := []string{cmd, "--root", c.root, "--workspace", c.ws, "--rules", rulesPath, "--mode", "deep"}
	return append(args, extra...)
}

// parseOne asserts stdout is exactly one JSON object and returns it.
func parseOne(t *testing.T, out *bytes.Buffer) map[string]any {
	t.Helper()
	raw := out.String()
	if raw == "" {
		t.Fatal("empty stdout in JSON mode")
	}
	var doc map[string]any
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		t.Fatalf("stdout is not exactly one JSON object (%v): %q", err, raw)
	}
	if _, ok := doc["status"].(string); !ok {
		t.Fatalf("report has no string status: %q", raw)
	}
	return doc
}

func TestCLIMethodRejectsInvalidAndPrematureChoicesWithoutChangingState(t *testing.T) {
	c := newCLIFixture(t)
	var out bytes.Buffer
	if code := run(c.args("init", "--json"), &out); code != 0 {
		t.Fatalf("init exit = %d: %s", code, out.String())
	}
	state := filepath.Join(c.ws, ".learning", "state.json")
	before, err := os.ReadFile(state)
	if err != nil {
		t.Fatal(err)
	}
	for _, choice := range []string{"other", "pareto"} {
		out.Reset()
		code := run(c.args("method", "--method", choice, "--json"), &out)
		doc := parseOne(t, &out)
		if choice == "other" {
			if code != 2 || !strings.Contains(strings.ToLower(doc["detail"].(string)), "pareto") {
				t.Fatalf("invalid choice: exit %d, report %v", code, doc)
			}
		} else if code != 1 || doc["status"] != "blocked" {
			t.Fatalf("choice before diagnosis: exit %d, report %v", code, doc)
		}
		after, err := os.ReadFile(state)
		if err != nil || !bytes.Equal(before, after) {
			t.Fatalf("rejected %q changed state: %v", choice, err)
		}
	}
}

func TestCLIJSONBoundaryOnHappyPath(t *testing.T) {
	c := newCLIFixture(t)

	var out bytes.Buffer
	if code := run(c.args("init", "--json"), &out); code != 0 {
		t.Fatalf("init exit = %d, stdout = %q", code, out.String())
	}
	doc := parseOne(t, &out)
	if doc["status"] != "accepted" {
		t.Fatalf("init status = %v, want accepted", doc["status"])
	}

	out.Reset()
	if code := run(c.args("status", "--json"), &out); code != 0 {
		t.Fatalf("status exit = %d, stdout = %q", code, out.String())
	}
	doc = parseOne(t, &out)
	if doc["status"] != "accepted" || doc["nextStage"] != "preparation" {
		t.Fatalf("status doc = %v, want accepted/next preparation", doc)
	}
	if doc["scope"] != "complete" {
		t.Fatalf("status scope = %v, want complete for an ordinary run", doc["scope"])
	}
	if _, ok := doc["exam"]; ok {
		t.Fatalf("ordinary status unexpectedly reports an exam: %v", doc["exam"])
	}
	checks, _ := doc["checks"].([]any)
	if len(checks) == 0 {
		t.Fatal("status report must expose checks")
	}
	for _, raw := range checks {
		entry := raw.(map[string]any)
		if entry["status"] == "FAIL" {
			t.Fatalf("passing report contains FAIL: %v", entry)
		}
		if _, ok := entry["id"].(string); !ok {
			t.Fatalf("check without id: %v", entry)
		}
	}
}

// Missing/invalid arguments are operational errors: one JSON object, exit 2.
func TestCLIStrictArgumentErrors(t *testing.T) {
	c := newCLIFixture(t)
	cases := map[string][]string{
		"unknown command":       {"frobnicate", "--json"},
		"unknown flag":          {"status", "--root", c.root, "--workspace", c.ws, "--rules", rulesPath, "--wat", "1", "--json"},
		"missing flag value":    {"status", "--json", "--root", c.root, "--workspace", c.ws, "--rules"},
		"missing required":      {"status", "--workspace", c.ws, "--rules", rulesPath, "--json"},
		"advance without stage": {"advance", "--root", c.root, "--workspace", c.ws, "--rules", rulesPath, "--mode", "deep", "--json"},
		"status with stage":     {"status", "--root", c.root, "--workspace", c.ws, "--rules", rulesPath, "--mode", "deep", "--stage", "quiz", "--json"},
		"bad mode":              {"status", "--root", c.root, "--workspace", c.ws, "--rules", rulesPath, "--mode", "turbo", "--json"},
		"duplicate flag":        {"status", "--root", c.root, "--root", c.root, "--workspace", c.ws, "--rules", rulesPath, "--json"},
		"empty value":           {"status", "--root", "", "--workspace", c.ws, "--rules", rulesPath, "--json"},
		"review without stage":  {"review", "--root", c.root, "--workspace", c.ws, "--rules", rulesPath, "--rule", "explanation-adapted", "--verdict", "PASS", "--reason", "motivo", "--json"},
		"review without rule":   {"review", "--stage", "explanation", "--root", c.root, "--workspace", c.ws, "--rules", rulesPath, "--verdict", "PASS", "--reason", "motivo", "--json"},
		"review without reason": {"review", "--stage", "explanation", "--root", c.root, "--workspace", c.ws, "--rules", rulesPath, "--rule", "explanation-adapted", "--verdict", "PASS", "--json"},
		"rule flag on status":   {"status", "--root", c.root, "--workspace", c.ws, "--rules", rulesPath, "--rule", "explanation-adapted", "--json"},
	}
	for name, args := range cases {
		t.Run(name, func(t *testing.T) {
			var out bytes.Buffer
			code := run(args, &out)
			if code != 2 {
				t.Fatalf("exit = %d, want 2 (stdout: %q)", code, out.String())
			}
			doc := parseOne(t, &out)
			if doc["status"] != "error" {
				t.Fatalf("status = %v, want error", doc["status"])
			}
			if detail, _ := doc["detail"].(string); detail == "" {
				t.Fatalf("error report lacks detail: %v", doc)
			}
			if _, ok := doc["checks"].([]any); !ok {
				t.Fatalf("error report must keep checks as an array: %v", doc)
			}
		})
	}
}

func TestCLIHelpDocumentsCommandsAndExitsZero(t *testing.T) {
	for _, arg := range []string{"help", "--help"} {
		var out bytes.Buffer
		if code := run([]string{arg}, &out); code != 0 {
			t.Fatalf("%s exit = %d", arg, code)
		}
		text := out.String()
		for _, want := range []string{"init", "validate", "advance", "status", "review", "--rules", "--exam", "--practice", "plan.json", "--verdict", "pendingReviews"} {
			if !strings.Contains(text, want) {
				t.Fatalf("help text missing %q:\n%s", want, text)
			}
		}
	}
	// --help --json stays inside the one-object contract.
	var out bytes.Buffer
	if code := run([]string{"help", "--json"}, &out); code != 0 {
		t.Fatalf("help --json exit = %d", code)
	}
	parseOne(t, &out)
}

// Text mode stays human-readable while JSON mode keeps one object only.
func TestCLITextModeIsNotJSON(t *testing.T) {
	c := newCLIFixture(t)
	var out bytes.Buffer
	if code := run(c.args("init"), &out); code != 0 {
		t.Fatalf("init exit = %d, stdout = %q", code, out.String())
	}
	if !strings.Contains(out.String(), "status:") {
		t.Fatalf("text mode output missing status line: %q", out.String())
	}
	if json.Valid([]byte(out.String())) {
		t.Fatalf("text mode must not emit JSON: %q", out.String())
	}
}

// The adapter's real seam: an uninitialized workspace is blocked, exit 1.
func TestCLIStatusOnFreshWorkspaceIsBlocked(t *testing.T) {
	c := newCLIFixture(t)
	var out bytes.Buffer
	code := run(c.args("status", "--json"), &out)
	if code != 1 {
		t.Fatalf("exit = %d, want 1 (stdout %q)", code, out.String())
	}
	doc := parseOne(t, &out)
	if doc["status"] != "blocked" {
		t.Fatalf("status = %v, want blocked", doc["status"])
	}
}

// The pareto scope is an init decision recorded in state: later commands read
// it from there instead of accepting a flag that could disagree with the run.
func TestCLIScopeIsFixedAtInit(t *testing.T) {
	c := newCLIFixture(t)

	var out bytes.Buffer
	if code := run(c.args("init", "--scope", "pareto", "--json"), &out); code != 0 {
		t.Fatalf("init exit = %d, stdout = %q", code, out.String())
	}
	doc := parseOne(t, &out)
	evidence, _ := doc["evidence"].(map[string]any)
	if evidence["scope"] != "pareto" {
		t.Fatalf("init evidence.scope = %v, want pareto", evidence["scope"])
	}

	out.Reset()
	if code := run(c.args("status", "--json"), &out); code != 0 {
		t.Fatalf("status exit = %d, stdout = %q", code, out.String())
	}
	if doc = parseOne(t, &out); doc["scope"] != "pareto" {
		t.Fatalf("status scope = %v, want pareto", doc["scope"])
	}

	raw, err := os.ReadFile(filepath.Join(c.ws, ".learning", "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	var state map[string]any
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}
	if state["scope"] != "pareto" {
		t.Fatalf("state.scope = %v, want pareto", state["scope"])
	}
}

func TestCLIScopeDefaultsToComplete(t *testing.T) {
	c := newCLIFixture(t)
	var out bytes.Buffer
	if code := run(c.args("init", "--json"), &out); code != 0 {
		t.Fatalf("init exit = %d, stdout = %q", code, out.String())
	}
	out.Reset()
	if code := run(c.args("status", "--json"), &out); code != 0 {
		t.Fatalf("status exit = %d, stdout = %q", code, out.String())
	}
	if doc := parseOne(t, &out); doc["scope"] != "complete" {
		t.Fatalf("status scope = %v, want complete", doc["scope"])
	}
}

func TestCLIScopeRejectsInvalidAndLateUse(t *testing.T) {
	c := newCLIFixture(t)
	cases := map[string][]string{
		"invalid scope":   {"init", "--root", c.root, "--workspace", c.ws, "--rules", rulesPath, "--scope", "all", "--json"},
		"scope on status": {"status", "--root", c.root, "--workspace", c.ws, "--rules", rulesPath, "--scope", "pareto", "--json"},
	}
	for want, args := range cases {
		var out bytes.Buffer
		if code := run(args, &out); code != 2 {
			t.Fatalf("%s: exit = %d, want 2 (stdout %q)", want, code, out.String())
		}
		doc := parseOne(t, &out)
		if doc["status"] != "error" {
			t.Fatalf("%s: status = %v, want error", want, doc["status"])
		}
		detail, _ := doc["detail"].(string)
		if !strings.Contains(detail, "scope") {
			t.Fatalf("%s: detail = %q, wants a scope explanation", want, detail)
		}
	}
}

func TestCLIExamInitRecordsParetoAndStatusReportsExam(t *testing.T) {
	c := newCLIFixture(t)
	var out bytes.Buffer
	if code := run(c.args("init", "--exam", "practical", "--practice", "build an app", "--json"), &out); code != 0 {
		t.Fatalf("exam init exit = %d, want 0: %s", code, out.String())
	}
	initReport := parseOne(t, &out)
	if initReport["scope"] != nil {
		t.Fatalf("init must report exam scope in evidence, not top-level scope: %v", initReport)
	}
	evidence, _ := initReport["evidence"].(map[string]any)
	if evidence["scope"] != "pareto" {
		t.Fatalf("init evidence.scope = %v, want pareto", evidence["scope"])
	}
	if got := evidence["exam"]; !equalJSONMap(got, map[string]any{"format": "practical", "practice": "build an app"}) {
		t.Fatalf("init evidence.exam = %v, want practical/build an app", got)
	}

	var state map[string]any
	raw, err := os.ReadFile(filepath.Join(c.ws, ".learning", "state.json"))
	if err != nil || json.Unmarshal(raw, &state) != nil {
		t.Fatalf("read exam state: %v", err)
	}
	if state["scope"] != "pareto" || !equalJSONMap(state["exam"], map[string]any{"format": "practical", "practice": "build an app"}) {
		t.Fatalf("state = %v, want pareto scope and practical exam", state)
	}

	out.Reset()
	if code := run(c.args("status", "--json"), &out); code != 0 {
		t.Fatalf("exam status exit = %d, want 0: %s", code, out.String())
	}
	status := parseOne(t, &out)
	if status["scope"] != "pareto" || !equalJSONMap(status["exam"], map[string]any{"format": "practical", "practice": "build an app"}) {
		t.Fatalf("status = %v, want pareto scope and practical exam", status)
	}
}

func TestCLIExamPracticeCanBeOmittedForPractical(t *testing.T) {
	c := newCLIFixture(t)
	var out bytes.Buffer
	if code := run(c.args("init", "--exam", "practical", "--json"), &out); code != 0 {
		t.Fatalf("practical init without a practice kind exit = %d: %s", code, out.String())
	}
	report := parseOne(t, &out)
	evidence, _ := report["evidence"].(map[string]any)
	if evidence["scope"] != "pareto" || !equalJSONMap(evidence["exam"], map[string]any{"format": "practical"}) {
		t.Fatalf("init evidence = %v, want optional practical kind omitted", evidence)
	}
	var state map[string]any
	raw, err := os.ReadFile(filepath.Join(c.ws, ".learning", "state.json"))
	if err != nil || json.Unmarshal(raw, &state) != nil {
		t.Fatalf("read exam state: %v", err)
	}
	if !equalJSONMap(state["exam"], map[string]any{"format": "practical"}) {
		t.Fatalf("state.exam = %v, want practical format without practice", state["exam"])
	}
}

func TestCLIExamRejectsInvalidCombinationsWithoutCreatingState(t *testing.T) {
	cases := []struct {
		name  string
		flags []string
		want  string
	}{
		{"invalid format", []string{"--exam", "screen"}, `invalid exam format "screen": expected oral, written or practical`},
		{"exam format case and whitespace", []string{"--exam", " ORAL "}, `invalid exam format " ORAL ": expected oral, written or practical`},
		{"blank Unicode practice", []string{"--exam", "practical", "--practice", "\u2003"}, "--practice requires a non-empty kind"},
		{"practice without exam", []string{"--practice", "build an app"}, "--practice requires --exam practical"},

		{"practice with oral", []string{"--exam", "oral", "--practice", "build an app"}, "--practice is only valid with --exam practical"},
		{"exam conflicts with complete scope", []string{"--exam", "written", "--scope", "complete"}, "--exam requires scope pareto; --scope complete is incompatible"},
		{"exam only on init", []string{"status", "--exam", "oral"}, "--exam is only accepted by the init command"},
		{"practice only on init", []string{"status", "--practice", "build an app"}, "--practice is only accepted by the init command"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := newCLIFixture(t)
			args := c.args("init", tc.flags...)
			if tc.flags[0] == "status" {
				args = c.args("status", tc.flags[1:]...)
			}
			args = append(args, "--json")
			var out bytes.Buffer
			if code := run(args, &out); code != 2 {
				t.Fatalf("exit = %d, want 2 (stdout %q)", code, out.String())
			}
			doc := parseOne(t, &out)
			if doc["status"] != "error" || doc["detail"] != tc.want {
				t.Fatalf("report = %v, want exact error %q", doc, tc.want)
			}
			if _, err := os.Stat(filepath.Join(c.ws, ".learning", "state.json")); !os.IsNotExist(err) {
				t.Fatalf("rejected options created state (stat err %v)", err)
			}
		})
	}
}

func equalJSONMap(got any, want map[string]any) bool {
	actual, ok := got.(map[string]any)
	if !ok || len(actual) != len(want) {
		return false
	}
	for key, value := range want {
		if actual[key] != value {
			return false
		}
	}
	return true
}

func TestCLIExamPracticeTrimsUnicodeWhitespaceAndPreservesText(t *testing.T) {
	c := newCLIFixture(t)
	practice := "\u2003Construir una aplicación con café ☕\u00a0"
	want := "Construir una aplicación con café ☕"
	var out bytes.Buffer
	if code := run(c.args("init", "--exam", "practical", "--practice", practice, "--json"), &out); code != 0 {
		t.Fatalf("Unicode practical init exit = %d: %s", code, out.String())
	}
	report := parseOne(t, &out)
	evidence, _ := report["evidence"].(map[string]any)
	if !equalJSONMap(evidence["exam"], map[string]any{"format": "practical", "practice": want}) {
		t.Fatalf("init evidence.exam = %v, want trimmed Unicode practice", evidence["exam"])
	}
	var state map[string]any
	raw, err := os.ReadFile(filepath.Join(c.ws, ".learning", "state.json"))
	if err != nil || json.Unmarshal(raw, &state) != nil {
		t.Fatalf("read exam state: %v", err)
	}
	if !equalJSONMap(state["exam"], map[string]any{"format": "practical", "practice": want}) {
		t.Fatalf("state.exam = %v, want trimmed Unicode practice", state["exam"])
	}
}

func TestCLIExamAndPracticeAreInitOnly(t *testing.T) {
	for _, command := range []string{"validate", "advance", "status"} {
		t.Run(command, func(t *testing.T) {
			c := newCLIFixture(t)
			var out bytes.Buffer
			if code := run(c.args("init", "--json"), &out); code != 0 {
				t.Fatalf("init exit = %d: %s", code, out.String())
			}
			statePath := filepath.Join(c.ws, ".learning", "state.json")
			before, err := os.ReadFile(statePath)
			if err != nil {
				t.Fatal(err)
			}
			for _, flag := range [][]string{{"--exam", "oral"}, {"--practice", "build an app"}} {
				args := c.args(command, flag...)
				if command == "advance" {
					args = append(args, "--stage", "preparation")
				}
				args = append(args, "--json")
				out.Reset()
				if code := run(args, &out); code != 2 {
					t.Fatalf("%s %s exit = %d, want 2: %s", command, strings.Join(flag, " "), code, out.String())
				}
				doc := parseOne(t, &out)
				if doc["status"] != "error" || !strings.Contains(doc["detail"].(string), "only accepted by the init command") {
					t.Fatalf("%s %s report = %v, want init-only rejection", command, strings.Join(flag, " "), doc)
				}
				after, err := os.ReadFile(statePath)
				if err != nil || !bytes.Equal(before, after) {
					t.Fatalf("%s %s changed the stored state: %v", command, strings.Join(flag, " "), err)
				}
			}
		})
	}
}
