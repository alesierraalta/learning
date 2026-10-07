// Package engine implements the deterministic deep-learning validation flow:
// per-stage objective checks, conditional obligations verified after the
// feedback event, receipt freshness, repeated per-part cycles with a bounded
// re-teach budget, learner evidence with engine-derived scores, and a
// recorded-review gate for the interpretations only a reviewer can make.
// Completion is fail-closed.
package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"learning/internal/rules"
)

// Options is the complete engine input for one CLI invocation.
type Options struct {
	Command   string // init | validate | advance | status | review
	Root      string
	Workspace string
	RulesPath string
	Mode      string // deep (default) | conceptual
	Stage     string // required for advance and review, optional for validate
	Rule      string // review: rubric id receiving the verdict
	Verdict   string // review: PASS or FAIL
	Reason    string // review: reviewer rationale (required)
	Reviewer  string // review: reviewer identity label (default "chat")
}

// Check is one validated requirement with its verdict and reason.
type Check struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"` // deterministic | semantic
	Status string `json:"status"`
	Reason string `json:"reason"`
}

// Report is the single JSON object emitted on stdout with --json.
type Report struct {
	Status    string         `json:"status"`
	Stage     string         `json:"stage"`
	Checks    []Check        `json:"checks"`
	NextStage string         `json:"nextStage"`
	Part      string         `json:"part,omitempty"`
	Evidence  map[string]any `json:"evidence,omitempty"`
	Detail    string         `json:"detail,omitempty"`
}

// Exit codes: 0 accepted/completed/waiting/skipped, 1 failed mandatory
// validation, 2 invalid arguments/configuration/operational failure.
const (
	ExitOK          = 0
	ExitFailedCheck = 1
	ExitOperational = 2
)

// Run executes one engine command and returns the report plus exit code.
func Run(opts Options) (Report, int) {
	switch opts.Command {
	case "init", "validate", "advance", "status", "review":
	case "":
		return errorReport("missing command: expected init, validate, advance, status or review"), ExitOperational
	default:
		return errorReport("unknown command " + opts.Command + ": expected init, validate, advance, status or review"), ExitOperational
	}
	if opts.Mode == "" {
		opts.Mode = "deep"
	}
	if opts.Mode != "deep" && opts.Mode != "conceptual" {
		return errorReport("invalid mode " + opts.Mode + ": expected deep or conceptual"), ExitOperational
	}
	if opts.Root == "" {
		return errorReport("missing required argument --root"), ExitOperational
	}
	if opts.Workspace == "" {
		return errorReport("missing required argument --workspace"), ExitOperational
	}
	if opts.RulesPath == "" {
		return errorReport("missing required argument --rules"), ExitOperational
	}
	if (opts.Command == "advance" || opts.Command == "review") && opts.Stage == "" {
		return errorReport(opts.Command + " requires an explicit --stage"), ExitOperational
	}
	if (opts.Command == "init" || opts.Command == "status") && opts.Stage != "" {
		return errorReport(opts.Command + " does not accept --stage"), ExitOperational
	}
	if opts.Command == "review" {
		if opts.Rule == "" {
			return errorReport("review requires --rule"), ExitOperational
		}
		opts.Verdict = strings.ToUpper(strings.TrimSpace(opts.Verdict))
		if opts.Verdict != "PASS" && opts.Verdict != "FAIL" {
			return errorReport("review requires --verdict PASS or FAIL"), ExitOperational
		}
		if strings.TrimSpace(opts.Reason) == "" {
			return errorReport("review requires a non-empty --reason"), ExitOperational
		}
		if strings.TrimSpace(opts.Reviewer) == "" {
			opts.Reviewer = "chat"
		}
	} else if opts.Rule != "" || opts.Verdict != "" || opts.Reason != "" || opts.Reviewer != "" {
		return errorReport("--rule/--verdict/--reason/--reviewer are only accepted by the review command"), ExitOperational
	}

	// Conceptual mode stays light: no rules read, no state, no reviews.
	if opts.Mode == "conceptual" {
		return Report{
			Status:    "skipped",
			Stage:     "",
			NextStage: "",
			Checks: []Check{{
				ID: "mode", Kind: "deterministic", Status: "SKIP",
				Reason: "conceptual mode: the deep-learning engine does not apply",
			}},
		}, ExitOK
	}

	r, err := rules.Load(opts.RulesPath)
	if err != nil {
		return errorReport("rules invalid: " + err.Error()), ExitOperational
	}
	if opts.Stage != "" && !containsStr(r.StageOrder, opts.Stage) {
		return errorReport("unknown stage " + opts.Stage + ": not declared in the rules file"), ExitOperational
	}

	rootReal, err := filepath.EvalSymlinks(opts.Root)
	if err != nil {
		return errorReport("root unavailable: " + opts.Root), ExitOperational
	}
	wsReal, err := filepath.EvalSymlinks(opts.Workspace)
	if err != nil {
		return errorReport("workspace unavailable: " + opts.Workspace), ExitOperational
	}
	rel, err := filepath.Rel(rootReal, wsReal)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return errorReport("workspace escapes the configured root: " + wsReal + " is not inside " + rootReal), ExitOperational
	}
	if fi, err := os.Stat(wsReal); err != nil || !fi.IsDir() {
		return errorReport("workspace is not a directory: " + wsReal), ExitOperational
	}

	switch opts.Command {
	case "init":
		return runInit(wsReal, r)
	case "status":
		return runStatus(wsReal, r)
	default:
		return runStage(opts, wsReal, r)
	}
}

// ErrorReport builds the single JSON error object used by the CLI for strict
// argument failures.
func ErrorReport(detail string) Report { return errorReport(detail) }

func errorReport(detail string) Report {
	return Report{Status: "error", Stage: "", Checks: []Check{}, NextStage: "", Detail: detail}
}

func passCheck(id, reason string) Check {
	return Check{ID: id, Kind: "deterministic", Status: "PASS", Reason: reason}
}

func failCheck(id, reason string) Check {
	return Check{ID: id, Kind: "deterministic", Status: "FAIL", Reason: reason}
}

func skipCheck(id, reason string) Check {
	return Check{ID: id, Kind: "deterministic", Status: "SKIP", Reason: reason}
}

func hasFAIL(checks []Check) bool {
	for _, c := range checks {
		if c.Status == "FAIL" {
			return true
		}
	}
	return false
}

func containsStr(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func shortHash(h string) string {
	if len(h) > 19 {
		return h[:19] + "..."
	}
	return h
}

// blocked assembles a blocked report for one or more failed mandatory checks.
func blocked(checks []Check, stage, next, part string, code int) (Report, int) {
	return Report{Status: "blocked", Stage: stage, Checks: checks, NextStage: next, Part: part}, code
}

// --- init ------------------------------------------------------------------

func runInit(ws string, r *rules.Rules) (Report, int) {
	release, err := acquireLock(ws)
	if err != nil {
		return errorReport(err.Error()), ExitOperational
	}
	defer release()
	if _, err := os.Stat(statePath(ws)); err == nil {
		return errorReport("run already initialized: .learning/state.json exists; refusing to overwrite the existing run"), ExitOperational
	}
	st := newState(ws, r.Hash)
	if err := saveState(ws, st); err != nil {
		return errorReport(err.Error()), ExitOperational
	}
	return Report{
		Status:    "accepted",
		NextStage: r.StageOrder[0],
		Checks: []Check{passCheck("run-initialized",
			fmt.Sprintf("deep run %s created; rules %s recorded", st.RunID, shortHash(r.Hash)))},
		Evidence: map[string]any{"runId": st.RunID},
	}, ExitOK
}

// --- status ----------------------------------------------------------------

// runStatus is side-effect free: it never locks, never writes and never
// records reviews. Stale receipts or reviews block; it never reports PASS.
func runStatus(ws string, r *rules.Rules) (Report, int) {
	st, err := loadState(ws)
	if err != nil {
		return blocked([]Check{failCheck("state-initialized", err.Error())},
			r.StageOrder[0], r.StageOrder[0], "", ExitFailedCheck)
	}
	fStage, fPart, complete := frontier(r, st, ws)

	checks := []Check{passCheck("state-initialized", fmt.Sprintf("engine state present (run %s)", st.RunID))}
	if st.RulesHash != r.Hash {
		checks = append(checks, failCheck("rules-current",
			fmt.Sprintf("rules changed since init: state has %s, current file has %s", shortHash(st.RulesHash), shortHash(r.Hash))))
	} else {
		checks = append(checks, passCheck("rules-current", "rules unchanged since init ("+shortHash(r.Hash)+")"))
	}

	stale := scanStale(r, st, ws)
	if len(stale) > 0 {
		checks = append(checks, failCheck("receipts-fresh", "stale receipts: "+formatStale(stale)))
	} else {
		checks = append(checks, passCheck("receipts-fresh", "all recorded artifact receipts verify"))
	}

	if checked, problems := semanticFreshness(r, st, ws); checked > 0 {
		if len(problems) > 0 {
			checks = append(checks, failCheck("semantic-receipts", "stale or missing judgments: "+strings.Join(problems, "; ")))
		} else {
			checks = append(checks, passCheck("semantic-receipts", fmt.Sprintf("%d semantic judgment(s) are fresh", checked)))
		}
	}

	// Every integrity problem is reported before blocking; no early return.
	if hasFAIL(checks) {
		return blocked(checks, fStage, fStage, fPart, ExitFailedCheck)
	}

	if complete {
		res := evalStage(r, st, ws, "final", "")
		checks = append(checks, res.checks...)
		if hasFAIL(res.checks) {
			return blocked(checks, "final", "final", "", ExitFailedCheck)
		}
		return Report{Status: "completed", Stage: "final", NextStage: "", Checks: checks}, ExitOK
	}

	if detectWait(r, ws, fStage, fPart) {
		checks = append(checks, skipCheck("learner-input",
			fmt.Sprintf("waiting for learner answers before %s can advance", fStage)))
		return Report{Status: "waiting", Stage: fStage, NextStage: fStage, Part: fPart, Checks: checks}, ExitOK
	}
	return Report{Status: "accepted", Stage: fStage, NextStage: fStage, Part: fPart, Checks: checks}, ExitOK
}

// --- validate / advance ----------------------------------------------------

func runStage(opts Options, ws string, r *rules.Rules) (Report, int) {
	record := opts.Command == "advance" || opts.Command == "review"
	st, err := loadState(ws)
	if err != nil {
		return blocked([]Check{failCheck("state-initialized", err.Error())},
			r.StageOrder[0], r.StageOrder[0], "", ExitFailedCheck)
	}
	if record {
		release, lockErr := acquireLock(ws)
		if lockErr != nil {
			return errorReport(lockErr.Error()), ExitOperational
		}
		defer release()
		if st, err = loadState(ws); err != nil {
			return blocked([]Check{failCheck("state-initialized", err.Error())},
				r.StageOrder[0], r.StageOrder[0], "", ExitFailedCheck)
		}
	}

	fStage, fPart, complete := frontier(r, st, ws)
	requested := opts.Stage
	if requested == "" { // validate without --stage targets the frontier
		if complete {
			requested = "final"
		} else {
			requested = fStage
		}
	}
	stale := scanStale(r, st, ws)

	if opts.Command == "review" && (fStage == "" || requested != fStage) {
		return errorReport(fmt.Sprintf(
			"review can only be recorded for the frontier stage; next required stage is %q", fStage)), ExitOperational
	}

	if fStage != "" && requested == fStage {
		return runFrontierStage(record, requested, fStage, fPart, stale, opts, ws, st, r)
	}
	if stageHasRecords(r, st, requested) {
		if len(stale) > 0 {
			checks := []Check{
				passCheck("state-initialized", "engine state present"),
				passCheck("rules-current", "rules unchanged since init"),
				failCheck("receipts-fresh", "stale receipts: "+formatStale(stale)),
			}
			return blocked(checks, requested, fStage, fPart, ExitFailedCheck)
		}
		checks := []Check{
			passCheck("state-initialized", "engine state present"),
			passCheck("rules-current", "rules unchanged since init"),
			passCheck("receipts-fresh", "all recorded artifact receipts verify"),
			passCheck("sequence", "stage already recorded and fresh; nothing to do"),
		}
		checks = append(checks, semanticReuseChecks(r, st, ws, requested)...)
		return Report{Status: "accepted", Stage: requested, NextStage: fStage, Part: fPart, Checks: checks}, ExitOK
	}
	// Not recorded and not the frontier: reject out-of-order transitions.
	checks := []Check{
		passCheck("state-initialized", "engine state present"),
		passCheck("rules-current", "rules unchanged since init"),
	}
	if len(stale) > 0 {
		checks = append(checks, failCheck("receipts-fresh", "stale receipts: "+formatStale(stale)))
	}
	checks = append(checks, failCheck("sequence",
		fmt.Sprintf("out of sequence: next required stage is %s; %s cannot advance yet", fStage, requested)))
	if hasCheckID(checks, "rules-invalid") {
		return errorReport(checkReason(checks, "rules-invalid")), ExitOperational
	}
	return blocked(checks, requested, fStage, fPart, ExitFailedCheck)
}

func hasCheckID(checks []Check, id string) bool {
	for _, c := range checks {
		if c.ID == id {
			return true
		}
	}
	return false
}

func checkReason(checks []Check, id string) string {
	for _, c := range checks {
		if c.ID == id {
			return c.Reason
		}
	}
	return ""
}

// runFrontierStage evaluates the current frontier stage. Advance validates
// objective checks first, then requires every applicable review to be recorded
// and fresh, and only then records. review stores one review verdict.
func runFrontierStage(record bool, requested, fStage, fPart string, stale []staleRef, opts Options, ws string, st *State, r *rules.Rules) (Report, int) {
	part := ""
	if r.IsPartStage(requested) {
		part = fPart
	}
	checks := []Check{passCheck("state-initialized", fmt.Sprintf("engine state present (run %s)", st.RunID))}
	if st.RulesHash != r.Hash {
		checks = append(checks, failCheck("rules-current",
			fmt.Sprintf("rules changed since init: state has %s, current file has %s", shortHash(st.RulesHash), shortHash(r.Hash))))
		return blocked(checks, requested, fStage, fPart, ExitFailedCheck)
	}
	checks = append(checks, passCheck("rules-current", "rules unchanged since init ("+shortHash(r.Hash)+")"))
	if len(stale) == 0 {
		checks = append(checks, passCheck("receipts-fresh", "all recorded artifact receipts verify"))
	} else {
		checks = append(checks, skipCheck("receipts-fresh",
			"stale receipts to repair after this stage: "+formatStale(stale)))
	}
	checks = append(checks, passCheck("sequence", "stage is the current frontier"))

	res := evalStage(r, st, ws, requested, part)
	checks = append(checks, res.checks...)
	if hasFAIL(checks) {
		if hasCheckID(checks, "rules-invalid") {
			return errorReport(checkReason(checks, "rules-invalid")), ExitOperational
		}
		return blocked(checks, requested, fStage, fPart, ExitFailedCheck)
	}

	rubrics := applicableRubrics(r, ws, requested, part)

	switch opts.Command {
	case "validate":
		c, pending, rerr := reviewChecks(r, st, ws, requested, part, rubrics, false)
		if rerr != nil {
			return errorReport(rerr.Error()), ExitOperational
		}
		checks = append(checks, c...)
		if hasFAIL(checks) {
			return blocked(checks, requested, fStage, fPart, ExitFailedCheck)
		}
		return Report{Status: "accepted", Stage: requested, NextStage: requested, Part: part,
			Checks: checks, Evidence: evidenceWith(res.evidence, pending)}, ExitOK
	case "review":
		return runReviewRecord(opts, requested, part, checks, res.evidence, ws, st, r, rubrics)
	}

	c, pending, rerr := reviewChecks(r, st, ws, requested, part, rubrics, true)
	if rerr != nil {
		return errorReport(rerr.Error()), ExitOperational
	}
	checks = append(checks, c...)
	if len(pending) > 0 {
		return Report{Status: "blocked", Stage: requested, NextStage: fStage, Part: part,
			Checks: checks, Evidence: evidenceWith(res.evidence, pending)}, ExitFailedCheck
	}
	if hasFAIL(checks) {
		// A recorded gate review with a FAIL verdict blocks progression.
		return blocked(checks, requested, fStage, fPart, ExitFailedCheck)
	}

	// Bounded re-teaching: a failing mini-quiz routes back to explanation.
	if requested == "quiz" && !evidenceBool(res.evidence, "quizPassed") {
		return recordFailedQuiz(r, st, ws, requested, part, res, checks, fStage, fPart)
	}

	// Planning enrolls the declared parts, reusing records for parts that
	// remain in the plan after a repair.
	if requested == "planning" {
		if err := enrollParts(r, st, ws); err != nil {
			return errorReport(err.Error()), ExitOperational
		}
	}

	receipts, err := buildReceipts(r, ws, requested, part)
	if err != nil {
		return errorReport(err.Error()), ExitOperational
	}
	rec := StageRecord{CompletedAt: time.Now().UTC(), Receipts: receipts, Evidence: res.evidence}
	if part == "" {
		st.Global[requested] = rec
	} else {
		ps := ensurePart(st, part)
		ps.Stages[requested] = rec
		if requested == "quiz" {
			ps.QuizAttempts = append(ps.QuizAttempts, QuizAttempt{
				Score: evidenceInt(res.evidence, "quizScore"), Passed: true, At: time.Now().UTC(),
				WrongIDs: evidenceStrings(res.evidence, "quizWrongIds"),
			})
		}
	}
	st.Counters.SuccessfulAdvances++
	if err := saveState(ws, st); err != nil {
		return errorReport(err.Error()), ExitOperational
	}

	nextStage, nextPart, complete := frontier(r, st, ws)
	status := "accepted"
	if complete {
		status = "completed"
		nextStage, nextPart = "", ""
	}
	return Report{Status: status, Stage: requested, NextStage: nextStage, Part: nextPart,
		Checks: checks, Evidence: res.evidence}, ExitOK
}

// recordFailedQuiz stores the failed attempt, spends one re-teach round and
// reopens explanation/own_words. Exhausting the budget blocks without writes.
func recordFailedQuiz(r *rules.Rules, st *State, ws, stage, part string, res evalResult, checks []Check, fStage, fPart string) (Report, int) {
	ps := ensurePart(st, part)
	max := r.Thresholds.Quiz.MaxReteachRounds
	if ps.ReteachRounds >= max {
		checks = append(checks, failCheck("reteach-bound",
			fmt.Sprintf("quiz failed again after %d re-teach rounds (max %d); bounded re-teaching is exhausted for part %s",
				ps.ReteachRounds, max, part)))
		return blocked(checks, stage, fStage, fPart, ExitFailedCheck)
	}
	ps.QuizAttempts = append(ps.QuizAttempts, QuizAttempt{
		Score: evidenceInt(res.evidence, "quizScore"), Passed: false, At: time.Now().UTC(),
		WrongIDs: evidenceStrings(res.evidence, "quizWrongIds"),
	})
	if rel, err := partRelFromWorkspace(r, ws, part); err == nil {
		if h, err := hashFile(absPath(ws, rel)); err == nil {
			ps.FailedExplanationHash = h
		}
	}
	ps.ReteachRounds++
	delete(ps.Stages, "explanation")
	delete(ps.Stages, "own_words")
	delete(ps.Stages, "quiz")
	st.Counters.SuccessfulAdvances++
	if err := saveState(ws, st); err != nil {
		return errorReport(err.Error()), ExitOperational
	}
	nextStage, nextPart, _ := frontier(r, st, ws)
	return Report{Status: "accepted", Stage: stage, NextStage: nextStage, Part: nextPart,
		Checks: checks, Evidence: res.evidence}, ExitOK
}

// --- shared helpers --------------------------------------------------------

// frontier returns the earliest stage that is incomplete or stale; an empty
// stage means every obligatory stage and conditional obligation is current.
func frontier(r *rules.Rules, st *State, ws string) (stage, part string, complete bool) {
	for _, s := range r.StageOrder {
		if s == "final" || s == "exercises" || s == "final_quiz" || r.IsPartStage(s) {
			continue
		}
		rec, ok := st.Global[s]
		if !ok {
			return s, "", false
		}
		if len(staleFiles(rec, ws, s, "", r, superseded(r, st, s))) > 0 {
			return s, "", false
		}
	}
	for _, p := range st.PartOrder {
		for _, s := range r.PartStages {
			ps := st.Parts[p]
			if ps == nil {
				return s, p, false
			}
			rec, ok := ps.Stages[s]
			if !ok || len(staleFiles(rec, ws, s, p, r, superseded(r, st, s))) > 0 ||
				len(semanticProblems(r, st, ws, s, p)) > 0 {
				return s, p, false
			}
		}
	}
	for _, s := range []string{"exercises", "final_quiz", "final"} {
		rec, ok := st.Global[s]
		if !ok || len(staleFiles(rec, ws, s, "", r, superseded(r, st, s))) > 0 {
			return s, "", false
		}
	}
	return "", "", true
}

// stageHasRecords reports whether a stage is already recorded up to the
// frontier. For part stages the recorded parts must be a prefix of the part
// order: a later part cannot vouch for an earlier, unrecorded one.
func stageHasRecords(r *rules.Rules, st *State, stage string) bool {
	if !r.IsPartStage(stage) {
		_, ok := st.Global[stage]
		return ok
	}
	found := false
	for _, p := range st.PartOrder {
		ps := st.Parts[p]
		if ps == nil {
			break
		}
		if _, ok := ps.Stages[stage]; !ok {
			break
		}
		found = true
	}
	return found
}

func ensurePart(st *State, part string) *PartState {
	ps, ok := st.Parts[part]
	if !ok || ps == nil {
		ps = &PartState{Stages: map[string]StageRecord{}}
		st.Parts[part] = ps
	}
	if ps.Stages == nil {
		ps.Stages = map[string]StageRecord{}
	}
	return ps
}

// enrollParts syncs the recorded part order with the current plan. Parts
// removed from the plan lose their records; kept parts keep their evidence.
func enrollParts(r *rules.Rules, st *State, ws string) error {
	planRel := declPathByKind(r, "preparation", "file_exists")
	doc, err := loadPlan(ws, planRel)
	if err != nil {
		return fmt.Errorf("cannot enroll parts: %w", err)
	}
	if err := validatePlanStructure(doc); err != nil {
		return fmt.Errorf("cannot enroll parts: %w", err)
	}
	order := make([]string, 0, len(doc.Parts))
	parts := make(map[string]*PartState, len(doc.Parts))
	for _, p := range doc.Parts {
		order = append(order, p.ID)
		if existing, ok := st.Parts[p.ID]; ok && existing != nil {
			parts[p.ID] = existing
		}
	}
	st.PartOrder = order
	st.Parts = parts
	return nil
}

// declPathByKind finds the primary artifact path declared for a check kind.
func declPathByKind(r *rules.Rules, stage, kind string) string {
	for _, d := range r.ChecksFor(stage) {
		if d.Kind == kind {
			return d.Path
		}
	}
	return ""
}

// declQA finds the questions/answers pair declared for a stage.
func declQA(r *rules.Rules, stage string) (questions, answers string) {
	for _, d := range r.ChecksFor(stage) {
		if d.Questions != "" && d.Answers != "" {
			return d.Questions, d.Answers
		}
	}
	return "", ""
}

// detectWait reports a legitimate pause: valid questions exist but the
// learner has not answered yet. Waiting is never a validation failure.
func detectWait(r *rules.Rules, ws, stage, part string) bool {
	qRel, aRel := declQA(r, stage)
	if qRel == "" {
		return false
	}
	switch stage {
	case "diagnosis":
		qs, err := loadDiagQuestions(ws, qRel)
		planRel := declPathByKind(r, "preparation", "file_exists")
		plan, planErr := loadPlan(ws, planRel)
		if err != nil || planErr != nil || validateDiagnostic(qs, &plan, r.Thresholds) != nil {
			return false
		}
	case "quiz":
		qs, err := loadQuizQuestions(ws, substPart(qRel, part))
		planRel := declPathByKind(r, "preparation", "file_exists")
		plan, planErr := loadPlan(ws, planRel)
		partPlan := planPartByID(plan, part)
		if err != nil || planErr != nil || partPlan == nil || validateQuizQuestions(qs, partPlan.Subtema, r.Thresholds) != nil {
			return false
		}
	default:
		return false
	}
	return answerFileMissing(ws, substPart(aRel, part))
}

// semanticFreshness re-verifies every recorded judgment against the current
// artifact and rules hashes.
func semanticFreshness(r *rules.Rules, st *State, ws string) (checked int, problems []string) {
	visit := func(stage, part string) {
		checked += len(applicableRubrics(r, ws, stage, part))
		problems = append(problems, semanticProblems(r, st, ws, stage, part)...)
	}
	for stage := range r.Checks {
		if len(r.RubricsFor(stage)) == 0 {
			continue
		}
		if r.IsPartStage(stage) {
			for _, p := range st.PartOrder {
				if ps := st.Parts[p]; ps != nil {
					if _, ok := ps.Stages[stage]; ok {
						visit(stage, p)
					}
				}
			}
			continue
		}
		if _, ok := st.Global[stage]; ok {
			visit(stage, "")
		}
	}
	return checked, problems
}

// semanticProblems reports missing or stale judgments of one recorded stage:
// the artifact or the evidence the judgment was bound to has changed.
func semanticProblems(r *rules.Rules, st *State, ws, stage, part string) []string {
	var problems []string
	for _, rub := range applicableRubrics(r, ws, stage, part) {
		rec := findSemantic(st, rub.ID, stage, part)
		if rec == nil {
			problems = append(problems, fmt.Sprintf("%s for %s review missing", rub.ID, stageLabel(stage, part)))
			continue
		}
		rel := rubricArtifactPath(r, st, ws, rub.Artifact, part)
		got, err := hashFile(absPath(ws, rel))
		bound := hashBytes([]byte(bindingContext(r, st, ws, stage, part, rub.Context)))
		if err != nil || got != rec.ArtifactHash || rec.RulesHash != r.Hash || rec.ContextHash != bound {
			problems = append(problems, fmt.Sprintf("%s for %s review is stale", rub.ID, stageLabel(stage, part)))
		}
	}
	return problems
}

// planContext sources are revised downstream on purpose (adaptation updates
// the plan); a judgment stays bound to the learner and diagnostic evidence it
// saw, so a later plan revision does not reopen an already closed part.
var planContext = map[string]bool{"plan": true, "plan-visual": true, "part-explanation": true}

// bindingContext is the evidence a judgment is bound to for freshness.
func bindingContext(r *rules.Rules, st *State, ws, stage, part string, sources []string) string {
	var keep []string
	for _, s := range sources {
		if !planContext[s] {
			keep = append(keep, s)
		}
	}
	return semanticContext(r, st, ws, stage, part, keep)
}

func stageLabel(stage, part string) string {
	if part == "" {
		return stage
	}
	return stage + "/" + part
}

func findSemantic(st *State, ruleID, stage, part string) *SemanticReceipt {
	for i := range st.Semantic {
		rec := &st.Semantic[i]
		if rec.RuleID == ruleID && rec.Stage == stage && rec.Part == part {
			return rec
		}
	}
	return nil
}

// semanticReuseChecks reports the recorded reviews of an already-recorded
// stage without performing any review operation. Part-level rubrics apply per
// part, so a rubric whose when-condition does not hold is never demanded.
func semanticReuseChecks(r *rules.Rules, st *State, ws, stage string) []Check {
	var out []Check
	for _, rub := range r.RubricsFor(stage) {
		if r.IsPartStage(stage) {
			count := 0
			applicable := 0
			fresh := true
			for _, p := range st.PartOrder {
				ps := st.Parts[p]
				if ps == nil {
					continue
				}
				if _, ok := ps.Stages[stage]; !ok {
					continue
				}
				if !rubricApplies(r, ws, p, rub) {
					continue
				}
				applicable++
				rec := findSemantic(st, rub.ID, stage, p)
				if rec == nil {
					fresh = false
					break
				}
				count++
			}
			if applicable == 0 {
				continue
			}
			if !fresh {
				out = append(out, Check{ID: rub.ID, Kind: "semantic", Status: "FAIL",
					Reason: "recorded review missing for a recorded stage"})
				continue
			}
			out = append(out, Check{ID: rub.ID, Kind: "semantic", Status: "PASS",
				Reason: fmt.Sprintf("recorded review(s) fresh for %s (%d part(s), artifact hashes unchanged)", rub.ID, count)})
			continue
		}
		out = append(out, Check{ID: rub.ID, Kind: "semantic", Status: "PASS",
			Reason: "recorded review fresh for " + rub.ID + " (artifact hash unchanged)"})
	}
	return out
}

// applicableRubrics filters the stage rubrics by their when switch, so a
// conditional review (e.g. visual-value) is only ever demanded when its
// condition holds. Unknown conditions fail closed (always applicable).
func applicableRubrics(r *rules.Rules, ws, stage, part string) []rules.Rubric {
	var out []rules.Rubric
	for _, rub := range r.RubricsFor(stage) {
		if rubricApplies(r, ws, part, rub) {
			out = append(out, rub)
		}
	}
	return out
}

// rubricApplies resolves one rubric's when switch for a part. Fail-closed:
// anything unreadable or unknown keeps the review requirement.
func rubricApplies(r *rules.Rules, ws, part string, rub rules.Rubric) bool {
	switch rub.When {
	case "":
		return true
	case "visualsPlanned":
		if part == "" {
			return true
		}
		plan, err := loadPlan(ws, declPathByKind(r, "preparation", "file_exists"))
		if err != nil {
			return true
		}
		p := planPartByID(plan, part)
		if p == nil {
			return true
		}
		return p.VisualsPlanned == nil || *p.VisualsPlanned
	default:
		return true
	}
}

// reviewBinding binds one rubric to the current artifact and its evidence.
type reviewBinding struct {
	rel          string
	artifactHash string
	contextData  string
	contextHash  string
	err          error
}

func bindReview(r *rules.Rules, st *State, ws, stage, part string, rub rules.Rubric) reviewBinding {
	var b reviewBinding
	b.rel = rubricArtifactPath(r, st, ws, rub.Artifact, part)
	data, err := os.ReadFile(absPath(ws, b.rel))
	if err != nil {
		b.err = err
		return b
	}
	b.artifactHash = hashBytes(data)
	b.contextData = semanticContext(r, st, ws, stage, part, rub.Context)
	b.contextHash = hashBytes([]byte(bindingContext(r, st, ws, stage, part, rub.Context)))
	return b
}

func reviewFresh(rub rules.Rubric, rec *SemanticReceipt, b reviewBinding, r *rules.Rules) bool {
	return rec != nil && rec.ArtifactHash == b.artifactHash &&
		rec.RulesHash == r.Hash && rec.ContextHash == b.contextHash
}

// pendingReview is the actionable review request handed to the chat: the
// interpretation to perform plus the artifact and evidence to consider.
func pendingReview(rub rules.Rubric, b reviewBinding, stage, part string) map[string]any {
	kind := "gate"
	if !rub.IsGate() {
		kind = "assessment"
	}
	return map[string]any{
		"rule":         rub.ID,
		"kind":         kind,
		"stage":        stage,
		"part":         part,
		"artifact":     b.rel,
		"instruction":  rub.Instruction,
		"context":      b.contextData,
		"artifactHash": b.artifactHash,
	}
}

// reviewChecks evaluates the recorded review of every applicable rubric.
// Missing or stale reviews become pending requests: FAIL on advance (a stage
// may not proceed unreviewed), SKIP on validate. A fresh gate FAIL verdict
// fails the stage either way; an assessment verdict is reported as evidence.
func reviewChecks(r *rules.Rules, st *State, ws, stage, part string, rubrics []rules.Rubric, forAdvance bool) ([]Check, []map[string]any, error) {
	var checks []Check
	var pending []map[string]any
	for _, rub := range rubrics {
		b := bindReview(r, st, ws, stage, part, rub)
		if b.err != nil {
			return nil, nil, fmt.Errorf("review artifact unavailable: %s", b.rel)
		}
		rec := findSemantic(st, rub.ID, stage, part)
		if !reviewFresh(rub, rec, b, r) {
			pending = append(pending, pendingReview(rub, b, stage, part))
			status := "SKIP"
			if forAdvance {
				status = "FAIL"
			}
			checks = append(checks, Check{ID: rub.ID, Kind: "semantic", Status: status,
				Reason: "recorded review missing or stale: see evidence.pendingReviews, then record it with the review command"})
			continue
		}
		if rec.Verdict == "FAIL" && rub.IsGate() {
			checks = append(checks, Check{ID: rub.ID, Kind: "semantic", Status: "FAIL",
				Reason: "recorded review FAIL by " + rec.Reviewer + ": " + truncate(rec.Reason, 400)})
			continue
		}
		reason := fmt.Sprintf("recorded review by %s: %s — %s", rec.Reviewer, rec.Verdict, truncate(rec.Reason, 200))
		if !rub.IsGate() {
			reason = fmt.Sprintf("assessment recorded by %s: verdict %s — %s", rec.Reviewer, rec.Verdict, truncate(rec.Reason, 200))
		}
		checks = append(checks, Check{ID: rub.ID, Kind: "semantic", Status: "PASS", Reason: reason})
	}
	return checks, pending, nil
}

// evidenceWith attaches the pending review requests to the stage evidence.
func evidenceWith(base map[string]any, pending []map[string]any) map[string]any {
	if len(pending) == 0 {
		return base
	}
	if base == nil {
		base = map[string]any{}
	}
	base["pendingReviews"] = pending
	return base
}

// runReviewRecord stores the reviewer's verdict for one rubric, bound to the
// current artifact, rules and evidence hashes. The stage's objective checks
// must pass first, and a review never counts as an advance.
func runReviewRecord(opts Options, stage, part string, checks []Check, stageEvidence map[string]any, ws string, st *State, r *rules.Rules, rubrics []rules.Rubric) (Report, int) {
	var rub *rules.Rubric
	for i := range rubrics {
		if rubrics[i].ID == opts.Rule {
			rub = &rubrics[i]
			break
		}
	}
	if rub == nil {
		return errorReport(fmt.Sprintf("rule %q is not an applicable review rule for stage %s", opts.Rule, stageLabel(stage, part))), ExitOperational
	}
	verdict := strings.ToUpper(strings.TrimSpace(opts.Verdict))
	if verdict != "PASS" && verdict != "FAIL" {
		return errorReport("invalid verdict " + opts.Verdict + ": expected PASS or FAIL"), ExitOperational
	}
	reason := strings.TrimSpace(opts.Reason)
	if reason == "" {
		return errorReport("review requires a non-empty --reason"), ExitOperational
	}
	reviewer := strings.TrimSpace(opts.Reviewer)
	if reviewer == "" {
		reviewer = "chat"
	}
	b := bindReview(r, st, ws, stage, part, *rub)
	if b.err != nil {
		return errorReport("review artifact unavailable: " + b.rel), ExitOperational
	}
	st.Semantic = mergeSemantic(st.Semantic, []SemanticReceipt{{
		RuleID: rub.ID, Stage: stage, Part: part, Artifact: b.rel,
		ArtifactHash: b.artifactHash, RulesHash: r.Hash, ContextHash: b.contextHash,
		Reviewer: reviewer, Verdict: verdict, Reason: truncate(reason, 400),
	}})
	if err := saveState(ws, st); err != nil {
		return errorReport(err.Error()), ExitOperational
	}
	checks = append(checks, Check{ID: rub.ID, Kind: "semantic", Status: "PASS",
		Reason: fmt.Sprintf("review recorded by %s: %s — %s", reviewer, verdict, truncate(reason, 200))})
	ev := stageEvidence
	if ev == nil {
		ev = map[string]any{}
	}
	ev["reviewRecorded"] = rub.ID
	return Report{Status: "accepted", Stage: stage, NextStage: stage, Part: part,
		Checks: checks, Evidence: ev}, ExitOK
}

func semanticContext(r *rules.Rules, st *State, ws, stage, part string, sources []string) string {
	var out strings.Builder
	for _, source := range sources {
		switch source {
		case "plan":
			path := declPathByKind(r, "planning", "planificador_sections")
			b, _ := os.ReadFile(absPath(ws, path))
			out.Write(b)
			structured, _ := os.ReadFile(absPath(ws, declPathByKind(r, "preparation", "file_exists")))
			out.WriteString("\n")
			out.Write(structured)
		case "diagnostic-wrong":
			path := declPathByKind(r, "diagnosis", "diagnostic_questions")
			qs, _ := loadDiagQuestions(ws, path)
			wrong := map[string]bool{}
			for _, id := range diagnosticWrong(st) {
				wrong[id] = true
			}
			for _, q := range qs {
				if wrong[q.ID] {
					raw, _ := json.Marshal(q)
					out.Write(raw)
				}
			}
		case "previous-feedback":
			// Feedback recorded before this explanation: earlier parts and this
			// part's failed mini-quiz attempts (never its own later feedback).
			for _, p := range st.PartOrder {
				if p == part {
					break
				}
				if ps := st.Parts[p]; ps != nil {
					if rec, ok := ps.Stages["feedback"]; ok {
						raw, _ := json.Marshal(map[string]any{"part": p, "feedback": rec.Evidence})
						out.Write(raw)
					}
				}
			}
			if ps := st.Parts[part]; ps != nil {
				for _, attempt := range ps.QuizAttempts {
					if !attempt.Passed {
						raw, _ := json.Marshal(attempt)
						out.Write(raw)
					}
				}
			}
		case "plan-visual", "part-explanation":
			p, _ := loadPlan(ws, declPathByKind(r, "preparation", "file_exists"))
			if partPlan := planPartByID(p, part); partPlan != nil {
				raw, _ := json.Marshal(partPlan)
				out.Write(raw)
			}
		case "own-words":
			submission, _ := ownWordsSubmission(r, ws, part)
			out.WriteString(submission)
		case "quiz-wrong-answers":
			if ps := st.Parts[part]; ps != nil {
				if rec, ok := ps.Stages["quiz"]; ok {
					raw, _ := json.Marshal(rec.Evidence)
					out.Write(raw)
				}
			}
		}
	}
	return out.String()
}

func diagnosticWrong(st *State) []string {
	if rec, ok := st.Global["diagnosis"]; ok {
		if v, ok := rec.Evidence["diagnosticWrong"].([]any); ok {
			var ids []string
			for _, x := range v {
				if s, ok := x.(string); ok {
					ids = append(ids, s)
				}
			}
			return ids
		}
	}
	return nil
}

func partRelFromWorkspace(r *rules.Rules, ws, part string) (string, error) {
	plan, err := loadPlan(ws, declPathByKind(r, "preparation", "file_exists"))
	if err != nil {
		return "", err
	}
	return partRel(&plan, declPathByKind(r, "explanation", "part_file"), part)
}

func rubricArtifactPath(r *rules.Rules, st *State, ws, template, part string) string {
	if part != "" && (strings.Contains(template, "{index}") || strings.Contains(template, "{slug}")) {
		planRel := declPathByKind(r, "preparation", "file_exists")
		plan, err := loadPlan(ws, planRel)
		if err != nil {
			return ""
		}
		rel, err := partRel(&plan, template, part)
		if err != nil {
			return ""
		}
		return rel
	}
	return substPart(template, part)
}

func mergeSemantic(existing, additions []SemanticReceipt) []SemanticReceipt {
	for _, add := range additions {
		replaced := false
		for i := range existing {
			if existing[i].RuleID == add.RuleID && existing[i].Stage == add.Stage && existing[i].Part == add.Part {
				existing[i] = add
				replaced = true
				break
			}
		}
		if !replaced {
			existing = append(existing, add)
		}
	}
	return existing
}

// buildReceipts hashes every artifact the stage depends on. Conditional
// requirements are receipted by the stage that verifies them, so a plan edit
// after the obligation was proven invalidates that proof.
func buildReceipts(r *rules.Rules, ws, stage, part string) (map[string]string, error) {
	out := map[string]string{}
	planRel := declPathByKind(r, "preparation", "file_exists")
	plan, _ := loadPlan(ws, planRel)
	for _, decl := range r.ChecksFor(stage) {
		if !decl.WantsReceipt() {
			continue
		}
		for _, tpl := range decl.Files() {
			rel := substPart(tpl, part)
			if part != "" && (strings.Contains(tpl, "{index}") || strings.Contains(tpl, "{slug}")) {
				var err error
				rel, err = partRel(&plan, tpl, part)
				if err != nil {
					return nil, err
				}
			}
			if strings.Contains(rel, "{") {
				continue
			}
			h, err := receiptHash(r, ws, rel, stage, part)
			if err != nil {
				return nil, fmt.Errorf("cannot hash receipt artifact %s: %w", rel, err)
			}
			out[rel] = h
		}
	}
	for i := range r.Conditions {
		cond := &r.Conditions[i]
		if verifyStageFor(r, cond) != stage {
			continue
		}
		for _, path := range cond.Require.Paths {
			h, err := hashFile(absPath(ws, path))
			if err != nil {
				return nil, fmt.Errorf("cannot hash conditional artifact %s: %w", path, err)
			}
			out[path] = h
		}
	}
	if stage == "planning" {
		for _, rel := range []string{"mis-palabras.md"} {
			h, err := receiptHash(r, ws, rel, stage, part)
			if err != nil {
				return nil, fmt.Errorf("cannot hash planning receipt artifact %s: %w", rel, err)
			}
			out[rel] = h
		}
	}
	return out, nil
}

// verifyStageFor returns the stage that proves a conditional obligation: the
// part stage following the trigger stage (feedback -> adaptation).
func verifyStageFor(r *rules.Rules, cond *rules.Condition) string {
	if cond.Require.Kind != "changed_after" {
		return ""
	}
	if !r.IsPartStage(cond.OnStage) {
		return "final" // closing obligations (map re-score) are proven at completion
	}
	for i, s := range r.PartStages {
		if s == cond.OnStage && i+1 < len(r.PartStages) {
			return r.PartStages[i+1]
		}
	}
	return ""
}

func evidenceBool(ev map[string]any, key string) bool {
	v, _ := ev[key].(bool)
	return v
}

func evidenceStrings(ev map[string]any, key string) []string {
	switch values := ev[key].(type) {
	case []string:
		return append([]string(nil), values...)
	case []any:
		var out []string
		for _, value := range values {
			if s, ok := value.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

func evidenceInt(ev map[string]any, key string) int {
	switch v := ev[key].(type) {
	case int:
		return v
	case float64:
		return int(v)
	}
	return 0
}
