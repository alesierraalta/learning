package engine

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"learning/internal/rules"
)

// --- workspace paths -------------------------------------------------------

func absPath(ws, rel string) string { return filepath.Join(ws, filepath.FromSlash(rel)) }

// substPart replaces every part placeholder ({part}, {index}, {slug}) so the
// human-facing contract filename (explicaciones/Parte N - <slug>.md) is a
// deterministic mapping from the plan, not a parallel tree.
func substPart(rel, part string) string { return strings.ReplaceAll(rel, "{part}", part) }

// partRel resolves a part-scoped template against the current plan.
func partRel(plan *planDoc, template, part string) (string, error) {
	if plan == nil {
		return "", fmt.Errorf("plan unavailable for part path")
	}
	idx := -1
	for i, p := range plan.Parts {
		if p.ID == part {
			idx = i
			break
		}
	}
	if idx < 0 {
		return "", fmt.Errorf("part %q is not declared in the plan", part)
	}
	out := strings.ReplaceAll(template, "{part}", part)
	out = strings.ReplaceAll(out, "{index}", itoa(idx+1))
	out = strings.ReplaceAll(out, "{slug}", plan.Parts[idx].Slug)
	return out, nil
}

// --- plan.json (structured plan sidecar) -----------------------------------

type planDoc struct {
	Topic            string         `json:"topic"`
	Parts            []planPartDoc  `json:"parts"`
	DiagnosisSummary string         `json:"diagnosisSummary"`
	FocusAreas       []string       `json:"focusAreas"`
	Pareto           *planParetoDoc `json:"pareto,omitempty"`
	Exam             *planExamDoc   `json:"examen,omitempty"`
	// Cobertura and Material are the course-derived provenance (#408): how much
	// of the material the route covers and the sources it was derived from, as
	// the plan brief enumerated them. A plan with no course material declares
	// neither and is verified exactly as before.
	Cobertura string            `json:"cobertura,omitempty"`
	Material  []planMaterialDoc `json:"material,omitempty"`
}

// planMaterialDoc is one source of the course the route was derived from.
type planMaterialDoc struct {
	Nombre string `json:"nombre"`
	Tipo   string `json:"tipo"`
}

type planExamDoc struct {
	Formato    string                  `json:"formato"`
	Practica   *string                 `json:"practica,omitempty"`
	Fuente     string                  `json:"fuente,omitempty"`
	Estructura []planExamStructureItem `json:"estructura,omitempty"`
}

type planExamStructureItem struct {
	Tipo     string `json:"tipo"`
	Cantidad int    `json:"cantidad"`
}

// planParetoDoc is the declared trim of a pareto-scope run: the criterion that
// chose the vital slice and the content deliberately left out.
type planParetoDoc struct {
	Criterio   string   `json:"criterio"`
	Descartado []string `json:"descartado"`
}

type planPartDoc struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	Slug            string `json:"slug"`
	Subtema         string `json:"subtema"`
	ExamplesPlanned *bool  `json:"examplesPlanned"`
	VisualsPlanned  *bool  `json:"visualsPlanned"`
	// Pareto is the part's declared contribution to the 80% result.
	Pareto string `json:"pareto,omitempty"`
	// Exam is what this part contributes toward the declared exam format.
	Exam string `json:"examen,omitempty"`
	// DemosPlanned marks the part as owing a hands-on demo.
	DemosPlanned *bool `json:"demosPlanned,omitempty"`
	// Remedia names the part a remedial part remedies (strict flow), and
	// Analisis why the learner failed it and what they did understand.
	Remedia  string `json:"remedia,omitempty"`
	Analisis string `json:"analisis,omitempty"`
	// Fuentes are the material sources this part cites, each with the location
	// inside the source (course-derived routes, #408).
	Fuentes []planFuenteDoc `json:"fuentes,omitempty"`
}

// planFuenteDoc is one cited source: the material entry's nombre plus where in
// it the part came from.
type planFuenteDoc struct {
	Nombre    string `json:"nombre"`
	Ubicacion string `json:"ubicacion"`
}

func loadPlan(ws, rel string) (planDoc, error) {
	var doc planDoc
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return doc, err
	}
	return doc, nil
}

func readJSON(path string, v any) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("missing artifact %s", filepath.Base(path))
		}
		return fmt.Errorf("unreadable artifact %s: %w", filepath.Base(path), err)
	}
	if err := json.Unmarshal(raw, v); err != nil {
		return fmt.Errorf("%s is not valid JSON: %w", filepath.Base(path), err)
	}
	return nil
}

func safeID(id string) bool {
	if id == "" || id == "." || id == ".." {
		return false
	}
	return !strings.ContainsAny(id, `/\`+"\x00")
}

func validatePlanStructure(doc planDoc) error {
	if strings.TrimSpace(doc.Topic) == "" {
		return fmt.Errorf("plan topic is empty")
	}
	if len(doc.Parts) == 0 {
		return fmt.Errorf("plan declares no parts")
	}
	seen := map[string]bool{}
	for i, p := range doc.Parts {
		if !safeID(p.ID) {
			return fmt.Errorf("part #%d has an unsafe id %q", i+1, p.ID)
		}
		if seen[p.ID] {
			return fmt.Errorf("part id %q is repeated", p.ID)
		}
		seen[p.ID] = true
		if strings.TrimSpace(p.Title) == "" {
			return fmt.Errorf("part %q has an empty title", p.ID)
		}
		if !safeID(p.Slug) {
			return fmt.Errorf("part %q has an unsafe slug %q", p.ID, p.Slug)
		}
		if strings.TrimSpace(p.Subtema) == "" {
			return fmt.Errorf("part %q misses its subtema join key", p.ID)
		}
		if p.ExamplesPlanned == nil {
			return fmt.Errorf("part %q misses examplesPlanned", p.ID)
		}
		if p.VisualsPlanned == nil {
			return fmt.Errorf("part %q misses visualsPlanned", p.ID)
		}
	}
	return nil
}

func planPartByID(doc planDoc, id string) *planPartDoc {
	for i := range doc.Parts {
		if doc.Parts[i].ID == id {
			return &doc.Parts[i]
		}
	}
	return nil
}

func planSubtemas(doc planDoc) map[string]bool {
	out := map[string]bool{}
	for _, p := range doc.Parts {
		out[p.Subtema] = true
	}
	return out
}

// --- question schemas ------------------------------------------------------

type pieza struct {
	Tipo      string `json:"tipo"`
	Lenguaje  string `json:"lenguaje,omitempty"`
	Contenido string `json:"contenido"`
}

type diagQuestion struct {
	ID string `json:"id"`
	// Open is the versioned developed-answer contract; nil keeps the legacy item.
	Open *openItem `json:"open,omitempty"`
	// Round and Follows place a question in the adaptive diagnosis: the round
	// it belongs to and the earlier question whose answer it follows up.
	Round     int               `json:"round,omitempty"`
	Follows   string            `json:"follows,omitempty"`
	Type      string            `json:"type"`
	Level     int               `json:"level"`
	Subtema   string            `json:"subtema"`
	Nivel     string            `json:"nivel"`
	Enunciado string            `json:"enunciado"`
	Pieza     pieza             `json:"pieza"`
	Options   map[string]string `json:"options"`
	Answer    string            `json:"answer"`
	Conceptos []string          `json:"conceptos,omitempty"`
}

type quizQuestion struct {
	ID        string            `json:"id"`
	Open      *openItem         `json:"open,omitempty"`
	Central   bool              `json:"central"`
	Subtema   string            `json:"subtema"`
	Nivel     string            `json:"nivel"`
	Enunciado string            `json:"enunciado"`
	Options   map[string]string `json:"options"`
	Answer    string            `json:"answer"`
	Conceptos []string          `json:"conceptos,omitempty"`
}

type finalQuestion struct {
	ID         string    `json:"id"`
	Subtema    string    `json:"subtema"`
	Nivel      string    `json:"nivel"`
	Formato    string    `json:"formato"`
	Enunciado  string    `json:"enunciado"`
	Respuesta  string    `json:"respuesta"`
	Tipo       string    `json:"tipo"`
	Entregable string    `json:"entregable"`
	Open       *openItem `json:"open,omitempty"`
}

// Open-response items carry the grading rubric privately: the learner's note
// binds only the enunciado, never the hidden criteria below.
type openItem struct {
	Version    int             `json:"version"`
	Kind       string          `json:"kind"`
	Operation  string          `json:"operation"`
	Depth      string          `json:"depth"`
	Centrality string          `json:"centrality"`
	Concepts   []string        `json:"concepts"`
	Criteria   []openCriterion `json:"criteria"`
}

type openCriterion struct {
	ID     string `json:"id"`
	Rubric string `json:"rubric"`
}

// openAnswer is the learner's developed response. Confidence sits next to the
// answer; a no-evidence answer needs no invented text.
type openAnswer struct {
	Kind        string `json:"kind"`
	Text        string `json:"text,omitempty"`
	Code        string `json:"code,omitempty"`
	Explanation string `json:"explanation,omitempty"`
	Submission  string `json:"submission,omitempty"`
	Confidence  string `json:"confidence,omitempty"`
	NoEvidence  bool   `json:"noEvidence,omitempty"`
}

type openExplanationVerdict struct {
	Verdict  string `json:"verdict"`
	Evidence string `json:"evidence"`
}

type openCriterionResult struct {
	ID       string `json:"id"`
	Met      bool   `json:"met"`
	Evidence string `json:"evidence"`
}

type openVerdict struct {
	Verdict     string                         `json:"verdict"`
	Evidence    string                         `json:"evidence"`
	Criteria    map[string]openCriterionResult `json:"criteria"`
	Concepts    map[string]string              `json:"concepts,omitempty"`
	Explanation *openExplanationVerdict        `json:"explanation,omitempty"`
}

// openVerdictDoc is written by the tutor: the engine checks its schema and
// evidence, never substitutes its own judgment for the recorded verdict.
type openVerdictDoc struct {
	Version  int                    `json:"version"`
	Verdicts map[string]openVerdict `json:"verdicts"`
}

func loadDiagQuestions(ws, rel string) ([]diagQuestion, error) {
	var doc struct {
		Questions []diagQuestion `json:"questions"`
	}
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return nil, err
	}
	return doc.Questions, nil
}

func loadQuizQuestions(ws, rel string) ([]quizQuestion, error) {
	var doc struct {
		Questions []quizQuestion `json:"questions"`
	}
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return nil, err
	}
	return doc.Questions, nil
}

func loadFinalQuestions(ws, rel string) ([]finalQuestion, error) {
	var doc struct {
		Questions []finalQuestion `json:"questions"`
	}
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return nil, err
	}
	return doc.Questions, nil
}

func loadOpenAnswers(ws, rel string) (map[string]openAnswer, error) {
	var doc struct {
		OpenAnswers map[string]openAnswer `json:"openAnswers"`
	}
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return nil, err
	}
	return doc.OpenAnswers, nil
}

// loadLegacyOrOpenAnswers lets existing concept helpers read either answer
// shape without double-grading: an open answer is present, never a letter key.
func loadLegacyOrOpenAnswers(ws, rel string) (map[string]string, error) {
	if answerFileMissing(ws, rel) {
		return map[string]string{}, nil
	}
	answers, err := loadAnswers(ws, rel)
	if err == nil {
		return answers, nil
	}
	openAnswers, openErr := loadOpenAnswers(ws, rel)
	if openErr != nil || len(openAnswers) == 0 {
		return nil, err
	}
	out := map[string]string{}
	for id := range openAnswers {
		out[id] = "recorded"
	}
	return out, nil
}

// openVerdictRel is the tutor artifact paired with an answers file. It is
// derived, never declared as a receipt path, so a legacy run with no open
// items need not write a verdict file the engine would then demand.
func openVerdictRel(answersRel string) string {
	if strings.HasSuffix(answersRel, ".answers.json") {
		return strings.TrimSuffix(answersRel, ".answers.json") + ".verdicts.json"
	}
	return answersRel + ".verdicts.json"
}

func loadOpenVerdicts(ws, rel string) (openVerdictDoc, bool, error) {
	if answerFileMissing(ws, rel) {
		return openVerdictDoc{}, false, nil
	}
	var doc openVerdictDoc
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return doc, false, err
	}
	return doc, true, nil
}

func loadAnswers(ws, rel string) (map[string]string, error) {
	var doc struct {
		Answers map[string]string `json:"answers"`
	}
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return nil, err
	}
	if doc.Answers == nil {
		return nil, fmt.Errorf("%s has no answers object", filepath.Base(rel))
	}
	return doc.Answers, nil
}

// quizFingerprint is the canonical form the studio hashes for #416: each question's id, statement,
// the keyed letter and every option by letter, sorted by id. It must produce exactly the same
// sha256 as `quizFingerprint` in integrations/pi/bridge.ts; `pieza` and `round` are out of the hash
// on both sides because neither changes what a learner answers, and the engine has no such fields.
// The shared golden value in the tests is what keeps the two implementations honest.
func quizFingerprint(qs []quizQuestion) string {
	ordered := make([][]any, 0, len(qs))
	for _, q := range qs {
		letters := make([]string, 0, len(q.Options))
		for letter := range q.Options {
			letters = append(letters, letter)
		}
		sort.Strings(letters)
		options := make([][]string, 0, len(letters))
		for _, letter := range letters {
			options = append(options, []string{letter, q.Options[letter]})
		}
		ordered = append(ordered, []any{q.ID, q.Enunciado, q.Answer, options})
	}
	sort.SliceStable(ordered, func(i, j int) bool { return ordered[i][0].(string) < ordered[j][0].(string) })
	buf := &bytes.Buffer{}
	encoder := json.NewEncoder(buf)
	// JavaScript's JSON.stringify does not escape <, > or &, and Go's encoder does by default.
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(ordered)
	sum := sha256.Sum256([]byte(strings.TrimSuffix(buf.String(), "\n")))
	return "sha256:" + hex.EncodeToString(sum[:])
}

// loadAnswersQuiz is the fingerprint an answers file names, or "" when it names none: a file written
// before #416, which answers a quiz the engine cannot identify and must therefore not grade.
func loadAnswersQuiz(ws, rel string) string {
	var doc struct {
		Quiz string `json:"quiz"`
	}
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return ""
	}
	return doc.Quiz
}

func answerFileMissing(ws, rel string) bool {
	_, err := os.Stat(absPath(ws, rel))
	return os.IsNotExist(err)
}

// validateOptions enforces A-D plus E "No sé" structure objectively.
func validateOptions(opts map[string]string, th rules.OptionThresholds) error {
	if len(opts) != len(th.Keys) {
		return fmt.Errorf("question offers %d options, want %d", len(opts), len(th.Keys))
	}
	for _, key := range th.Keys {
		if _, ok := opts[key]; !ok {
			return fmt.Errorf("question misses option %q", key)
		}
	}
	if got := opts[th.NoSayKey]; got != th.NoSayText {
		return fmt.Errorf("option %s must be exactly %q, got %q", th.NoSayKey, th.NoSayText, got)
	}
	return nil
}

func validateAnswerKey(answer string, th rules.OptionThresholds) error {
	for _, k := range th.AnswerKeys {
		if answer == k {
			return nil
		}
	}
	return fmt.Errorf("answer key %q is not among %v", answer, th.AnswerKeys)
}

// The shortest round the answer-key distribution rule measures, and the shortest
// round where a majority of one letter is refused. Below them a round is too
// small to tell a fixed key from a coincidence.
const (
	varyKeysMinRound    = 3
	varyKeysMajorityMin = 4
)

// varyAnswerKeys refuses a round whose correct option always sits in the same
// place: a learner who always marks A would pass it without reading. The rule
// is declared by the rules file (options.varyAnswerKeys); a snapshot without it
// keeps accepting the keys it accepted. The refusal names the letter, the count
// and what to do, because the tutor reads it as a finding at the end of a turn.
func varyAnswerKeys(keys []string, th rules.Thresholds) error {
	if len(keys) < varyKeysMinRound || !(th.Options.VaryAnswerKeys || th.Options.PositionalKeys) {
		return nil
	}
	// The positional pattern (#265): question 1 A, question 2 B, question 3 C, cycling through the letters. A
	// learner who learns the order passes without reading, so the round is refused like one fixed letter.
	if th.Options.PositionalKeys && followsPosition(keys, th.Options.AnswerKeys) {
		return fmt.Errorf("answer keys follow a fixed positional pattern: %s; vary the position of the correct option (A, B, C, D): a learner who learns the order passes without reading", positionOf(keys))
	}
	if !th.Options.VaryAnswerKeys {
		return nil
	}
	counts := map[string]int{}
	letter, top := "", 0
	for _, key := range keys {
		counts[key]++
		if counts[key] > top {
			letter, top = key, counts[key]
		}
	}
	share := fmt.Sprintf("%d of %d questions put the correct option in %s", top, len(keys), letter)
	vary := "vary the position of the correct option (A, B, C, D): a learner who always marks the same letter must not pass without reading"
	switch {
	case top == len(keys):
		return fmt.Errorf("answer keys do not vary: all %d questions put the correct option in %s; %s", len(keys), letter, vary)
	case len(keys) >= varyKeysMajorityMin && top*2 > len(keys):
		return fmt.Errorf("answer keys do not vary: %s, more than half; %s", share, vary)
	}
	return nil
}

// followsPosition reports whether the correct option of every question sits at the letter of its position,
// cycling through the option letters (#265).
func followsPosition(keys, letters []string) bool {
	if len(letters) == 0 {
		return false
	}
	for i, key := range keys {
		if key != letters[i%len(letters)] {
			return false
		}
	}
	return true
}

// positionOf names the first three answers of a round, as the refusal shows them: «question 1 A, question 2 B, …».
func positionOf(keys []string) string {
	parts := make([]string, 0, 3)
	for i := 0; i < len(keys) && i < 3; i++ {
		parts = append(parts, fmt.Sprintf("question %d %s", i+1, keys[i]))
	}
	return strings.Join(parts, ", ")
}

// varyDiagnosticKeys applies the answer-key distribution rule round by round: a
// diagnosis asks in rounds, and one round with a fixed key is what a learner
// learns to game. A fixed-format diagnosis carries no round, so its whole set is
// measured as one.
func varyDiagnosticKeys(qs []diagQuestion, th rules.Thresholds) error {
	if !th.Options.VaryAnswerKeys && !th.Options.PositionalKeys {
		return nil
	}
	var order []int
	rounds := map[int][]string{}
	for _, q := range qs {
		if _, ok := rounds[q.Round]; !ok {
			order = append(order, q.Round)
		}
		rounds[q.Round] = append(rounds[q.Round], q.Answer)
	}
	for _, round := range order {
		if err := varyAnswerKeys(rounds[round], th); err != nil {
			if round == 0 {
				return err
			}
			return fmt.Errorf("round %d: %w", round, err)
		}
	}
	return nil
}

func validateNivel(nivel string, th rules.Thresholds) error {
	for _, n := range th.Niveles {
		if nivel == n {
			return nil
		}
	}
	return fmt.Errorf("nivel %q is not among %v", nivel, th.Niveles)
}

// validateDiagnostic enforces 6 prerequisite + 6 topic questions with the
// declared level distribution, stable join keys, real enunciados and a
// declared working piece per question.
// diagSkipped reports an explicitly skipped adaptive diagnosis: the learner
// said they know nothing of the topic, so no question is asked.
func diagSkipped(ws, rel string, qs []diagQuestion, th rules.Thresholds) bool {
	if !th.Diagnostic.Adaptive() || len(qs) != 0 {
		return false
	}
	var doc struct {
		Skipped bool `json:"skipped"`
	}
	return readJSON(absPath(ws, rel), &doc) == nil && doc.Skipped
}

func validateDiagnostic(qs []diagQuestion, plan *planDoc, th rules.Thresholds) error {
	if th.Diagnostic.Adaptive() {
		if th.ConceptMode() {
			if err := validateGuidedDiagnostic(qs, plan, th); err != nil {
				return err
			}
		} else if err := validateAdaptiveDiagnostic(qs, plan, th); err != nil {
			return err
		}
		return varyDiagnosticKeys(qs, th)
	}
	var prereq, topic int
	levels := map[int]int{}
	seen := map[string]bool{}
	planSubs := map[string]bool{}
	if plan != nil {
		planSubs = planSubtemas(*plan)
	}
	var prereqNiveles []string
	for _, q := range qs {
		if !safeID(q.ID) {
			return fmt.Errorf("question has an unsafe id %q", q.ID)
		}
		if seen[q.ID] {
			return fmt.Errorf("question id %q is repeated", q.ID)
		}
		seen[q.ID] = true
		if strings.TrimSpace(q.Enunciado) == "" {
			return fmt.Errorf("question %s has an empty enunciado", q.ID)
		}
		if err := checkCodeInProse(q.ID, th, questionTexts(q.Enunciado, q.Options)...); err != nil {
			return err
		}
		if strings.TrimSpace(q.Subtema) == "" {
			return fmt.Errorf("question %s misses its subtema join key", q.ID)
		}
		if err := validateNivel(q.Nivel, th); err != nil {
			return fmt.Errorf("question %s: %w", q.ID, err)
		}
		if q.Pieza.Tipo == "" || !slicesContains(th.PiezaTipos, q.Pieza.Tipo) {
			return fmt.Errorf("question %s declares pieza tipo %q outside %v", q.ID, q.Pieza.Tipo, th.PiezaTipos)
		}
		if strings.TrimSpace(q.Pieza.Contenido) == "" {
			return fmt.Errorf("question %s has an empty pieza contenido", q.ID)
		}
		switch q.Type {
		case "prerequisite":
			prereq++
			prereqNiveles = append(prereqNiveles, q.Nivel)
			if !strings.HasPrefix(q.Subtema, "P0.") {
				return fmt.Errorf("prerequisite question %s must join on a P0.x subtema, got %q", q.ID, q.Subtema)
			}
		case "topic":
			topic++
			levels[q.Level]++
			if !planSubs[q.Subtema] {
				return fmt.Errorf("topic question %s references subtema %q that is not in the plan", q.ID, q.Subtema)
			}
			want, ok := th.NivelByLevel[itoa(q.Level)]
			if !ok {
				return fmt.Errorf("topic question %s has undeclared level %d", q.ID, q.Level)
			}
			if q.Nivel != want {
				return fmt.Errorf("topic question %s level %d must map to nivel %q, got %q", q.ID, q.Level, want, q.Nivel)
			}
		default:
			return fmt.Errorf("question %s has unknown type %q", q.ID, q.Type)
		}
	}
	if prereq != th.Diagnostic.PrerequisiteCount {
		return fmt.Errorf("expected %d prerequisite questions, got %d", th.Diagnostic.PrerequisiteCount, prereq)
	}
	if topic != th.Diagnostic.TopicCount {
		return fmt.Errorf("expected %d topic questions, got %d", th.Diagnostic.TopicCount, topic)
	}
	for _, q := range qs {
		if err := validateOptions(q.Options, th.Options); err != nil {
			return fmt.Errorf("question %s: %w", q.ID, err)
		}
		if err := validateAnswerKey(q.Answer, th.Options); err != nil {
			return fmt.Errorf("question %s: %w", q.ID, err)
		}
	}
	for level, want := range th.Diagnostic.TopicLevelCounts {
		var got int
		if l, err := atoi(level); err == nil {
			got = levels[l]
		}
		if got != want {
			return fmt.Errorf("topic level %s has %d questions, want %d", level, got, want)
		}
	}
	if err := nivelesNonDecreasing(prereqNiveles, th, "prerequisite block must run menor a mayor complejidad"); err != nil {
		return err
	}
	// Topic block: ordered easiest-first, without interleaving levels.
	var topicLevels []int
	for _, q := range qs {
		if q.Type == "topic" {
			topicLevels = append(topicLevels, q.Level)
		}
	}
	for i := 1; i < len(topicLevels); i++ {
		if topicLevels[i] < topicLevels[i-1] {
			return fmt.Errorf("topic block interleaves levels: %v", topicLevels)
		}
	}
	return varyDiagnosticKeys(qs, th)
}

func nivelesNonDecreasing(niveles []string, th rules.Thresholds, msg string) error {
	rank := map[string]int{}
	for i, n := range th.Niveles {
		rank[n] = i
	}
	for i := 1; i < len(niveles); i++ {
		if rank[niveles[i]] < rank[niveles[i-1]] {
			return fmt.Errorf("%s: %v", msg, niveles)
		}
	}
	return nil
}

func validateQuizQuestions(qs []quizQuestion, partSubtema string, planSubs map[string]bool, th rules.Thresholds) error {
	if th.ConceptMode() {
		c := th.Concepts
		if len(qs) < c.MinQuestions || len(qs) > c.MaxQuestions {
			return fmt.Errorf("expected between %d and %d quiz questions, got %d", c.MinQuestions, c.MaxQuestions, len(qs))
		}
	} else if len(qs) != th.Quiz.QuestionCount {
		return fmt.Errorf("expected %d quiz questions, got %d", th.Quiz.QuestionCount, len(qs))
	}
	seen := map[string]bool{}
	for _, q := range qs {
		if !safeID(q.ID) {
			return fmt.Errorf("question has an unsafe id %q", q.ID)
		}
		if seen[q.ID] {
			return fmt.Errorf("question id %q is repeated", q.ID)
		}
		seen[q.ID] = true
		if strings.TrimSpace(q.Enunciado) == "" {
			return fmt.Errorf("question %s has an empty enunciado", q.ID)
		}
		if err := checkCodeInProse(q.ID, th, questionTexts(q.Enunciado, q.Options)...); err != nil {
			return err
		}
		if q.Subtema != partSubtema {
			return fmt.Errorf("question %s subtema %q must inherit the part subtema %q", q.ID, q.Subtema, partSubtema)
		}
		if err := validateNivel(q.Nivel, th); err != nil {
			return fmt.Errorf("question %s: %w", q.ID, err)
		}
		if err := validateOptions(q.Options, th.Options); err != nil {
			return fmt.Errorf("question %s: %w", q.ID, err)
		}
		if err := validateAnswerKey(q.Answer, th.Options); err != nil {
			return fmt.Errorf("question %s: %w", q.ID, err)
		}
		if th.ConceptMode() {
			if err := validateConceptos(q.ID, q.Conceptos, planSubs, th.Concepts); err != nil {
				return err
			}
		}
	}
	keys := make([]string, 0, len(qs))
	for _, q := range qs {
		keys = append(keys, q.Answer)
	}
	return varyAnswerKeys(keys, th)
}

// checkCoverage verifies answers cover exactly the question set.
func checkCoverage(ids []string, answers map[string]string, th rules.OptionThresholds) error {
	known := map[string]bool{}
	for _, id := range ids {
		known[id] = true
	}
	var missing, unknown, invalid []string
	for _, id := range ids {
		ans, ok := answers[id]
		if !ok {
			missing = append(missing, id)
			continue
		}
		valid := false
		for _, k := range th.Keys {
			if ans == k {
				valid = true
				break
			}
		}
		if !valid {
			invalid = append(invalid, fmt.Sprintf("%s=%s", id, ans))
		}
	}
	for id := range answers {
		if !known[id] {
			unknown = append(unknown, id)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("answers missing for: %s", strings.Join(missing, ","))
	}
	if len(invalid) > 0 {
		return fmt.Errorf("answers use invalid options: %s", strings.Join(invalid, ","))
	}
	if len(unknown) > 0 {
		return fmt.Errorf("answers reference unknown questions: %s", strings.Join(unknown, ","))
	}
	return nil
}

type openRef struct {
	ID   string
	Item *openItem
}

// openRefs keeps legacy items out of the open path: a question with options
// and a key stays a multiple-choice item even under the new rules.
func openRefs(qs []diagQuestion, th rules.Thresholds) []openRef {
	var out []openRef
	for _, q := range qs {
		if isOpenQuestion(q.Open, len(q.Options) == 0, q.Answer == "", th) {
			out = append(out, openRef{ID: q.ID, Item: q.Open})
		}
	}
	return out
}

func openQuizRefs(qs []quizQuestion, th rules.Thresholds) []openRef {
	var out []openRef
	for _, q := range qs {
		if isOpenQuestion(q.Open, len(q.Options) == 0, q.Answer == "", th) {
			out = append(out, openRef{ID: q.ID, Item: q.Open})
		}
	}
	return out
}

func openFinalRefs(qs []finalQuestion, th rules.Thresholds) []openRef {
	var out []openRef
	for _, q := range qs {
		if isOpenQuestion(q.Open, true, strings.TrimSpace(q.Respuesta) == "", th) {
			out = append(out, openRef{ID: q.ID, Item: q.Open})
		}
	}
	return out
}

func isOpenQuestion(explicit *openItem, noOptions, noAnswer bool, th rules.Thresholds) bool {
	return explicit != nil || (th.OpenResponseMode() && noOptions && noAnswer)
}

func validateOpenItems(refs []openRef, th rules.Thresholds, planSubs map[string]bool) error {
	if len(refs) == 0 {
		return nil
	}
	if !th.OpenResponseMode() || th.Concepts == nil {
		return fmt.Errorf("open items need the openResponse and concepts thresholds")
	}
	o := th.OpenResponse
	for _, ref := range refs {
		if ref.Item == nil {
			return fmt.Errorf("question %s has no open contract", ref.ID)
		}
		item := ref.Item
		if item.Version != o.Version {
			return fmt.Errorf("question %s open version %d, want %d", ref.ID, item.Version, o.Version)
		}
		checks := []struct {
			name, value string
			allowed     []string
		}{
			{"kind", item.Kind, o.ResponseKinds},
			{"operation", item.Operation, o.Operations},
			{"depth", item.Depth, o.Depths},
			{"centrality", item.Centrality, o.Centralities},
		}
		for _, c := range checks {
			if !slicesContains(c.allowed, c.value) {
				return fmt.Errorf("question %s open %s %q is not among %v", ref.ID, c.name, c.value, c.allowed)
			}
		}
		if err := validateConceptos(ref.ID, item.Concepts, planSubs, th.Concepts); err != nil {
			return err
		}
		if len(item.Criteria) == 0 {
			return fmt.Errorf("question %s declares no open criteria", ref.ID)
		}
		seen := map[string]bool{}
		for _, cr := range item.Criteria {
			if strings.TrimSpace(cr.ID) == "" || strings.TrimSpace(cr.Rubric) == "" || seen[cr.ID] {
				return fmt.Errorf("question %s open criteria need a unique id and rubric (got %q)", ref.ID, cr.ID)
			}
			seen[cr.ID] = true
		}
	}
	return nil
}

// openResponseText is what a verdict may quote. A no-evidence answer is a
// declared phrase, not text the learner had to invent.
func openResponseText(a openAnswer, o rules.OpenResponseThresholds) string {
	if a.NoEvidence {
		return o.NoEvidenceText
	}
	if a.Kind == "code" {
		return strings.TrimSpace(a.Code) + "\n" + strings.TrimSpace(a.Explanation)
	}
	return a.Text
}

func validateOpenSubmission(ws, rel, expected string) (bool, error) {
	if rel == "" || filepath.IsAbs(rel) || strings.Contains(rel, "..") {
		return false, fmt.Errorf("code answer names an unsafe submission %q", rel)
	}
	full := absPath(ws, rel)
	wsReal, err := filepath.EvalSymlinks(ws)
	if err != nil {
		return false, fmt.Errorf("code answer submission %q: workspace unavailable: %w", rel, err)
	}
	targetReal, err := filepath.EvalSymlinks(full)
	if err != nil {
		return false, fmt.Errorf("code answer submission %q: %w", rel, err)
	}
	within, err := filepath.Rel(wsReal, targetReal)
	if err != nil || filepath.IsAbs(within) || within == ".." || strings.HasPrefix(within, ".."+string(filepath.Separator)) {
		return false, fmt.Errorf("code answer submission %q escapes the workspace", rel)
	}
	var doc struct {
		Codigo    string `json:"codigo"`
		Aprobados int    `json:"aprobados"`
		Total     int    `json:"total"`
	}
	if err := readJSON(targetReal, &doc); err != nil {
		return false, fmt.Errorf("code answer submission: %w", err)
	}
	if doc.Codigo != expected {
		return false, fmt.Errorf("code answer submission %q does not carry the submitted code", rel)
	}
	if strings.TrimSpace(doc.Codigo) == "" || doc.Total < 1 || doc.Aprobados < 0 || doc.Aprobados > doc.Total {
		return false, fmt.Errorf("code answer submission %q has no executable result", rel)
	}
	return doc.Aprobados == doc.Total, nil
}

// openScore keeps points in halves: correct is one question, partial is half.
type openScore struct {
	Points        int
	WrongIDs      []string
	CentralMisses []string
	Passed        bool
}

// validateOpenDiagnostic applies the diagnosis bounds and layout to an
// all-open round, without importing the multiple-choice key requirements.
func validateOpenDiagnostic(qs []diagQuestion, plan *planDoc, th rules.Thresholds) error {
	if !th.OpenResponseMode() || th.Concepts == nil {
		return fmt.Errorf("open diagnosis needs the openResponse and concepts thresholds")
	}
	if len(qs) == 0 {
		return fmt.Errorf("the diagnosis has no questions")
	}
	if len(qs) > th.Concepts.DiagnosisMaxQuestions {
		return fmt.Errorf("the diagnosis asks %d questions; at most %d", len(qs), th.Concepts.DiagnosisMaxQuestions)
	}
	planSubs := map[string]bool{}
	if plan != nil {
		planSubs = planSubtemas(*plan)
	}
	seen := map[string]bool{}
	last := 1
	for _, q := range qs {
		if !safeID(q.ID) || seen[q.ID] {
			return fmt.Errorf("question id %q is missing, unsafe or repeated", q.ID)
		}
		seen[q.ID] = true
		if strings.TrimSpace(q.Enunciado) == "" {
			return fmt.Errorf("question %s has an empty enunciado", q.ID)
		}
		if err := checkCodeInProse(q.ID, th, q.Enunciado); err != nil {
			return err
		}
		if !planSubs[q.Subtema] && !strings.HasPrefix(q.Subtema, "P0.") {
			return fmt.Errorf("question %s subtema %q is outside the plan", q.ID, q.Subtema)
		}
		if err := validateNivel(q.Nivel, th); err != nil {
			return fmt.Errorf("question %s: %w", q.ID, err)
		}
		if q.Pieza.Tipo == "" || !slicesContains(th.PiezaTipos, q.Pieza.Tipo) || strings.TrimSpace(q.Pieza.Contenido) == "" {
			return fmt.Errorf("question %s needs a declared working piece", q.ID)
		}
		switch {
		case q.Round < 1:
			return fmt.Errorf("question %s needs a round of 1 or more", q.ID)
		case q.Round < last:
			return fmt.Errorf("question %s (round %d) comes after a round %d question", q.ID, q.Round, last)
		case q.Round > last+1:
			return fmt.Errorf("question %s jumps to round %d after round %d", q.ID, q.Round, last)
		}
		last = q.Round
	}
	return validateOpenItems(openRefs(qs, th), th, planSubs)
}

func validateOpenQuizQuestions(qs []quizQuestion, partSubtema string, planSubs map[string]bool, th rules.Thresholds) error {
	if !th.OpenResponseMode() || th.Concepts == nil {
		return fmt.Errorf("open mini-quiz needs the openResponse and concepts thresholds")
	}
	c := th.Concepts
	if len(qs) < c.MinQuestions || len(qs) > c.MaxQuestions {
		return fmt.Errorf("expected between %d and %d quiz questions, got %d", c.MinQuestions, c.MaxQuestions, len(qs))
	}
	seen := map[string]bool{}
	for _, q := range qs {
		if !safeID(q.ID) || seen[q.ID] {
			return fmt.Errorf("question id %q is missing, unsafe or repeated", q.ID)
		}
		seen[q.ID] = true
		if strings.TrimSpace(q.Enunciado) == "" {
			return fmt.Errorf("question %s has an empty enunciado", q.ID)
		}
		if err := checkCodeInProse(q.ID, th, q.Enunciado); err != nil {
			return err
		}
		if q.Subtema != partSubtema {
			return fmt.Errorf("question %s subtema %q must inherit the part subtema %q", q.ID, q.Subtema, partSubtema)
		}
		if err := validateNivel(q.Nivel, th); err != nil {
			return fmt.Errorf("question %s: %w", q.ID, err)
		}
	}
	return validateOpenItems(openQuizRefs(qs, th), th, planSubs)
}

func quotesOpenEvidence(text, evidence string) bool {
	span := strings.TrimSpace(evidence)
	return span != "" && strings.Contains(text, span)
}

func gradeOpen(ws string, refs []openRef, answers map[string]openAnswer, doc openVerdictDoc, present bool, th rules.Thresholds) (openScore, error) {
	var out openScore
	if len(refs) == 0 {
		return out, nil
	}
	o := th.OpenResponse
	if o == nil {
		return out, fmt.Errorf("open items need the openResponse thresholds")
	}
	if !present || doc.Version != o.Version {
		return out, fmt.Errorf("tutor verdicts are missing or use another version")
	}
	if th.Concepts == nil {
		return out, fmt.Errorf("open scoring needs the declared passing ratio")
	}
	known := map[string]bool{}
	for _, ref := range refs {
		known[ref.ID] = true
	}
	unknown := make([]string, 0)
	for id := range doc.Verdicts {
		if !known[id] {
			unknown = append(unknown, id)
		}
	}
	sort.Strings(unknown)
	if len(unknown) > 0 {
		return out, fmt.Errorf("tutor verdict names unknown question %s", strings.Join(unknown, ", "))
	}
	for _, ref := range refs {
		answer, ok := answers[ref.ID]
		if !ok || strings.TrimSpace(openResponseText(answer, *o)) == "" {
			return out, fmt.Errorf("open answer %s is not recorded (waiting for learner input)", ref.ID)
		}
		if answer.NoEvidence && (strings.TrimSpace(answer.Text) != "" || strings.TrimSpace(answer.Code) != "" ||
			strings.TrimSpace(answer.Explanation) != "" || strings.TrimSpace(answer.Submission) != "") {
			return out, fmt.Errorf("open answer %s declares no evidence but still carries answer content", ref.ID)
		}
		if answer.Kind != ref.Item.Kind {
			return out, fmt.Errorf("open answer %s is %q, want %q", ref.ID, answer.Kind, ref.Item.Kind)
		}
		if answer.Confidence != "" && !slicesContains(o.Confidence, answer.Confidence) {
			return out, fmt.Errorf("open answer %s uses confidence %q outside %v", ref.ID, answer.Confidence, o.Confidence)
		}
		submissionAllPassed := false
		if answer.Kind == "code" && !answer.NoEvidence {
			if strings.TrimSpace(answer.Code) == "" || strings.TrimSpace(answer.Explanation) == "" {
				return out, fmt.Errorf("open code answer %s needs code and an explanation", ref.ID)
			}
			var subErr error
			submissionAllPassed, subErr = validateOpenSubmission(ws, answer.Submission, answer.Code)
			if subErr != nil {
				return out, fmt.Errorf("open answer %s: %w", ref.ID, subErr)
			}
		}
		verdict, ok := doc.Verdicts[ref.ID]
		if !ok {
			return out, fmt.Errorf("tutor verdict missing for open question %s", ref.ID)
		}
		if !slicesContains(o.Verdicts, verdict.Verdict) {
			return out, fmt.Errorf("open question %s uses unknown verdict %q", ref.ID, verdict.Verdict)
		}
		text := openResponseText(answer, *o)
		if !quotesOpenEvidence(text, verdict.Evidence) {
			return out, fmt.Errorf("open question %s verdict evidence is not quoted from the learner's answer", ref.ID)
		}
		if answer.NoEvidence != (verdict.Verdict == o.NoEvidenceVerdict) {
			return out, fmt.Errorf("open question %s verdict %q does not match its no-evidence answer", ref.ID, verdict.Verdict)
		}
		for code := range verdict.Criteria {
			if !slicesContains(itemCriterionIDs(ref.Item), code) {
				return out, fmt.Errorf("open question %s has unknown criterion %s", ref.ID, code)
			}
		}
		if len(verdict.Criteria) != len(ref.Item.Criteria) {
			for _, cr := range ref.Item.Criteria {
				if _, ok := verdict.Criteria[cr.ID]; !ok {
					return out, fmt.Errorf("open question %s misses criterion %s", ref.ID, cr.ID)
				}
			}
			return out, fmt.Errorf("open question %s has an unknown criterion result", ref.ID)
		}
		met := 0
		for _, cr := range ref.Item.Criteria {
			result := verdict.Criteria[cr.ID]
			if !quotesOpenEvidence(text, result.Evidence) {
				return out, fmt.Errorf("open question %s criterion %s evidence is not quoted from the learner's answer", ref.ID, cr.ID)
			}
			if result.Met {
				met++
			}
		}
		total := len(ref.Item.Criteria)
		switch verdict.Verdict {
		case "correct":
			if met != total {
				return out, fmt.Errorf("open question %s verdict correct needs every criterion met", ref.ID)
			}
		case "partial":
			// A partial verdict can sit between the boolean criteria: the tutor
			// still owns the semantic judgment, not a criterion majority.
		default:
			if met != 0 {
				return out, fmt.Errorf("open question %s verdict %s cannot meet a criterion", ref.ID, verdict.Verdict)
			}
		}
		codes := make([]string, 0, len(verdict.Concepts))
		for code := range verdict.Concepts {
			codes = append(codes, code)
		}
		sort.Strings(codes)
		for _, code := range codes {
			if !slicesContains(ref.Item.Concepts, code) {
				return out, fmt.Errorf("open question %s state names concept %s, which it does not declare", ref.ID, code)
			}
			if !slicesContains(o.ConceptStates, verdict.Concepts[code]) {
				return out, fmt.Errorf("open question %s state %q is outside %v", ref.ID, verdict.Concepts[code], o.ConceptStates)
			}
		}
		if ref.Item.Kind == "code" && !answer.NoEvidence {
			explanation := verdict.Explanation
			if explanation == nil {
				return out, fmt.Errorf("open question %s has no explanation verdict for its code answer", ref.ID)
			}
			if !slicesContains(o.Verdicts, explanation.Verdict) {
				return out, fmt.Errorf("open question %s uses unknown explanation verdict %q", ref.ID, explanation.Verdict)
			}
			if !quotesOpenEvidence(answer.Explanation, explanation.Evidence) {
				return out, fmt.Errorf("open question %s explanation evidence is not quoted from the learner's explanation", ref.ID)
			}
			switch verdict.Verdict {
			case "correct":
				if !submissionAllPassed {
					return out, fmt.Errorf("open question %s verdict correct needs every declared test passed", ref.ID)
				}
				if explanation.Verdict != "correct" {
					return out, fmt.Errorf("open question %s verdict correct needs a correct explanation verdict", ref.ID)
				}
			case "partial":
				if explanation.Verdict != "correct" && explanation.Verdict != "partial" {
					return out, fmt.Errorf("open question %s verdict partial needs a correct or partial explanation verdict", ref.ID)
				}
			}
		}
		points := 0
		switch verdict.Verdict {
		case "correct":
			points = 2
		case "partial":
			points = 1
		}
		out.Points += points
		if points < 2 {
			out.WrongIDs = append(out.WrongIDs, ref.ID)
		}
		if ref.Item.Centrality == "central" && (verdict.Verdict == "incorrect" || verdict.Verdict == o.NoEvidenceVerdict) {
			out.CentralMisses = append(out.CentralMisses, ref.ID)
		}
	}
	ratio := th.Concepts.MinPassingRatio
	out.Passed = out.Points*ratio.Den >= 2*ratio.Num*len(refs) && len(out.CentralMisses) == 0
	return out, nil
}

func itemCriterionIDs(item *openItem) []string {
	ids := make([]string, 0, len(item.Criteria))
	for _, cr := range item.Criteria {
		ids = append(ids, cr.ID)
	}
	return ids
}

func formatOpenScore(points, count int) string {
	if points%2 == 0 {
		return itoa(points/2) + "/" + itoa(count)
	}
	return itoa(points/2) + ".5/" + itoa(count)
}

// scoreResult is derived by the engine from answers and keys; a caller can
// never supply it.
type scoreResult struct {
	Correct       int
	WrongIDs      []string
	CentralMisses []string
}

func scoreDiag(qs []diagQuestion, answers map[string]string) scoreResult {
	var out scoreResult
	for _, q := range qs {
		if answers[q.ID] == q.Answer {
			out.Correct++
		} else {
			out.WrongIDs = append(out.WrongIDs, q.ID)
		}
	}
	return out
}

func scoreQuiz(qs []quizQuestion, answers map[string]string) scoreResult {
	var out scoreResult
	for _, q := range qs {
		if answers[q.ID] == q.Answer {
			out.Correct++
			continue
		}
		out.WrongIDs = append(out.WrongIDs, q.ID)
		if q.Central {
			out.CentralMisses = append(out.CentralMisses, q.ID)
		}
	}
	return out
}

// --- notes: frontmatter, sections, areas -----------------------------------

// parseFrontmatter returns the key/value lines of a leading --- block.
func parseFrontmatter(text string) map[string]string {
	out := map[string]string{}
	lines := strings.Split(text, "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return out
	}
	for _, line := range lines[1:] {
		trimmed := strings.TrimSpace(line)
		if trimmed == "---" {
			return out
		}
		key, value, ok := strings.Cut(trimmed, ":")
		if !ok {
			continue
		}
		out[strings.TrimSpace(key)] = strings.TrimSpace(value)
	}
	return out
}

func headingLevel(line string) int {
	n := 0
	for _, r := range line {
		if r == '#' {
			n++
			continue
		}
		break
	}
	if n == 0 || n > 6 {
		return 0
	}
	if n < len(line) && line[n] != ' ' && line[n] != '\t' {
		return 0
	}
	return n
}

// findSection returns the body of the first heading containing phrase
// (case-insensitive), up to the next heading of the same or higher level.
func findSection(text, phrase string) (string, bool) {
	lines := strings.Split(text, "\n")
	lower := strings.ToLower(phrase)
	start := -1
	level := 0
	for i, line := range lines {
		if lvl := headingLevel(line); lvl > 0 && strings.Contains(strings.ToLower(line), lower) {
			start = i
			level = lvl
			break
		}
	}
	if start < 0 {
		return "", false
	}
	for i := start + 1; i < len(lines); i++ {
		if lvl := headingLevel(lines[i]); lvl > 0 && lvl <= level {
			return strings.Join(lines[start+1:i], "\n"), true
		}
	}
	return strings.Join(lines[start+1:], "\n"), true
}

func countLines(body string, pred func(string) bool) int {
	n := 0
	for _, line := range strings.Split(body, "\n") {
		if pred(line) {
			n++
		}
	}
	return n
}

func isPipeLine(line string) bool { return strings.HasPrefix(strings.TrimSpace(line), "|") }

func isNumberedItem(line string) bool {
	t := strings.TrimSpace(line)
	if t == "" {
		return false
	}
	for _, r := range t {
		if r >= '0' && r <= '9' {
			continue
		}
		if r == '.' || r == ' ' {
			return r == '.' && len(t) > 1
		}
		return false
	}
	return false
}

// misPalabrasAreas splits the dump page into one learner body per fixed-header
// area, in declaration order.
func misPalabrasAreas(text, header string) []string {
	var areas []string
	var current []string
	inArea := false
	for _, line := range strings.Split(text, "\n") {
		if strings.Contains(line, header) {
			if inArea {
				areas = append(areas, strings.Join(current, "\n"))
			}
			current = nil
			inArea = true
			continue
		}
		if inArea && strings.HasPrefix(strings.TrimSpace(line), "## Parte ") {
			areas = append(areas, strings.Join(current, "\n"))
			current = nil
			inArea = false
		}
		if inArea {
			current = append(current, line)
		}
	}
	if inArea {
		areas = append(areas, strings.Join(current, "\n"))
	}
	return areas
}

// --- text binding ----------------------------------------------------------

// norm collapses whitespace so enunciados bind across markdown formatting
// runs without grading spelling or punctuation.
func norm(s string) string { return strings.Join(strings.Fields(s), " ") }

func containsNorm(haystack, needle string) bool {
	n := norm(needle)
	if n == "" {
		return true
	}
	return strings.Contains(norm(haystack), n)
}

// --- feedback --------------------------------------------------------------

type feedbackDoc struct {
	PartID             string `json:"partId"`
	DifficultyDetected *bool  `json:"difficultyDetected"`
	Notes              string `json:"notes"`
}

func loadFeedback(ws, rel string) (feedbackDoc, error) {
	var doc feedbackDoc
	if err := readJSON(absPath(ws, rel), &doc); err != nil {
		return doc, err
	}
	return doc, nil
}

// --- small conversions -----------------------------------------------------

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	var b []byte
	for i > 0 {
		b = append([]byte{byte('0' + i%10)}, b...)
		i /= 10
	}
	if neg {
		return "-" + string(b)
	}
	return string(b)
}

func atoi(s string) (int, error) {
	n := 0
	if s == "" {
		return 0, fmt.Errorf("empty number")
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, fmt.Errorf("not a number: %s", s)
		}
		n = n*10 + int(r-'0')
	}
	return n, nil
}

func slicesContains(list []string, v string) bool {
	for _, item := range list {
		if item == v {
			return true
		}
	}
	return false
}

// validateDiagQuestion checks what every diagnostic question needs: a safe
// unique id, real enunciado, join key, nivel, working piece and choices.
func validateDiagQuestion(q diagQuestion, seen map[string]bool, planSubs map[string]bool, th rules.Thresholds) error {
	if !safeID(q.ID) {
		return fmt.Errorf("question has an unsafe id %q", q.ID)
	}
	if seen[q.ID] {
		return fmt.Errorf("question id %q is repeated", q.ID)
	}
	seen[q.ID] = true
	if strings.TrimSpace(q.Enunciado) == "" {
		return fmt.Errorf("question %s has an empty enunciado", q.ID)
	}
	if err := checkCodeInProse(q.ID, th, questionTexts(q.Enunciado, q.Options)...); err != nil {
		return err
	}
	if err := validateNivel(q.Nivel, th); err != nil {
		return fmt.Errorf("question %s: %w", q.ID, err)
	}
	if q.Pieza.Tipo == "" || !slicesContains(th.PiezaTipos, q.Pieza.Tipo) {
		return fmt.Errorf("question %s declares pieza tipo %q outside %v", q.ID, q.Pieza.Tipo, th.PiezaTipos)
	}
	if strings.TrimSpace(q.Pieza.Contenido) == "" {
		return fmt.Errorf("question %s has an empty pieza contenido", q.ID)
	}
	switch q.Type {
	case "prerequisite":
		if !strings.HasPrefix(q.Subtema, "P0.") {
			return fmt.Errorf("prerequisite question %s must join on a P0.x subtema, got %q", q.ID, q.Subtema)
		}
	case "topic":
		if !planSubs[q.Subtema] {
			return fmt.Errorf("topic question %s references subtema %q that is not in the plan", q.ID, q.Subtema)
		}
		want, ok := th.NivelByLevel[itoa(q.Level)]
		if !ok {
			return fmt.Errorf("topic question %s has undeclared level %d", q.ID, q.Level)
		}
		if q.Nivel != want {
			return fmt.Errorf("topic question %s level %d must map to nivel %q, got %q", q.ID, q.Level, want, q.Nivel)
		}
	default:
		return fmt.Errorf("question %s has unknown type %q", q.ID, q.Type)
	}
	if err := validateOptions(q.Options, th.Options); err != nil {
		return fmt.Errorf("question %s: %w", q.ID, err)
	}
	if err := validateAnswerKey(q.Answer, th.Options); err != nil {
		return fmt.Errorf("question %s: %w", q.ID, err)
	}
	return nil
}

// validateAdaptiveDiagnostic checks the round layout, which needs no answers:
// round 1 asks one basic topic question per area, up to roundSize; every
// later question follows exactly one question of the previous round; no
// round exceeds roundSize and none goes past maxRounds.
func validateAdaptiveDiagnostic(qs []diagQuestion, plan *planDoc, th rules.Thresholds) error {
	d := th.Diagnostic
	planSubs := map[string]bool{}
	if plan != nil {
		planSubs = planSubtemas(*plan)
	}
	want := d.RoundSize
	if len(planSubs) < want {
		want = len(planSubs)
	}
	seen := map[string]bool{}
	byID := map[string]diagQuestion{}
	followed := map[string]string{}
	perRound := map[int]int{}
	areas := map[string]bool{}
	last := 1
	for _, q := range qs {
		if err := validateDiagQuestion(q, seen, planSubs, th); err != nil {
			return err
		}
		if q.Round < 1 || q.Round > d.MaxRounds {
			return fmt.Errorf("question %s is in round %d: rounds run from 1 to %d", q.ID, q.Round, d.MaxRounds)
		}
		if q.Round < last {
			return fmt.Errorf("question %s (round %d) comes after a round %d question: list rounds in order", q.ID, q.Round, last)
		}
		last = q.Round
		perRound[q.Round]++
		if perRound[q.Round] > d.RoundSize {
			return fmt.Errorf("round %d has more than %d questions", q.Round, d.RoundSize)
		}
		if q.Round == 1 {
			if q.Type != "topic" || q.Level != 1 || q.Follows != "" {
				return fmt.Errorf("round 1 question %s must be a basic (level 1) topic question that follows nothing", q.ID)
			}
			if areas[q.Subtema] {
				return fmt.Errorf("round 1 asks twice about %s: one question per area", q.Subtema)
			}
			areas[q.Subtema] = true
		} else {
			prev, ok := byID[q.Follows]
			if !ok || prev.Round != q.Round-1 {
				return fmt.Errorf("round %d question %s must follow a round %d question, got %q", q.Round, q.ID, q.Round-1, q.Follows)
			}
			if other, dup := followed[q.Follows]; dup {
				return fmt.Errorf("questions %s and %s both follow %s: one follow-up per answer", other, q.ID, q.Follows)
			}
			followed[q.Follows] = q.ID
		}
		byID[q.ID] = q
	}
	if perRound[1] != want {
		return fmt.Errorf("round 1 must ask %d basic topic questions, one per area (got %d)", want, perRound[1])
	}
	return nil
}

// adaptiveFlow checks every follow-up against the answer it follows and lists
// the follow-ups the chat still owes. A right answer below avanzado moves the
// area up one level; a wrong basic answer moves it down to a foundation; a
// wrong answer above basic, a right avanzado answer or a foundation answer
// resolve the area. Follow-ups after maxRounds are never owed.
func adaptiveFlow(qs []diagQuestion, answers map[string]string, th rules.Thresholds) (owed []string, err error) {
	byID := map[string]diagQuestion{}
	followers := map[string]bool{}
	for _, q := range qs {
		byID[q.ID] = q
		if q.Follows != "" {
			followers[q.Follows] = true
		}
	}
	maxLevel := len(th.NivelByLevel)
	for _, q := range qs {
		if q.Round <= 1 {
			continue
		}
		for _, p := range qs {
			if p.Round == q.Round-1 && strings.TrimSpace(answers[p.ID]) == "" {
				return nil, fmt.Errorf("round %d question %s was written before round %d was fully answered (%s is unanswered)", q.Round, q.ID, p.Round, p.ID)
			}
		}
	}
	for _, q := range qs {
		if q.Follows == "" {
			continue
		}
		prev := byID[q.Follows]
		got, answered := answers[prev.ID]
		if !answered || strings.TrimSpace(got) == "" {
			return nil, fmt.Errorf("question %s follows %s, which is not answered yet: write a round after its answers", q.ID, prev.ID)
		}
		right := got == prev.Answer
		switch {
		case prev.Type == "prerequisite":
			return nil, fmt.Errorf("question %s follows the foundation question %s, which resolves its area", q.ID, prev.ID)
		case right && prev.Level >= maxLevel:
			return nil, fmt.Errorf("question %s follows %s, a right avanzado answer that resolves its area", q.ID, prev.ID)
		case right:
			if q.Type != "topic" || q.Subtema != prev.Subtema || q.Level != prev.Level+1 {
				return nil, fmt.Errorf("question %s must move %s up: a level %d topic question on %s", q.ID, prev.Subtema, prev.Level+1, prev.Subtema)
			}
		case prev.Level == 1:
			if q.Type != "prerequisite" {
				return nil, fmt.Errorf("question %s must move %s down to a foundation (prerequisite) question", q.ID, prev.Subtema)
			}
		default:
			return nil, fmt.Errorf("question %s follows %s, a wrong answer above basic that resolves its area", q.ID, prev.ID)
		}
	}
	for _, q := range qs {
		if followers[q.ID] || q.Round >= th.Diagnostic.MaxRounds || q.Type != "topic" {
			continue
		}
		got, answered := answers[q.ID]
		if !answered || strings.TrimSpace(got) == "" {
			continue
		}
		right := got == q.Answer
		if (right && q.Level < maxLevel) || (!right && q.Level == 1) {
			owed = append(owed, q.ID)
		}
	}
	return owed, nil
}

// unansweredDiag lists questions the learner has not answered yet.
func unansweredDiag(qs []diagQuestion, answers map[string]string) []string {
	var out []string
	for _, q := range qs {
		if strings.TrimSpace(answers[q.ID]) == "" {
			out = append(out, q.ID)
		}
	}
	return out
}
