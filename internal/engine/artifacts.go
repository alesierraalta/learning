package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
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
	Topic            string        `json:"topic"`
	Parts            []planPartDoc `json:"parts"`
	DiagnosisSummary string        `json:"diagnosisSummary"`
	FocusAreas       []string      `json:"focusAreas"`
}

type planPartDoc struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	Slug            string `json:"slug"`
	Subtema         string `json:"subtema"`
	ExamplesPlanned *bool  `json:"examplesPlanned"`
	VisualsPlanned  *bool  `json:"visualsPlanned"`
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
	Contenido string `json:"contenido"`
}

type diagQuestion struct {
	ID        string            `json:"id"`
	Type      string            `json:"type"`
	Level     int               `json:"level"`
	Subtema   string            `json:"subtema"`
	Nivel     string            `json:"nivel"`
	Enunciado string            `json:"enunciado"`
	Pieza     pieza             `json:"pieza"`
	Options   map[string]string `json:"options"`
	Answer    string            `json:"answer"`
}

type quizQuestion struct {
	ID        string            `json:"id"`
	Central   bool              `json:"central"`
	Subtema   string            `json:"subtema"`
	Nivel     string            `json:"nivel"`
	Enunciado string            `json:"enunciado"`
	Options   map[string]string `json:"options"`
	Answer    string            `json:"answer"`
}

type finalQuestion struct {
	ID        string `json:"id"`
	Subtema   string `json:"subtema"`
	Nivel     string `json:"nivel"`
	Formato   string `json:"formato"`
	Enunciado string `json:"enunciado"`
	Respuesta string `json:"respuesta"`
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
func validateDiagnostic(qs []diagQuestion, plan *planDoc, th rules.Thresholds) error {
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
	return nil
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

func validateQuizQuestions(qs []quizQuestion, partSubtema string, th rules.Thresholds) error {
	if len(qs) != th.Quiz.QuestionCount {
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
	}
	return nil
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
