package engine

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"learning/internal/rules"
)

// StageRecord is the evidence recorded when a stage advances successfully.
type StageRecord struct {
	CompletedAt time.Time         `json:"completedAt"`
	Receipts    map[string]string `json:"receipts"`
	Evidence    map[string]any    `json:"evidence,omitempty"`
}

// QuizAttempt stores one derived mini-quiz result (never caller-supplied).
type QuizAttempt struct {
	Score    int       `json:"score"`
	Passed   bool      `json:"passed"`
	WrongIDs []string  `json:"wrongIds,omitempty"`
	At       time.Time `json:"at"`
}

// PartState tracks the repeated per-part cycle and the bounded re-teach budget.
type PartState struct {
	Stages        map[string]StageRecord `json:"stages"`
	ReteachRounds int                    `json:"reteachRounds"`
	QuizAttempts  []QuizAttempt          `json:"quizAttempts,omitempty"`
	// FailedExplanationHash is the explanation snapshot taken when an attempt
	// failed; the next attempt requires a genuinely changed explanation (B4).
	FailedExplanationHash string `json:"failedExplanationHash,omitempty"`
}

// SemanticReceipt binds a recorded review to artifact, rules and context
// hashes and records the reviewer identity label (never a credential).
type SemanticReceipt struct {
	RuleID       string `json:"ruleId"`
	Stage        string `json:"stage"`
	Part         string `json:"part,omitempty"`
	Artifact     string `json:"artifact"`
	ArtifactHash string `json:"artifactHash"`
	RulesHash    string `json:"rulesHash"`
	ContextHash  string `json:"contextHash"`
	Reviewer     string `json:"reviewer"`
	Verdict      string `json:"verdict"`
	Reason       string `json:"reason"`
}

// Counters tracks successful state writes; failures never increment them.
type Counters struct {
	SuccessfulAdvances int `json:"successfulAdvances"`
}

// State is the engine-owned .learning/state.json document.
type State struct {
	Version   int                    `json:"version"`
	RunID     string                 `json:"runId"`
	Mode      string                 `json:"mode"`
	Workspace string                 `json:"workspace"`
	CreatedAt time.Time              `json:"createdAt"`
	RulesHash string                 `json:"rulesHash"`
	Counters  Counters               `json:"counters"`
	Global    map[string]StageRecord `json:"global"`
	PartOrder []string               `json:"partOrder"`
	Parts     map[string]*PartState  `json:"parts"`
	Semantic  []SemanticReceipt      `json:"semantic"`
}

const stateVersion = 1
const lockStaleAfter = 5 * time.Minute

var errLockHeld = errors.New("another operation in progress: workspace lock is held")

func stateDir(ws string) string  { return filepath.Join(ws, ".learning") }
func statePath(ws string) string { return filepath.Join(stateDir(ws), "state.json") }
func lockPath(ws string) string  { return filepath.Join(stateDir(ws), "lock") }

func newState(workspace, rulesHash string) *State {
	return &State{
		Version:   stateVersion,
		RunID:     newRunID(),
		Mode:      "deep",
		Workspace: workspace,
		CreatedAt: time.Now().UTC(),
		RulesHash: rulesHash,
		Global:    map[string]StageRecord{},
		PartOrder: []string{},
		Parts:     map[string]*PartState{},
		Semantic:  []SemanticReceipt{},
	}
}

func newRunID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("run-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

func loadState(ws string) (*State, error) {
	raw, err := os.ReadFile(statePath(ws))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("run not initialized: execute init before validate, advance or status")
		}
		return nil, fmt.Errorf("state unreadable: %w", err)
	}
	var st State
	if err := json.Unmarshal(raw, &st); err != nil {
		return nil, fmt.Errorf("state.json is invalid: %w", err)
	}
	if st.Version != stateVersion {
		return nil, fmt.Errorf("state version %d is unsupported", st.Version)
	}
	if st.Global == nil {
		st.Global = map[string]StageRecord{}
	}
	if st.Parts == nil {
		st.Parts = map[string]*PartState{}
	}
	return &st, nil
}

// commitMu orders a signal-driven exit after any in-flight state commit, so
// the lock is never released while state.json is still being replaced.
var commitMu sync.Mutex

// saveState writes atomically so concurrent readers never see a torn file.
func saveState(ws string, st *State) error {
	commitMu.Lock()
	defer commitMu.Unlock()
	if err := os.MkdirAll(stateDir(ws), 0o755); err != nil {
		return fmt.Errorf("cannot create state directory: %w", err)
	}
	raw, err := json.Marshal(st)
	if err != nil {
		return fmt.Errorf("state encoding failed: %w", err)
	}
	tmp := statePath(ws) + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return fmt.Errorf("state write failed: %w", err)
	}
	if err := os.Rename(tmp, statePath(ws)); err != nil {
		return fmt.Errorf("state commit failed: %w", err)
	}
	return nil
}

// lockAcquiredHook is a test seam called while the workspace lock is held.
var lockAcquiredHook func()

// acquireLock serializes mutating commands. A concurrent holder is rejected;
// a stale lock (crashed process) is taken over instead of bricking the run.
// Signal handling starts before the lock exists, so no SIGTERM or SIGINT can
// land between creating the lock and being able to remove it.
func acquireLock(ws string) (func(), error) {
	if err := os.MkdirAll(stateDir(ws), 0o755); err != nil {
		return nil, fmt.Errorf("cannot create state directory: %w", err)
	}
	p := lockPath(ws)
	g := newLockGuard()
	for attempt := 0; attempt < 2; attempt++ {
		commitMu.Lock()
		f, err := os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
		if err == nil {
			g.path = p
		}
		commitMu.Unlock()
		if err == nil {
			_, _ = f.Write([]byte(newRunID()))
			_ = f.Close()
			if lockAcquiredHook != nil {
				lockAcquiredHook()
			}
			return g.release, nil
		}
		if !os.IsExist(err) {
			g.stop()
			return nil, fmt.Errorf("lock creation failed: %w", err)
		}
		if fi, statErr := os.Stat(p); statErr == nil && time.Since(fi.ModTime()) > lockStaleAfter {
			_ = os.Remove(p)
			continue
		}
		g.stop()
		return nil, errLockHeld
	}
	g.stop()
	return nil, errLockHeld
}

// lockGuard removes the owned lock when SIGTERM or SIGINT ends the process
// (the Pi adapter's execFile timeout sends SIGTERM), so an interrupted
// command does not block the workspace for lockStaleAfter. path and released
// are guarded by commitMu, which also makes the exit wait for any in-flight
// state commit.
type lockGuard struct {
	sigs     chan os.Signal
	done     chan struct{}
	path     string
	released bool
}

func newLockGuard() *lockGuard {
	g := &lockGuard{sigs: make(chan os.Signal, 1), done: make(chan struct{})}
	signal.Notify(g.sigs, syscall.SIGTERM, os.Interrupt)
	go func() {
		select {
		case sig := <-g.sigs:
			commitMu.Lock()
			if g.path != "" && !g.released {
				_ = os.Remove(g.path)
			}
			code := 130
			if sig == syscall.SIGTERM {
				code = 143
			}
			os.Exit(code)
		case <-g.done:
		}
	}()
	return g
}

// stop ends signal handling without touching any lock.
func (g *lockGuard) stop() {
	signal.Stop(g.sigs)
	close(g.done)
}

// release removes the owned lock, then restores default signal handling.
func (g *lockGuard) release() {
	commitMu.Lock()
	defer commitMu.Unlock()
	g.released = true
	_ = os.Remove(g.path)
	g.stop()
}

func hashBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func hashFile(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return hashBytes(b), nil
}

// staleRef names a recorded stage whose artifact no longer matches its receipt.
type staleRef struct {
	Stage string
	Part  string
	Files []string
}

// staleFiles returns the receipt mismatches of one record (missing files too).
func staleFiles(rec StageRecord, ws, stage, part string, r *rules.Rules, skip map[string]bool) []string {
	var stale []string
	for rel, want := range rec.Receipts {
		if skip[rel] {
			continue
		}
		got, err := receiptHash(r, ws, rel, stage, part)
		if err != nil || got != want {
			stale = append(stale, rel)
		}
	}
	return stale
}

// superseded lists artifacts whose change after a recorded closing trigger is
// itself the obligation (the map re-score after the final quiz). Earlier
// receipts of those paths are superseded; the final stage re-validates and
// receipts them, so later edits still invalidate completion.
func superseded(r *rules.Rules, st *State, stage string) map[string]bool {
	out := map[string]bool{}
	if stage == "final" {
		return out
	}
	for _, c := range r.Conditions {
		if c.Field != "" || r.IsPartStage(c.OnStage) {
			continue
		}
		if _, ok := st.Global[c.OnStage]; !ok {
			continue
		}
		for _, p := range c.Require.Paths {
			out[p] = true
		}
	}
	return out
}

// scanStale collects every recorded stage whose receipts no longer verify.
func scanStale(r *rules.Rules, st *State, ws string) []staleRef {
	var out []staleRef
	for _, stage := range r.StageOrder {
		if r.IsPartStage(stage) {
			for _, part := range st.PartOrder {
				ps := st.Parts[part]
				if ps == nil {
					continue
				}
				if rec, ok := ps.Stages[stage]; ok {
					if files := staleFiles(rec, ws, stage, part, r, superseded(r, st, stage)); len(files) > 0 {
						out = append(out, staleRef{Stage: stage, Part: part, Files: files})
					}
				}
			}
			continue
		}
		if rec, ok := st.Global[stage]; ok {
			if files := staleFiles(rec, ws, stage, "", r, superseded(r, st, stage)); len(files) > 0 {
				out = append(out, staleRef{Stage: stage, Files: files})
			}
		}
	}
	return out
}

func formatStale(refs []staleRef) string {
	var parts []string
	for i, ref := range refs {
		if i == 4 {
			parts = append(parts, fmt.Sprintf("+%d more", len(refs)-4))
			break
		}
		name := ref.Stage
		if ref.Part != "" {
			name += "/" + ref.Part
		}
		parts = append(parts, fmt.Sprintf("%s(%s)", name, joinLimited(ref.Files, 3)))
	}
	return joinLimitedStrs(parts, ", ")
}

func joinLimited(items []string, max int) string {
	if len(items) > max {
		return joinLimitedStrs(items[:max], ",") + fmt.Sprintf("+%d", len(items)-max)
	}
	return joinLimitedStrs(items, ",")
}

func joinLimitedStrs(items []string, sep string) string {
	out := ""
	for i, s := range items {
		if i > 0 {
			out += sep
		}
		out += s
	}
	return out
}
