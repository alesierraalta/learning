package engine

import (
	"strings"
	"testing"
)

func readyForExplanation(t *testing.T) *fixture {
	t.Helper()
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "texto juzgable")
	return f
}

// The engine never interprets content and calls no external model: a judged
// stage needs a review recorded by the chat (or a subagent it dispatches),
// bound to the current artifact, rules and evidence. Missing review blocks
// with exit 1 and validate hands out the actionable review request.
func TestAdvanceBlockedWithoutRecordedReview(t *testing.T) {
	f := readyForExplanation(t)
	before := f.tryReadState(t)

	rep, code := f.run(t, f.opts("validate", "explanation"))
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("validate: status=%q exit=%d, want accepted/0 (checks: %+v)", rep.Status, code, rep.Checks)
	}
	pending := pendingListOf(rep.Evidence)
	if len(pending) != 2 {
		t.Fatalf("pendingReviews = %d, want 2 (explanation-adapted + visual-value): %+v", len(pending), pending)
	}
	for _, p := range pending {
		for _, key := range []string{"rule", "stage", "artifact", "instruction", "context", "artifactHash"} {
			if v, _ := p[key].(string); v == "" {
				t.Fatalf("pending review %q missing %s: %+v", p["rule"], key, p)
			}
		}
	}

	rep, code = f.run(t, f.opts("advance", "explanation"))
	assertBlocked(t, rep, code)
	if code != 1 {
		t.Fatalf("unreviewed advance exit = %d, want 1 (failed mandatory validation)", code)
	}
	for _, id := range []string{"explanation-adapted", "visual-value"} {
		c, ok := hasCheck(rep, id)
		if !ok || c.Kind != "semantic" || c.Status != "FAIL" {
			t.Fatalf("check %s = %+v, want kind=semantic FAIL", id, c)
		}
	}
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("unreviewed advance must not record the stage")
	}
}

// A recorded review unblocks the advance; the receipt binds artifact, rules
// and evidence hashes, and a second advance reuses it without re-recording.
func TestRecordedReviewUnblocksAdvance(t *testing.T) {
	f := readyForExplanation(t)
	if n := f.reviewPending(t, "explanation"); n != 2 {
		t.Fatalf("recorded reviews = %d, want 2", n)
	}
	f.advanceOK(t, "explanation") // reviewPending inside records nothing new

	st := f.state(t)
	sem, ok := st["semantic"].([]any)
	if !ok || len(sem) != 2 {
		t.Fatalf("semantic receipts = %v, want exactly 2", st["semantic"])
	}
	entry := sem[0].(map[string]any)
	for _, key := range []string{"ruleId", "artifactHash", "rulesHash", "reviewer", "verdict", "reason", "stage", "part"} {
		if v, ok := entry[key]; !ok || v == "" {
			t.Fatalf("review receipt %q missing or empty: %+v", key, entry)
		}
	}
	if !strings.HasPrefix(entry["artifactHash"].(string), "sha256:") {
		t.Fatalf("artifactHash = %v, want sha256 digest", entry["artifactHash"])
	}
	if entry["reviewer"] != "test-reviewer" {
		t.Fatalf("reviewer = %v, want test-reviewer", entry["reviewer"])
	}

	// Second advance with unchanged content reuses the recorded reviews.
	rep := f.advanceOK(t, "explanation")
	c, _ := hasCheck(rep, "explanation-adapted")
	if c.Status != "PASS" || !strings.Contains(c.Reason, "recorded review") {
		t.Fatalf("reused review check = %+v", c)
	}
}

// Editing the artifact after a review makes the review stale: validate hands
// the request out again and advance blocks until it is re-recorded.
func TestEditedArtifactInvalidatesRecordedReview(t *testing.T) {
	f := readyForExplanation(t)
	f.reviewPending(t, "explanation")
	f.advanceOK(t, "explanation")

	f.writeExplanation(t, "p1", true, "v2 editada despues del review")
	rep, code := f.run(t, f.opts("validate", "explanation"))
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("validate after edit: status=%q exit=%d (checks: %+v)", rep.Status, code, rep.Checks)
	}
	if n := len(pendingListOf(rep.Evidence)); n != 2 {
		t.Fatalf("stale reviews pending = %d, want 2", n)
	}
	rep, code = f.run(t, f.opts("advance", "explanation"))
	assertBlocked(t, rep, code)

	// Re-record against the edited artifact; the stage then re-receipts it.
	f.reviewPending(t, "explanation")
	f.advanceOK(t, "explanation")
}

// A gate review with FAIL verdict blocks the stage and keeps its reason; an
// assessment verdict FAIL is recorded evidence and never gates progression.
func TestGateFailReviewBlocksAssessmentIsEvidence(t *testing.T) {
	f := readyForExplanation(t)
	f.recordReview(t, "explanation", "explanation-adapted", "FAIL", "no responde al error conceptual diagnosticado")
	before := f.tryReadState(t)

	rep, code := f.run(t, f.opts("advance", "explanation"))
	assertBlocked(t, rep, code)
	if code != 1 {
		t.Fatalf("gate FAIL exit = %d, want 1", code)
	}
	c, ok := hasCheck(rep, "explanation-adapted")
	if !ok || c.Status != "FAIL" || !strings.Contains(c.Reason, "error conceptual") {
		t.Fatalf("gate FAIL check = %+v", c)
	}
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("blocked advance mutated state")
	}

	// Reviewer accepts after the correction; the stage then advances.
	f.recordReview(t, "explanation", "explanation-adapted", "PASS", "corregido")
	f.reviewPending(t, "explanation")
	f.advanceOK(t, "explanation")

	// Assessment FAIL verdict stays evidence on a passing stage.
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 5)
	f.advanceOK(t, "quiz")
	f.writeFeedback(t, "p1", true)
	f.recordReview(t, "feedback", "central-gap", "FAIL", "laguna conceptual importante en quorums")
	rep = f.advanceOK(t, "feedback")
	c, ok = hasCheck(rep, "central-gap")
	if !ok || c.Status != "PASS" || !strings.Contains(c.Reason, "verdict FAIL") {
		t.Fatalf("assessment verdict must be evidence: %+v", c)
	}
}

// The review command validates its own arguments, only targets the frontier
// stage and requires the objective checks to pass first.
func TestReviewCommandValidation(t *testing.T) {
	f := readyForExplanation(t)
	before := f.tryReadState(t)

	// Rubric not declared (or not applicable) for this stage.
	opts := f.opts("review", "explanation")
	opts.Rule, opts.Verdict, opts.Reason = "central-gap", "PASS", "motivo"
	rep, code := f.run(t, opts)
	if code != 2 || rep.Status != "error" || !strings.Contains(rep.Detail, "not an applicable review rule") {
		t.Fatalf("unknown rule: status=%q exit=%d detail=%q", rep.Status, code, rep.Detail)
	}

	for _, tc := range []struct{ rule, verdict, reason, want string }{
		{"explanation-adapted", "MAYBE", "motivo", "--verdict"},
		{"explanation-adapted", "PASS", "   ", "--reason"},
		{"", "PASS", "motivo", "--rule"},
	} {
		opts := f.opts("review", "explanation")
		opts.Rule, opts.Verdict, opts.Reason = tc.rule, tc.verdict, tc.reason
		rep, code = f.run(t, opts)
		if code != 2 || rep.Status != "error" || !strings.Contains(rep.Detail, tc.want) {
			t.Fatalf("case %+v: status=%q exit=%d detail=%q", tc, rep.Status, code, rep.Detail)
		}
	}

	// Review only targets the frontier stage.
	opts = f.opts("review", "quiz")
	opts.Rule, opts.Verdict, opts.Reason = "distractor-quality", "PASS", "motivo"
	rep, code = f.run(t, opts)
	if code != 2 || !strings.Contains(rep.Detail, "frontier") {
		t.Fatalf("non-frontier review: status=%q exit=%d detail=%q", rep.Status, code, rep.Detail)
	}

	// Objective checks must pass before a review is accepted.
	f.write(t, f.canonicalPartFile(t, "p1"), "contenido roto sin estructura")
	opts = f.opts("review", "explanation")
	opts.Rule, opts.Verdict, opts.Reason = "explanation-adapted", "PASS", "motivo"
	rep, code = f.run(t, opts)
	assertBlocked(t, rep, code)
	if code != 1 {
		t.Fatalf("review over failing objective checks exit = %d, want 1", code)
	}
	if string(f.tryReadState(t)) != string(before) {
		t.Fatalf("rejected review mutated state")
	}
}

// The pending review request carries the diagnosed context the reviewer needs
// (plan summary, wrongly answered question) as plain untrusted data.
func TestPendingReviewCarriesDiagnosedContext(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6) // diagnosis summary + wrong answers d3, d7
	f.writeExplanation(t, "p1", true, "v1")

	rep, code := f.run(t, f.opts("validate", "explanation"))
	if code != 0 {
		t.Fatalf("validate exit = %d", code)
	}
	var adapted map[string]any
	for _, p := range pendingListOf(rep.Evidence) {
		if p["rule"] == "explanation-adapted" {
			adapted = p
		}
	}
	if adapted == nil {
		t.Fatal("no pending explanation-adapted review")
	}
	ctx, _ := adapted["context"].(string)
	if !strings.Contains(ctx, "Dificultades detectadas en consenso") {
		t.Fatalf("pending context lacks plan/diagnostic summary: %s", trunc(ctx, 400))
	}
	if !strings.Contains(ctx, "¿Qué resultado produce este caso?") || !strings.Contains(ctx, "d3") {
		t.Fatalf("pending context lacks the wrongly answered question: %s", trunc(ctx, 400))
	}
}

// status is side-effect free and reports a stale review of a recorded stage.
func TestStatusReportsStaleReview(t *testing.T) {
	f := readyForExplanation(t)
	f.reviewPending(t, "explanation")
	f.advanceOK(t, "explanation")

	f.writeExplanation(t, "p1", true, "v2 cambia despues del review")
	rep := f.statusExpect(t, "blocked")
	c, ok := hasCheck(rep, "semantic-receipts")
	if !ok || c.Status != "FAIL" || !strings.Contains(c.Reason, "review is stale") {
		t.Fatalf("semantic-receipts check = %+v, want stale review", c)
	}
}

// A rubric whose when-condition does not hold (no visual planned) is never
// demanded: validate does not list it and the review command refuses it.
func TestVisualValueNotRequiredWithoutPlannedVisual(t *testing.T) {
	f := newFixture(t)
	p1 := partCfg{id: "p1", ex: true, vis: false, title: "Parte"}
	f.readyParts(t, []partCfg{p1}, 2, 6)
	f.writeExplanation(t, "p1", false, "explicacion sin visual planeado")

	rep, code := f.run(t, f.opts("validate", "explanation"))
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("validate: status=%q exit=%d", rep.Status, code)
	}
	pending := pendingListOf(rep.Evidence)
	if len(pending) != 1 || pending[0]["rule"] != "explanation-adapted" {
		t.Fatalf("pending = %+v, want only explanation-adapted", pending)
	}

	opts := f.opts("review", "explanation")
	opts.Rule, opts.Verdict, opts.Reason = "visual-value", "PASS", "motivo"
	rep, code = f.run(t, opts)
	if code != 2 || !strings.Contains(rep.Detail, "not an applicable review rule") {
		t.Fatalf("non-applicable rule: status=%q exit=%d detail=%q", rep.Status, code, rep.Detail)
	}

	f.reviewPending(t, "explanation")
	f.advanceOK(t, "explanation") // completes without ever reviewing visual-value
}
