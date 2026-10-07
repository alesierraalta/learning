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
		for _, want := range []string{"init", "validate", "advance", "status", "review", "--rules", "plan.json", "--verdict", "pendingReviews"} {
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
