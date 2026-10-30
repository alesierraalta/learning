// Package rules loads and validates the structured deep-learning rules file,
// the source of truth for stages, thresholds, check declarations, conditional
// triggers and semantic rubrics. Unknown kinds or malformed structure fail
// closed at load time.
package rules

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

// KnownCheckKinds is the closed set of deterministic checks the engine can
// evaluate. A rules file declaring anything else is rejected.
var KnownCheckKinds = map[string]bool{
	"file_exists":               true,
	"plan_valid":                true,
	"planning_link":             true,
	"diagnostic_questions":      true,
	"diagnostic_answers":        true,
	"planificador_sections":     true,
	"index_note":                true,
	"mis_palabras_structure":    true,
	"mis_palabras_area":         true,
	"part_file":                 true,
	"explanation_content":       true,
	"changed_after_failed_quiz": true,
	"part_has_mini_quiz":        true,
	"quiz_questions":            true,
	"quiz_answers":              true,
	"quiz_passed":               true,
	"feedback_valid":            true,
	"feedback_evidence":         true,
	"feedback_condition":        true,
	"exercises_note":            true,
	"final_quiz_note":           true,
	"all_current":               true,
	"mermaid_graph":             true,
	"concept_verdicts":          true,
	"pareto_plan":               true,
	"pareto_part":               true,
	"demo_part":                 true,
}

// partPathKinds require a {part}/{index}/{slug} placeholder: their artifact is
// one file per planned topic part.
var partPathKinds = map[string]bool{
	"part_file":                 true,
	"feedback_valid":            true,
	"feedback_evidence":         true,
	"explanation_content":       true,
	"changed_after_failed_quiz": true,
	"quiz_questions":            true,
	"quiz_answers":              true,
	"pareto_part":               true,
	"demo_part":                 true,
}

var knownRequireKinds = map[string]bool{"changed_after": true}

// AssessmentKinds lists rubric kinds whose PASS/FAIL verdict is recorded as
// evidence instead of gating progression (only judge errors block those).
var RubricKinds = []string{"gate", "assessment"}

// KnownContexts is the closed set of semantic context sources the engine can
// hand to the judge alongside an artifact.
var KnownContexts = map[string]bool{
	"plan":               true,
	"diagnostic-wrong":   true,
	"previous-feedback":  true,
	"plan-visual":        true,
	"part-explanation":   true,
	"own-words":          true,
	"quiz-wrong-answers": true,
	// diagnosis-reasoning is the diagnosis questions with the learner's
	// answers and reasoning (concept diagnosis).
	"diagnosis-reasoning": true,
}

// KnownWhen is the closed set of part-level applicability switches for rubrics.
var KnownWhen = map[string]bool{"": true, "visualsPlanned": true, "diagnosisAsked": true, "pareto": true}

// canonicalOrder fixes the stage sequence the engine semantics rely on; a
// rules file must declare exactly this order (values come from the rules).
var canonicalOrder = []string{
	"preparation", "diagnosis", "planning",
	"explanation", "own_words", "quiz", "feedback", "adaptation",
	"exercises", "final_quiz", "final",
}

var canonicalPartStages = []string{"explanation", "own_words", "quiz", "feedback", "adaptation"}

// The strict university flow takes the mini-quiz before the learner's own words.
var strictOrder = []string{
	"preparation", "diagnosis", "planning",
	"explanation", "quiz", "own_words", "feedback", "adaptation",
	"exercises", "final_quiz", "final",
}

var strictPartStages = []string{"explanation", "quiz", "own_words", "feedback", "adaptation"}

// CheckDecl is a simple, closed check declaration: id, kind and artifact
// paths. There is no general expression language to misread.
type CheckDecl struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Path      string `json:"path,omitempty"`
	Questions string `json:"questions,omitempty"`
	Answers   string `json:"answers,omitempty"`
	Note      string `json:"note,omitempty"`
	// Verdicts is the concept-verdict file a planning_link also reads.
	Verdicts string `json:"verdicts,omitempty"`
	// Receipt selects whether the declared files are hashed into the stage
	// receipt (default true). Preparation sets it to false so that plan.json
	// edits before planning are validated by planning, not treated as drift.
	Receipt *bool `json:"receipt,omitempty"`
}

// Files returns the deduplicated artifacts this declaration reads.
func (d CheckDecl) Files() []string {
	var out []string
	for _, p := range []string{d.Path, d.Questions, d.Answers, d.Note, d.Verdicts} {
		if p != "" && !slices.Contains(out, p) {
			out = append(out, p)
		}
	}
	return out
}

// WantsReceipt reports whether declared files feed the stage receipt.
func (d CheckDecl) WantsReceipt() bool { return d.Receipt == nil || *d.Receipt }

type RequireDecl struct {
	Kind  string   `json:"kind"`
	Paths []string `json:"paths"`
}

type Condition struct {
	ID      string      `json:"id"`
	OnStage string      `json:"onStage"`
	Field   string      `json:"field,omitempty"`
	Equals  bool        `json:"equals,omitempty"`
	Require RequireDecl `json:"require"`
}

type Rubric struct {
	ID          string   `json:"id"`
	Stage       string   `json:"stage"`
	Artifact    string   `json:"artifact"`
	Kind        string   `json:"kind,omitempty"` // gate (default) | assessment
	When        string   `json:"when,omitempty"`
	Context     []string `json:"context,omitempty"`
	Instruction string   `json:"instruction"`
}

// IsGate reports whether a verdict FAIL blocks progression.
func (r Rubric) IsGate() bool { return r.Kind != "assessment" }

// DiagnosticThresholds declares either the fixed diagnosis (prerequisite and
// topic counts) or, with Mode "adaptive", short rounds that move each area up
// a level on a right answer and down to a foundation on a wrong one.
type DiagnosticThresholds struct {
	Mode              string         `json:"mode,omitempty"`
	RoundSize         int            `json:"roundSize,omitempty"`
	MaxRounds         int            `json:"maxRounds,omitempty"`
	PrerequisiteCount int            `json:"prerequisiteCount,omitempty"`
	TopicCount        int            `json:"topicCount,omitempty"`
	TopicLevelCounts  map[string]int `json:"topicLevelCounts,omitempty"`
}

// Adaptive reports the round-based diagnosis.
func (d DiagnosticThresholds) Adaptive() bool { return d.Mode == "adaptive" }

type QuizThresholds struct {
	QuestionCount    int `json:"questionCount"`
	MinPassingScore  int `json:"minPassingScore"`
	MaxReteachRounds int `json:"maxReteachRounds"`
}

// Ratio is a fraction num/den in (0, 1].
type Ratio struct {
	Num int `json:"num"`
	Den int `json:"den"`
}

// ConceptThresholds turn on concept diagnosis: integrative questions declare
// the concepts they need, every answer carries the learner's reasoning, the
// chat records per-concept verdicts quoted from it, and the model chooses how
// many questions to ask within the bounds. Runs whose rules snapshot has no
// concepts block keep the fixed counts and the up/down diagnosis.
type ConceptThresholds struct {
	Required              bool     `json:"required"`
	MinPerQuestion        int      `json:"minPerQuestion"`
	MaxPerQuestion        int      `json:"maxPerQuestion"`
	States                []string `json:"states"`
	GapState              string   `json:"gapState"`
	MinQuestions          int      `json:"minQuestions"`
	MaxQuestions          int      `json:"maxQuestions"`
	DiagnosisMaxQuestions int      `json:"diagnosisMaxQuestions"`
	MinPassingRatio       Ratio    `json:"minPassingRatio"`
}

// ParetoThresholds bound a pareto-scope run: only the vital slice of each
// part is taught, and the trim has to be declared before it is applied.
type ParetoThresholds struct {
	MaxParts       int    `json:"maxParts"`
	MinCriterioLen int    `json:"minCriterioChars"`
	Heading        string `json:"heading"`
	MaxWords       int    `json:"maxWords"`
}

type OptionThresholds struct {
	Keys       []string `json:"keys"`
	NoSayKey   string   `json:"noSayKey"`
	NoSayText  string   `json:"noSayText"`
	AnswerKeys []string `json:"answerKeys"`
}

type Thresholds struct {
	Diagnostic DiagnosticThresholds `json:"diagnostic"`
	Quiz       QuizThresholds       `json:"quiz"`
	Concepts   *ConceptThresholds   `json:"concepts,omitempty"`
	Pareto     *ParetoThresholds    `json:"pareto,omitempty"`
	// StrictFlow asks the learner, once the diagnosis settles, how to be taught
	// (pareto or preferencias) before anything is planned. Snapshots without it
	// keep going straight from the diagnosis to planning.
	StrictFlow     bool              `json:"strictFlow,omitempty"`
	Options        OptionThresholds  `json:"options"`
	Niveles        []string          `json:"niveles"`
	NivelByLevel   map[string]string `json:"nivelByLevel"`
	PiezaTipos     []string          `json:"piezaTipos"`
	MisPalabrasHdr string            `json:"misPalabrasHeader"`
	PlanVisualHead string            `json:"planVisualHeading"`
	PlanSections   []string          `json:"planSections"`
	// VisualBlocks are fenced code-block languages that render a visual in
	// the vault (native mermaid and installed Obsidian plugins). Embeds
	// (![...]) always count as visuals.
	VisualBlocks []string `json:"visualBlocks"`
	// HowToReadLine is the literal marker line every planned visual must be
	// followed by (M1 of the visual metrics; fail-closed when absent).
	HowToReadLine string `json:"howToReadLine"`
	// MinVisuals is the least number of visuals a part must contain when the
	// plan marks its visuals planned (fail-closed when absent).
	MinVisuals int `json:"minVisuals"`
	// VisualElements are inline HTML elements that Obsidian renders as a
	// visual (for example svg); they count outside code blocks, closed and
	// with at least one child element.
	VisualElements []string `json:"visualElements"`
	// DemoElements are inline HTML elements the kit renders as interactive
	// components (lk-widget, lk-walkthrough); they count like visuals,
	// outside code blocks, closed and with at least one child element.
	DemoElements []string `json:"demoElements"`
	// MinDemos is the least number of interactive components a part must
	// contain when the plan marks its demos planned (fail-closed when
	// absent).
	MinDemos int `json:"minDemos"`
}

// ConceptMode reports whether these rules run concept diagnosis.
func (t Thresholds) ConceptMode() bool { return t.Concepts != nil && t.Concepts.Required }

// Rules is the parsed, validated source of truth.
type Rules struct {
	Version    int                    `json:"version"`
	Name       string                 `json:"name"`
	StageOrder []string               `json:"stageOrder"`
	PartStages []string               `json:"partStages"`
	Thresholds Thresholds             `json:"thresholds"`
	Checks     map[string][]CheckDecl `json:"checks"`
	Conditions []Condition            `json:"conditions"`
	Rubrics    []Rubric               `json:"rubrics"`
	Hash       string                 `json:"-"`
	// Raw is the exact file content Hash was computed from.
	Raw []byte `json:"-"`
}

// Load reads, strictly parses and validates the rules file.
func Load(path string) (*Rules, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("rules file unavailable: %w", err)
	}
	sum := sha256.Sum256(raw)
	var r Rules
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&r); err != nil {
		return nil, fmt.Errorf("rules file malformed: %w", err)
	}
	if err := r.validate(); err != nil {
		return nil, err
	}
	r.Hash = "sha256:" + hex.EncodeToString(sum[:])
	r.Raw = raw
	return &r, nil
}

func (r *Rules) validate() error {
	if r.Version != 1 {
		return fmt.Errorf("unsupported rules version %d (want 1)", r.Version)
	}
	wantOrder, wantParts := canonicalOrder, canonicalPartStages
	if r.Thresholds.StrictFlow {
		wantOrder, wantParts = strictOrder, strictPartStages
	}
	if !slices.Equal(r.StageOrder, wantOrder) {
		return fmt.Errorf("stageOrder must be exactly %v", wantOrder)
	}
	if !slices.Equal(r.PartStages, wantParts) {
		return fmt.Errorf("partStages must be exactly %v", wantParts)
	}
	if err := r.validateThresholds(); err != nil {
		return err
	}
	for _, stage := range r.StageOrder {
		decls, ok := r.Checks[stage]
		if !ok || len(decls) == 0 {
			return fmt.Errorf("stage %q declares no checks", stage)
		}
		seen := map[string]bool{}
		for _, d := range decls {
			if d.ID == "" {
				return fmt.Errorf("stage %q has a check without id", stage)
			}
			if seen[d.ID] {
				return fmt.Errorf("stage %q repeats check id %q", stage, d.ID)
			}
			seen[d.ID] = true
			if err := validateDecl(d); err != nil {
				return fmt.Errorf("stage %q check %q: %w", stage, d.ID, err)
			}
		}
	}
	for stage := range r.Checks {
		if !slices.Contains(r.StageOrder, stage) {
			return fmt.Errorf("checks declared for unknown stage %q", stage)
		}
	}
	for _, c := range r.Conditions {
		if err := r.validateCondition(c); err != nil {
			return err
		}
	}
	if err := r.validateRubrics(); err != nil {
		return err
	}
	if err := r.validatePareto(); err != nil {
		return err
	}
	if err := r.validateDemo(); err != nil {
		return err
	}
	return nil
}

// validatePareto keeps the pareto scope fail-closed: the checks and the rubric
// that enforce it are rejected unless the rules also bound it.
func (r *Rules) validatePareto() error {
	usesPareto := r.Thresholds.Pareto != nil
	for stage, decls := range r.Checks {
		for _, d := range decls {
			if d.Kind == "pareto_plan" || d.Kind == "pareto_part" {
				if !usesPareto {
					return fmt.Errorf("stage %q check %q needs the pareto thresholds", stage, d.ID)
				}
			}
		}
	}
	for _, rb := range r.Rubrics {
		if rb.When == "pareto" && !usesPareto {
			return fmt.Errorf("rubric %q needs the pareto thresholds", rb.ID)
		}
	}
	return nil
}

// ParetoMode reports whether these rules bound a pareto scope.
func (t Thresholds) ParetoMode() bool { return t.Pareto != nil }

// validateDemo keeps the interactive-demos parameter fail-closed: the check
// that enforces it is rejected unless the rules also declare its vocabulary.
func (r *Rules) validateDemo() error {
	usesDemos := len(r.Thresholds.DemoElements) > 0
	for stage, decls := range r.Checks {
		for _, d := range decls {
			if d.Kind == "demo_part" && !usesDemos {
				return fmt.Errorf("stage %q check %q needs the demo thresholds", stage, d.ID)
			}
		}
	}
	return nil
}

func (r *Rules) validateCondition(c Condition) error {
	if c.ID == "" {
		return fmt.Errorf("condition without id")
	}
	if !slices.Contains(r.StageOrder, c.OnStage) {
		return fmt.Errorf("condition %q references unknown stage %q", c.ID, c.OnStage)
	}
	if c.OnStage == "feedback" && c.Field == "" {
		return fmt.Errorf("condition %q on feedback must declare its field", c.ID)
	}
	if c.Field != "" && c.Field != "difficultyDetected" {
		return fmt.Errorf("condition %q uses unsupported field %q", c.ID, c.Field)
	}
	if !knownRequireKinds[c.Require.Kind] {
		return fmt.Errorf("condition %q uses unknown require kind %q", c.ID, c.Require.Kind)
	}
	if len(c.Require.Paths) == 0 {
		return fmt.Errorf("condition %q declares no require paths", c.ID)
	}
	for _, p := range c.Require.Paths {
		if err := validateRelPath(p, false); err != nil {
			return fmt.Errorf("condition %q require path: %w", c.ID, err)
		}
	}
	return nil
}

func (r *Rules) validateRubrics() error {
	seen := map[string]bool{}
	for _, rb := range r.Rubrics {
		if rb.ID == "" || seen[rb.ID] {
			return fmt.Errorf("rubric ids must be present and unique (got %q)", rb.ID)
		}
		seen[rb.ID] = true
		if !slices.Contains(r.StageOrder, rb.Stage) {
			return fmt.Errorf("rubric %q references unknown stage %q", rb.ID, rb.Stage)
		}
		if rb.Kind != "" && !slices.Contains(RubricKinds, rb.Kind) {
			return fmt.Errorf("rubric %q has unknown kind %q", rb.ID, rb.Kind)
		}
		if !KnownWhen[rb.When] {
			return fmt.Errorf("rubric %q uses unknown when %q", rb.ID, rb.When)
		}
		if strings.TrimSpace(rb.Instruction) == "" {
			return fmt.Errorf("rubric %q has an empty instruction", rb.ID)
		}
		for _, src := range rb.Context {
			if !KnownContexts[src] {
				return fmt.Errorf("rubric %q uses unknown context source %q", rb.ID, src)
			}
		}
		if err := validateRelPath(rb.Artifact, true); err != nil {
			return fmt.Errorf("rubric %q artifact: %w", rb.ID, err)
		}
		perPart := slices.Contains(r.PartStages, rb.Stage)
		if perPart && !hasPlaceholder(rb.Artifact) {
			return fmt.Errorf("rubric %q artifact %q needs a part placeholder ({part}/{index}/{slug})", rb.ID, rb.Artifact)
		}
		if !perPart && hasPlaceholder(rb.Artifact) {
			return fmt.Errorf("rubric %q on global stage %q must not use part placeholders", rb.ID, rb.Stage)
		}
	}
	return nil
}

func (r *Rules) validateThresholds() error {
	d := r.Thresholds.Diagnostic
	switch d.Mode {
	case "adaptive":
		if d.RoundSize < 1 || d.MaxRounds < 1 {
			return fmt.Errorf("adaptive diagnostic roundSize and maxRounds must be positive")
		}
		if d.PrerequisiteCount != 0 || d.TopicCount != 0 || len(d.TopicLevelCounts) != 0 {
			return fmt.Errorf("adaptive diagnostic does not take fixed counts")
		}
	case "":
		if d.PrerequisiteCount < 1 || d.TopicCount < 1 {
			return fmt.Errorf("diagnostic counts must be positive")
		}
		if len(d.TopicLevelCounts) == 0 {
			return fmt.Errorf("topicLevelCounts must not be empty")
		}
		for level, count := range d.TopicLevelCounts {
			if count < 1 || level == "" {
				return fmt.Errorf("topicLevelCounts entries must be positive")
			}
		}
	default:
		return fmt.Errorf("unknown diagnostic mode %q", d.Mode)
	}
	q := r.Thresholds.Quiz
	if q.QuestionCount < 1 {
		return fmt.Errorf("quiz questionCount must be positive")
	}
	if q.MinPassingScore < 1 || q.MinPassingScore > q.QuestionCount {
		return fmt.Errorf("quiz minPassingScore must be within 1..%d", q.QuestionCount)
	}
	if q.MaxReteachRounds < 0 {
		return fmt.Errorf("quiz maxReteachRounds must not be negative")
	}
	if c := r.Thresholds.Concepts; c != nil {
		if err := c.validate(); err != nil {
			return err
		}
		if c.Required && d.Mode != "adaptive" {
			return fmt.Errorf("concept diagnosis needs the round-based (adaptive) diagnostic mode")
		}
	}
	if p := r.Thresholds.Pareto; p != nil {
		if p.MaxParts < 1 {
			return fmt.Errorf("pareto maxParts must be positive")
		}
		if p.MinCriterioLen < 1 {
			return fmt.Errorf("pareto minCriterioChars must be positive")
		}
		if strings.TrimSpace(p.Heading) == "" {
			return fmt.Errorf("pareto heading must not be empty")
		}
		if p.MaxWords < 1 {
			return fmt.Errorf("pareto maxWords must be positive")
		}
	}
	o := r.Thresholds.Options
	if len(o.Keys) < 2 || len(o.AnswerKeys) < 1 {
		return fmt.Errorf("option keys and answerKeys must be declared")
	}
	if !slices.Contains(o.Keys, o.NoSayKey) {
		return fmt.Errorf("noSayKey %q is not among keys", o.NoSayKey)
	}
	for _, k := range o.AnswerKeys {
		if !slices.Contains(o.Keys, k) {
			return fmt.Errorf("answerKey %q is not among keys", k)
		}
	}
	t := r.Thresholds
	if len(t.Niveles) < 1 || len(t.NivelByLevel) < 1 || len(t.PiezaTipos) < 1 {
		return fmt.Errorf("niveles, nivelByLevel and piezaTipos must be declared")
	}
	for _, n := range t.Niveles {
		if strings.TrimSpace(n) == "" {
			return fmt.Errorf("niveles entries must not be empty")
		}
	}
	if strings.TrimSpace(t.MisPalabrasHdr) == "" || strings.TrimSpace(t.PlanVisualHead) == "" {
		return fmt.Errorf("misPalabrasHeader and planVisualHeading must not be empty")
	}
	if len(t.PlanSections) < 1 {
		return fmt.Errorf("planSections must not be empty")
	}
	for _, b := range t.VisualBlocks {
		if strings.TrimSpace(b) == "" || strings.ContainsAny(b, " `") {
			return fmt.Errorf("visualBlocks entries must be single code-block language names, got %q", b)
		}
	}
	for _, e := range t.VisualElements {
		if e == "" || strings.Trim(e, "abcdefghijklmnopqrstuvwxyz0123456789-") != "" {
			return fmt.Errorf("visualElements entries must be lowercase HTML element names, got %q", e)
		}
	}
	for _, e := range t.DemoElements {
		if e == "" || strings.Trim(e, "abcdefghijklmnopqrstuvwxyz0123456789-") != "" {
			return fmt.Errorf("demoElements entries must be lowercase HTML element names, got %q", e)
		}
	}
	// The visual, guide and demo thresholds arrived after the first topics were
	// enrolled, and a frozen rules snapshot can never gain keys. Absent values
	// therefore mean "this is not checked" instead of failing the whole file, so an
	// old snapshot keeps its original behaviour while a rules file that declares
	// the thresholds is held to them. Half-declared pairs still fail closed.
	if t.MinDemos < 0 {
		return fmt.Errorf("minDemos must not be negative")
	}
	if t.MinDemos > 0 && len(t.DemoElements) == 0 {
		return fmt.Errorf("minDemos needs demoElements to count")
	}
	if t.MinVisuals < 0 {
		return fmt.Errorf("minVisuals must not be negative")
	}
	if t.MinVisuals > 0 && strings.TrimSpace(t.HowToReadLine) == "" {
		return fmt.Errorf("minVisuals needs howToReadLine: every counted visual carries its reading guide")
	}
	return nil
}

func (c ConceptThresholds) validate() error {
	if c.MinPerQuestion < 1 || c.MaxPerQuestion < c.MinPerQuestion {
		return fmt.Errorf("concepts minPerQuestion/maxPerQuestion must satisfy 1 <= min <= max")
	}
	if c.MinQuestions < 1 || c.MaxQuestions < c.MinQuestions {
		return fmt.Errorf("concepts minQuestions/maxQuestions must satisfy 1 <= min <= max")
	}
	if c.DiagnosisMaxQuestions < 1 {
		return fmt.Errorf("concepts diagnosisMaxQuestions must be positive")
	}
	if c.MinPassingRatio.Num < 1 || c.MinPassingRatio.Den < c.MinPassingRatio.Num {
		return fmt.Errorf("concepts minPassingRatio must be a fraction in (0, 1]")
	}
	if len(c.States) < 2 {
		return fmt.Errorf("concepts states must declare at least two states")
	}
	seen := map[string]bool{}
	for _, s := range c.States {
		if strings.TrimSpace(s) == "" || seen[s] {
			return fmt.Errorf("concepts states must be unique and non-empty")
		}
		seen[s] = true
	}
	if !seen[c.GapState] {
		return fmt.Errorf("concepts gapState %q is not among states", c.GapState)
	}
	return nil
}

func validateDecl(d CheckDecl) error {
	if !KnownCheckKinds[d.Kind] {
		return fmt.Errorf("unknown check kind %q", d.Kind)
	}
	need := func(fields ...string) error {
		for _, f := range fields {
			if valueOf(d, f) == "" {
				return fmt.Errorf("kind %q requires %s", d.Kind, f)
			}
		}
		return nil
	}
	var err error
	switch d.Kind {
	case "file_exists", "plan_valid", "part_file", "explanation_content",
		"changed_after_failed_quiz", "quiz_questions", "feedback_valid",
		"planificador_sections", "index_note", "mis_palabras_structure",
		"mis_palabras_area", "exercises_note", "mermaid_graph",
		"pareto_plan", "pareto_part", "demo_part":
		err = need("path")
	case "diagnostic_questions":
		err = need("path", "note")
	case "diagnostic_answers", "final_quiz_note":
		err = need("questions", "answers", "note")
	case "planning_link":
		err = need("path", "questions", "answers", "note")
	case "quiz_answers":
		err = need("questions", "answers")
	case "concept_verdicts":
		err = need("path", "questions", "answers")
	case "feedback_evidence":
		err = need("path")
	case "quiz_passed", "part_has_mini_quiz", "feedback_condition", "all_current":
		// state-only checks
	default:
		return fmt.Errorf("unknown check kind %q", d.Kind)
	}
	if err != nil {
		return err
	}
	if d.Verdicts != "" && d.Kind != "planning_link" {
		return fmt.Errorf("kind %q does not take verdicts", d.Kind)
	}
	// A concept_verdicts check judges either the diagnosis or one part.
	partScoped := partPathKinds[d.Kind] || d.Kind == "concept_verdicts"
	for _, f := range []string{d.Path, d.Questions, d.Answers, d.Note, d.Verdicts} {
		if f == "" {
			continue
		}
		if err := validateRelPath(f, partScoped && (f == d.Path || f == d.Questions || f == d.Answers)); err != nil {
			return err
		}
	}
	if partPathKinds[d.Kind] && !hasPlaceholder(d.Path) && d.Path != "" {
		return fmt.Errorf("kind %q needs a part placeholder in %q", d.Kind, d.Path)
	}
	if partPathKinds[d.Kind] && d.Kind == "quiz_answers" && !hasPlaceholder(d.Questions) {
		return fmt.Errorf("kind %q needs a part placeholder in %q", d.Kind, d.Questions)
	}
	return nil
}

func valueOf(d CheckDecl, field string) string {
	switch field {
	case "path":
		return d.Path
	case "questions":
		return d.Questions
	case "answers":
		return d.Answers
	case "note":
		return d.Note
	}
	return ""
}

func hasPlaceholder(p string) bool {
	return strings.Contains(p, "{part}") || strings.Contains(p, "{index}") || strings.Contains(p, "{slug}")
}

// validateRelPath enforces workspace confinement of declared artifact paths:
// relative, clean, no traversal.
func validateRelPath(p string, allowPart bool) error {
	if p == "" {
		return fmt.Errorf("empty path")
	}
	if filepath.IsAbs(p) {
		return fmt.Errorf("path %q must be relative", p)
	}
	if strings.Contains(p, "..") {
		return fmt.Errorf("path %q must not contain traversal", p)
	}
	if filepath.Clean(p) != p || p == "." {
		return fmt.Errorf("path %q must be clean", p)
	}
	if !allowPart && hasPlaceholder(p) {
		return fmt.Errorf("path %q must not include part placeholders", p)
	}
	return nil
}

// IsPartStage reports whether the stage repeats per planned topic part.
func (r *Rules) IsPartStage(stage string) bool {
	return slices.Contains(r.PartStages, stage)
}

// ChecksFor returns the deterministic check declarations for a stage.
func (r *Rules) ChecksFor(stage string) []CheckDecl { return r.Checks[stage] }

// RubricsFor returns the semantic rubrics declared for a stage.
func (r *Rules) RubricsFor(stage string) []Rubric {
	var out []Rubric
	for _, rb := range r.Rubrics {
		if rb.Stage == stage {
			out = append(out, rb)
		}
	}
	return out
}

// FeedbackCondition returns the condition triggered by the feedback stage.
func (r *Rules) FeedbackCondition() *Condition {
	for i := range r.Conditions {
		if r.Conditions[i].OnStage == "feedback" {
			return &r.Conditions[i]
		}
	}
	return nil
}
