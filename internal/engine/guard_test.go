package engine

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Strict argument validation: every operational problem is an error report.
func TestStrictArgumentValidation(t *testing.T) {
	f := newFixture(t)
	cases := []struct {
		name string
		opts func() Options
	}{
		{"missing command", func() Options { return Options{Mode: "deep"} }},
		{"unknown command", func() Options { o := f.opts("explode", ""); return o }},
		{"empty root", func() Options { o := f.opts("status", ""); o.Root = ""; return o }},
		{"empty workspace", func() Options { o := f.opts("status", ""); o.Workspace = ""; return o }},
		{"empty rules path", func() Options { o := f.opts("status", ""); o.RulesPath = ""; return o }},
		{"bad mode", func() Options { o := f.opts("status", ""); o.Mode = "turbo"; return o }},
		{"advance without stage", func() Options { o := f.opts("advance", ""); return o }},
		{"init with stage", func() Options { o := f.opts("init", "preparation"); return o }},
		{"status with stage", func() Options { o := f.opts("status", "quiz"); return o }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rep, code := f.run(t, tc.opts())
			if code != 2 || rep.Status != "error" {
				t.Fatalf("got status=%q code=%d, want error/2", rep.Status, code)
			}
			if rep.Detail == "" {
				t.Fatal("error report must explain the problem")
			}
			// Exactly one machine-readable object, even for errors.
			b, err := json.Marshal(rep)
			if err != nil {
				t.Fatal(err)
			}
			var round Report
			if err := json.Unmarshal(b, &round); err != nil || round.Status != "error" {
				t.Fatalf("error report is not one valid object: %v", err)
			}
		})
	}
}

// Conceptual mode never touches state, rules or the judge.
func TestConceptualModeSkipsEverything(t *testing.T) {
	f := newFixture(t)
	opts := f.opts("init", "")
	opts.Mode = "conceptual"
	rep, code := f.run(t, opts)
	assertGatePassing(t, rep, code, "skipped")
	if _, err := os.Stat(filepath.Join(f.ws, ".learning")); !os.IsNotExist(err) {
		t.Fatalf("conceptual mode must write no learning state, stat err = %v", err)
	}
	// Even with broken configuration, conceptual mode stays a skip.
	opts.RulesPath = filepath.Join(f.base, "missing-rules.json")
	rep, code = f.run(t, opts)
	assertGatePassing(t, rep, code, "skipped")
}

// Path containment: traversal and symlink escapes are rejected before any I/O.
func TestWorkspaceContainment(t *testing.T) {
	t.Run("outside root", func(t *testing.T) {
		f := newFixture(t)
		outside := filepath.Join(f.base, "elsewhere")
		if err := os.MkdirAll(outside, 0o755); err != nil {
			t.Fatal(err)
		}
		opts := f.opts("init", "")
		opts.Workspace = outside
		rep, code := f.run(t, opts)
		if code != 2 || rep.Status != "error" || !strings.Contains(rep.Detail, "escape") {
			t.Fatalf("got status=%q code=%d detail=%q, want escape error/2", rep.Status, code, rep.Detail)
		}
		if _, err := os.Stat(filepath.Join(outside, ".learning")); !os.IsNotExist(err) {
			t.Fatal("state must not be written outside the root")
		}
	})
	t.Run("symlink escape", func(t *testing.T) {
		f := newFixture(t)
		outside := filepath.Join(f.base, "elsewhere")
		if err := os.MkdirAll(outside, 0o755); err != nil {
			t.Fatal(err)
		}
		link := filepath.Join(f.root, "link")
		if err := os.Symlink(outside, link); err != nil {
			t.Skipf("symlink unavailable: %v", err)
		}
		opts := f.opts("init", "")
		opts.Workspace = link
		rep, code := f.run(t, opts)
		if code != 2 || !strings.Contains(rep.Detail, "escape") {
			t.Fatalf("got status=%q code=%d detail=%q, want escape error/2", rep.Status, code, rep.Detail)
		}
	})
	t.Run("missing workspace", func(t *testing.T) {
		f := newFixture(t)
		opts := f.opts("status", "")
		opts.Workspace = filepath.Join(f.root, "ghost")
		rep, code := f.run(t, opts)
		if code != 2 || rep.Status != "error" {
			t.Fatalf("got status=%q code=%d, want error/2", rep.Status, code)
		}
	})
}

// init refuses to overwrite an existing run.
func TestInitRefusesOverwrite(t *testing.T) {
	f := newFixture(t)
	f.initOK(t)
	first := f.tryReadState(t)
	rep, code := f.run(t, f.opts("init", ""))
	if code != 2 || rep.Status != "error" || !strings.Contains(rep.Detail, "already") {
		t.Fatalf("got status=%q code=%d detail=%q, want overwrite refusal", rep.Status, code, rep.Detail)
	}
	if string(f.tryReadState(t)) != string(first) {
		t.Fatal("refused init mutated existing state")
	}
}

// An existing note without engine state must never be reported as complete.
func TestUninitializedWorkspaceIsBlockedForExistingNotes(t *testing.T) {
	f := newFixture(t)
	f.write(t, "apuntes-existente.md", "# Nota previa del vault\nContenido heredado sin eventos del motor.\n")
	rep, code := f.run(t, f.opts("status", ""))
	assertBlocked(t, rep, code)
	c, ok := hasCheck(rep, "state-initialized")
	if !ok || c.Status != "FAIL" {
		t.Fatalf("state-initialized check = %+v, want FAIL", c)
	}
	if rep.Status == "completed" {
		t.Fatal("engine must not fabricate completion for pre-existing notes")
	}
	rep, code = f.run(t, f.opts("advance", "preparation"))
	assertBlocked(t, rep, code)
}

// validate reports the same verdicts as advance, hands out the pending
// review requests, and writes nothing.
func TestValidateHasNoSideEffects(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "v1")
	before := f.tryReadState(t)

	rep, code := f.run(t, f.opts("validate", "explanation"))
	assertGatePassing(t, rep, code, "accepted")
	semantic, ok := hasCheck(rep, "explanation-adapted")
	if !ok || semantic.Status != "SKIP" {
		t.Fatalf("validate semantic check = %+v, want SKIP (review recorded separately)", semantic)
	}
	if n := len(pendingListOf(rep.Evidence)); n != 2 {
		t.Fatalf("validate must hand out %d pending reviews, got %v", n, rep.Evidence)
	}
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("validate mutated state")
	}

	// Recording the stage, then a failing validate: still no writes.
	f.advanceOK(t, "explanation")
	before = f.tryReadState(t)
	f.writeOwnWordsText(t, "p1", "")
	rep, code = f.run(t, f.opts("validate", "own_words"))
	assertBlocked(t, rep, code)
	if c, ok := hasCheck(rep, "own-words-area"); !ok || c.Status != "FAIL" {
		t.Fatalf("empty own_words must FAIL, got %+v", rep.Checks)
	}
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("failing validate mutated state")
	}
}

// Two simultaneous advances must never corrupt state: exactly one records,
// the other is rejected or idempotent, and the success counter stays at one.
func TestConcurrentAdvancesNeverCorruptState(t *testing.T) {
	f := newFixture(t)
	f.initOK(t)
	f.writePlan(t, defaultParts()...)

	start := make(chan struct{})
	results := make(chan int, 2)
	for i := 0; i < 2; i++ {
		go func() {
			<-start
			_, code := Run(f.opts("advance", "preparation"))
			results <- code
		}()
	}
	close(start)
	codes := []int{<-results, <-results}
	for i, code := range codes {
		if code != ExitOK && code != ExitOperational {
			t.Fatalf("advance #%d exit = %d, want 0 (recorded/idempotent) or 2 (lock rejected)", i+1, code)
		}
	}
	st := f.state(t) // parses; a torn write would fail here
	if n := successfulAdvances(t, st); n != 1 {
		t.Fatalf("successfulAdvances = %v, want exactly 1 after concurrent advances", n)
	}
	if _, err := os.Stat(filepath.Join(f.ws, ".learning", "lock")); !os.IsNotExist(err) {
		t.Fatalf("lock must be released, stat err = %v", err)
	}
}

// A held lock rejects concurrent mutation; a stale lock is taken over.
func TestAdvanceLocking(t *testing.T) {
	f := newFixture(t)
	f.initOK(t)
	f.writePlan(t, defaultParts()...)
	lock := filepath.Join(f.ws, ".learning", "lock")
	if err := os.WriteFile(lock, []byte("held"), 0o644); err != nil {
		t.Fatal(err)
	}
	before := f.tryReadState(t)
	rep, code := f.run(t, f.opts("advance", "preparation"))
	if code != 2 || rep.Status != "error" || !strings.Contains(rep.Detail, "progress") {
		t.Fatalf("held lock: status=%q code=%d detail=%q, want in-progress error/2", rep.Status, code, rep.Detail)
	}
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("rejected concurrent advance mutated state")
	}

	// Stale lock (older than the takeover window) does not brick the engine.
	stale := time.Now().Add(-10 * time.Minute)
	if err := os.Chtimes(lock, stale, stale); err != nil {
		t.Fatal(err)
	}
	f.advanceOK(t, "preparation")
	if _, err := os.Stat(lock); !os.IsNotExist(err) {
		t.Fatalf("lock must be released after advance, stat err = %v", err)
	}
}

// Unknown rules syntax or check kinds fail closed as operational errors.
func TestMalformedRulesFailClosed(t *testing.T) {
	f := newFixture(t)
	cases := map[string]string{
		"not json":         `{broken`,
		"unknown kind":     strings.Replace(mustRules(t), `"kind": "plan_valid"`, `"kind": "telepathy_check"`, 1),
		"unknown cond":     strings.Replace(mustRules(t), `"changed_after"`, `"vibes_changed"`, 1),
		"missing version":  strings.Replace(mustRules(t), `"version": 1`, `"version": 99`, 1),
		"bad visual block": strings.Replace(mustRules(t), `"visualBlocks": ["mermaid"`, `"visualBlocks": ["mer maid"`, 1),
	}
	for name, content := range cases {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "rules.json")
			if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
				t.Fatal(err)
			}
			opts := f.opts("status", "")
			opts.RulesPath = path
			rep, code := f.run(t, opts)
			if code != 2 || rep.Status != "error" {
				t.Fatalf("got status=%q code=%d, want fail-closed error/2", rep.Status, code)
			}
		})
	}
}

func mustRules(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile(repoRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
