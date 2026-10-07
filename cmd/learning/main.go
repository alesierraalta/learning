// Command learning is the CLI boundary of the deep-learning validation
// engine. With --json, stdout is exactly one JSON report object and nothing
// else. Exit codes: 0 accepted/completed/waiting/skipped, 1 failed mandatory
// validation, 2 invalid arguments/configuration/operational failure.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"learning/internal/engine"
)

const usage = `learning — deep-learning validation engine (structured rules, deterministic checks, recorded reviews)

Usage:
  learning <init|validate|advance|status|review> --root ROOT --workspace TOPIC --rules RULES [--mode MODE] [--stage STAGE] [--json]
  learning review --root ROOT --workspace TOPIC --rules RULES --stage STAGE --rule RULE --verdict PASS|FAIL --reason TEXT [--reviewer LABEL] [--json]
  learning help

Commands:
  init       Create engine-owned state (.learning/state.json) for a new deep run.
             Refuses to overwrite an existing run. Writes nothing else.
  validate   Evaluate the objective checks of a stage without writing anything.
             Reports each applicable review rule: fresh reviews as PASS,
             missing/stale ones as SKIP plus evidence.pendingReviews (the
             instruction, artifact and context to judge). Targets the frontier
             stage when --stage is omitted.
  advance    Validate objective checks first, then require every applicable
             review to be recorded and fresh, and only then record stage
             evidence. A pending review, a FAIL gate verdict, failing
             validation or exhausted re-teaching records nothing.
  review     Record the chat's review verdict (PASS or FAIL) for one rubric of
             the frontier stage, bound to the current artifact, rules and
             evidence hashes. Requires the stage's objective checks to pass
             first and never counts as an advance.
  status     Side-effect-free recheck: receipt freshness, recorded reviews,
             conditional obligations, the next required stage and fail-closed
             completion. Never writes.

Review flow (the chat, optionally via subagents, is the reviewer):
  validate <stage>  ->  read evidence.pendingReviews (rubric instruction + context)
  review   <stage> --rule <id> --verdict PASS|FAIL --reason "<rationale>"
  advance  <stage>  ->  blocked until every applicable review is fresh and passes

Flags:
  --root      Canonical Learnings root directory (containment boundary).
  --workspace Topic workspace directory inside the root (realpath-checked).
  --rules     Structured rules file (repository rules/deep.json): stage order,
              thresholds, check declarations, conditions and rubrics.
  --mode      deep (default) or conceptual. Conceptual reports skipped and
              touches neither state nor reviews.
  --stage     Stage name; required for advance and review, optional for
              validate, rejected for init and status.
  --rule      review only: rubric id receiving the verdict.
  --verdict   review only: PASS or FAIL.
  --reason    review only: reviewer rationale (required, non-empty).
  --reviewer  review only: reviewer identity label (default "chat").
  --json      Emit exactly one JSON report object on stdout.

Stage input artifacts (workspace-relative; the engine never creates them):
  plan.json                          topic + parts (examplesPlanned/visualsPlanned);
                                     planning adds diagnosisSummary + focusAreas
  quiz.json                          6 prerequisite + 6 topic questions (levels
                                     1/2/3 two each), options A-D plus E "No sé"
  diagnosis answers file             learner answers keyed by question id
  planificador.md                    planning sections (diagnosisSummary link)
  mapa.mmd                           dependency graph (re-scored at final)
  explicaciones/Parte {index} - {slug}.md   per-part explanation with
                                     heading/example/visual
  mis-palabras.md                    learner own-words area per part
  mini-quiz/{part}.json              5 mini-quiz questions; answers are scored here
  feedback/{part}.json               partId, difficultyDetected, notes
  ejercicios.md, cuestionario-final.md       closing bundle (mandatory)

Exit codes: 0 accepted/completed/waiting/skipped; 1 failed mandatory
validation; 2 invalid arguments/configuration/operational failure.`

func main() {
	os.Exit(run(os.Args[1:], os.Stdout))
}

// run parses argv strictly and executes one engine command. All engine
// output — including errors in JSON mode — is a single object written to out.
func run(args []string, out io.Writer) int {
	jsonMode := hasJSONFlag(args)
	opts, wantHelp, err := parseArgs(args)
	if err != nil {
		return emit(engine.ErrorReport(err.Error()), engine.ExitOperational, jsonMode, out)
	}
	if wantHelp {
		if jsonMode {
			return emit(engine.Report{Status: "accepted", Checks: []engine.Check{}, Detail: usage}, engine.ExitOK, jsonMode, out)
		}
		fmt.Fprintln(out, usage)
		return engine.ExitOK
	}
	rep, code := engine.Run(opts)
	return emit(rep, code, jsonMode, out)
}

func hasJSONFlag(args []string) bool {
	for _, a := range args {
		if a == "--json" {
			return true
		}
	}
	return false
}

func emit(rep engine.Report, code int, jsonMode bool, out io.Writer) int {
	if rep.Checks == nil {
		rep.Checks = []engine.Check{}
	}
	if jsonMode {
		b, err := json.Marshal(rep)
		if err != nil {
			fmt.Fprintf(out, "{\"status\":\"error\",\"checks\":[],\"detail\":\"report encoding failed\"}\n")
			return engine.ExitOperational
		}
		fmt.Fprintf(out, "%s\n", b)
		return code
	}
	fmt.Fprintf(out, "status: %s", rep.Status)
	if rep.Stage != "" {
		fmt.Fprintf(out, " stage: %s", rep.Stage)
	}
	if rep.NextStage != "" {
		fmt.Fprintf(out, " next: %s", rep.NextStage)
	}
	if rep.Part != "" {
		fmt.Fprintf(out, " part: %s", rep.Part)
	}
	fmt.Fprintln(out)
	if rep.Detail != "" {
		fmt.Fprintf(out, "detail: %s\n", rep.Detail)
	}
	for _, c := range rep.Checks {
		fmt.Fprintf(out, "%s %s — %s\n", c.Status, c.ID, c.Reason)
	}
	return code
}

// parseArgs enforces the strict argv contract: one known command, exact flag
// names, values for every value-flag, no duplicates, no stray tokens.
func parseArgs(args []string) (engine.Options, bool, error) {
	if len(args) == 0 {
		return engine.Options{}, false, fmt.Errorf("missing command: expected init, validate, advance, status or review (see: learning help)")
	}
	switch args[0] {
	case "help", "--help", "-h":
		return engine.Options{}, true, nil
	case "init", "validate", "advance", "status", "review":
	default:
		return engine.Options{}, false, fmt.Errorf("unknown command %q: expected init, validate, advance, status or review", args[0])
	}
	opts := engine.Options{Command: args[0], Mode: "deep"}
	seen := map[string]bool{}
	for i := 1; i < len(args); i++ {
		tok := args[i]
		if tok == "--json" {
			if seen["json"] {
				return engine.Options{}, false, fmt.Errorf("duplicate flag --json")
			}
			seen["json"] = true
			continue
		}
		if !strings.HasPrefix(tok, "--") {
			return engine.Options{}, false, fmt.Errorf("unexpected argument %q", tok)
		}
		name := strings.TrimPrefix(tok, "--")
		switch name {
		case "root", "workspace", "rules", "mode", "stage",
			"rule", "verdict", "reason", "reviewer":
		default:
			return engine.Options{}, false, fmt.Errorf("unknown flag --%s", name)
		}
		if seen[name] {
			return engine.Options{}, false, fmt.Errorf("duplicate flag --%s", name)
		}
		if i+1 >= len(args) {
			return engine.Options{}, false, fmt.Errorf("missing value for --%s", name)
		}
		i++
		seen[name] = true
		switch name {
		case "root":
			opts.Root = args[i]
		case "workspace":
			opts.Workspace = args[i]
		case "rules":
			opts.RulesPath = args[i]
		case "mode":
			opts.Mode = args[i]
		case "stage":
			opts.Stage = args[i]
		case "rule":
			opts.Rule = args[i]
		case "verdict":
			opts.Verdict = args[i]
		case "reason":
			opts.Reason = args[i]
		case "reviewer":
			opts.Reviewer = args[i]
		}
	}
	for _, req := range []string{"root", "workspace", "rules"} {
		if !seen[req] {
			return engine.Options{}, false, fmt.Errorf("missing required flag --%s", req)
		}
	}
	if seen["mode"] && opts.Mode != "deep" && opts.Mode != "conceptual" {
		return engine.Options{}, false, fmt.Errorf("invalid mode %q: expected deep or conceptual", opts.Mode)
	}
	if opts.Command == "advance" && !seen["stage"] {
		return engine.Options{}, false, fmt.Errorf("advance requires an explicit --stage")
	}
	if (opts.Command == "init" || opts.Command == "status") && seen["stage"] {
		return engine.Options{}, false, fmt.Errorf("%s does not accept --stage", opts.Command)
	}
	if opts.Command == "review" {
		for _, need := range []string{"stage", "rule", "verdict", "reason"} {
			if !seen[need] {
				return engine.Options{}, false, fmt.Errorf("review requires --%s", need)
			}
		}
	}
	for _, extra := range []string{"rule", "verdict", "reason", "reviewer"} {
		if seen[extra] && opts.Command != "review" {
			return engine.Options{}, false, fmt.Errorf("--%s is only accepted by the review command", extra)
		}
	}
	return opts, false, nil
}
