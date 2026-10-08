package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const repoRulesPath = "../../rules/deep.json"

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}

// fixture is an isolated temp Learnings root with one topic workspace.
type fixture struct {
	base string
	root string
	ws   string
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	base := t.TempDir()
	root := filepath.Join(base, "Learnings")
	ws := filepath.Join(root, "consensus")
	if err := os.MkdirAll(ws, 0o755); err != nil {
		t.Fatal(err)
	}
	return &fixture{base: base, root: root, ws: ws}
}

func (f *fixture) opts(cmd, stage string) Options {
	return Options{
		Command:   cmd,
		Root:      f.root,
		Workspace: f.ws,
		RulesPath: repoRulesPath,
		Mode:      "deep",
		Stage:     stage,
	}
}

// run executes the public engine entry point.
func (f *fixture) run(t *testing.T, opts Options) (Report, int) {
	t.Helper()
	return Run(opts)
}

// write stores a workspace artifact at a relative path.
func (f *fixture) write(t *testing.T, rel, content string) {
	t.Helper()
	p := filepath.Join(f.ws, rel)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func (f *fixture) writeJSON(t *testing.T, rel string, v any) {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	f.write(t, rel, string(b))
}

func (f *fixture) read(t *testing.T, rel string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(f.ws, rel))
	if err != nil {
		t.Fatalf("read %s: %v", rel, err)
	}
	return b
}

func (f *fixture) tryReadState(t *testing.T) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(f.ws, ".learning", "state.json"))
	if err != nil {
		return nil
	}
	return b
}

func (f *fixture) state(t *testing.T) map[string]any {
	t.Helper()
	raw := f.tryReadState(t)
	if raw == nil {
		t.Fatal("state.json missing")
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("state.json is not valid JSON: %v", err)
	}
	return out
}

func successfulAdvances(t *testing.T, st map[string]any) float64 {
	t.Helper()
	counters, _ := st["counters"].(map[string]any)
	n, _ := counters["successfulAdvances"].(float64)
	return n
}

func hasCheck(rep Report, id string) (Check, bool) {
	for _, c := range rep.Checks {
		if c.ID == id {
			return c, true
		}
	}
	return Check{}, false
}

func failIDs(rep Report) []string {
	var ids []string
	for _, c := range rep.Checks {
		if c.Status == "FAIL" {
			ids = append(ids, c.ID)
		}
	}
	return ids
}

// assertGatePassing enforces the adapter contract: PASS statuses carry zero FAIL checks.
func assertGatePassing(t *testing.T, rep Report, code int, wantStatus string) {
	t.Helper()
	if rep.Status != wantStatus {
		t.Fatalf("status = %q, want %q (detail: %s, checks: %+v)", rep.Status, wantStatus, rep.Detail, rep.Checks)
	}
	if fails := failIDs(rep); len(fails) > 0 {
		t.Fatalf("passing status %q must carry zero FAIL checks, got %v", wantStatus, fails)
	}
	switch code {
	case 0:
	default:
		t.Fatalf("exit code = %d, want 0 for status %q", code, rep.Status)
	}
}

func assertBlocked(t *testing.T, rep Report, code int) {
	t.Helper()
	if rep.Status != "blocked" {
		t.Fatalf("status = %q, want blocked (detail: %s)", rep.Status, rep.Detail)
	}
	if len(failIDs(rep)) == 0 {
		t.Fatalf("blocked report must carry at least one FAIL check, got %+v", rep.Checks)
	}
	if code != 1 && code != 2 {
		t.Fatalf("exit code = %d, want 1 or 2 for blocked", code)
	}
}

// --- artifact builders -----------------------------------------------------

type partCfg struct {
	id    string
	ex    bool
	vis   bool
	title string
}

type planWire struct {
	Topic            string         `json:"topic"`
	Parts            []planPartWire `json:"parts"`
	DiagnosisSummary string         `json:"diagnosisSummary,omitempty"`
	FocusAreas       []string       `json:"focusAreas,omitempty"`
}

type planPartWire struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	Slug            string `json:"slug"`
	Subtema         string `json:"subtema"`
	ExamplesPlanned bool   `json:"examplesPlanned"`
	VisualsPlanned  bool   `json:"visualsPlanned"`
}

func defaultParts() []partCfg {
	return []partCfg{
		{id: "p1", ex: true, vis: true, title: "Replicación"},
		{id: "p2", ex: true, vis: false, title: "Líder"},
	}
}

func (f *fixture) writePlan(t *testing.T, parts ...partCfg) {
	t.Helper()
	f.writePlanWith(t, "", nil, parts...)
	f.writePreparationBundle(t, parts)
	f.write(t, "planificador.md", fixturePlanificador(parts))
	f.write(t, "quiz.md", diagnosticQuizNote(buildDiagQuestions(6, 6, parts...), "pending", ""))
	f.write(t, "ejercicios.md", "---\ntipo: ejercicios\n---\n# Ejercicios\n")
	f.write(t, "cuestionario-final.md", "---\ntipo: cuestionario-final\n---\n# Final\n")
	f.writeJSON(t, "cuestionario-final.json", map[string]any{"questions": []any{map[string]any{"id": "f1", "subtema": "T.p1", "nivel": "básico", "formato": "respuesta corta", "enunciado": "Explica el caso", "respuesta": ""}}})
	f.writeJSON(t, "cuestionario-final.answers.json", map[string]any{"answers": map[string]string{"f1": ""}})
	f.write(t, "explicacion.md", indexNote(parts))
	f.write(t, "mis-palabras.md", fixtureMisPalabras(parts))
}

func slugForTest(id string) string { return strings.ReplaceAll(id, "_", "-") }

func (f *fixture) writePlanWith(t *testing.T, summary string, focus []string, parts ...partCfg) {
	t.Helper()
	doc := planWire{Topic: "Consenso distribuido"}
	if summary != "" {
		doc.DiagnosisSummary = summary
	}
	doc.FocusAreas = focus
	for _, p := range parts {
		title := p.title
		if title == "" {
			title = p.id
		}
		subtema := "T." + p.id
		doc.Parts = append(doc.Parts, planPartWire{
			ID: p.id, Title: title, Slug: slugForTest(p.id), Subtema: subtema,
			ExamplesPlanned: p.ex, VisualsPlanned: p.vis,
		})
	}
	f.writeJSON(t, "plan.json", doc)
	f.writePlanificadorTopics(parts)
}

func (f *fixture) writePlanificadorTopics(parts []partCfg) {
	path := filepath.Join(f.ws, "planificador.md")
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	text := string(b)
	marker := "## tabla de plan\n"
	idx := strings.Index(strings.ToLower(text), marker)
	if idx < 0 {
		return
	}
	var rows strings.Builder
	for _, q := range buildDiagQuestions(6, 6, parts...) {
		rows.WriteString("\n" + q.Subtema + " · nivel: " + q.Nivel + " · pregunta " + q.ID + "\n")
	}
	text = text[:idx+len(marker)] + rows.String() + text[idx+len(marker):]
	_ = os.WriteFile(path, []byte(text), 0o644)
}

func fixturePlanificador(parts []partCfg) string {
	var b strings.Builder
	b.WriteString("# Planificador\n")
	for _, section := range []string{"pre-preguntas", "resultado", "tabla de plan", "mapa de dependencias", "ruta", "plan visual", "estructura", "vuelco", "bibliografía", "ejercicios", "post-preguntas", "bitácora"} {
		b.WriteString("\n## " + section + "\nContenido verificado.\n")
		if section == "tabla de plan" {
			for i := 1; i <= 6; i++ {
				b.WriteString(fmt.Sprintf("P0.%d · pregunta d%d · prerrequisito\n", i, i))
			}
			for i := 7; i <= 12; i++ {
				b.WriteString(fmt.Sprintf("T.p1 · pregunta d%d · nivel %s\n", i, []string{"básico", "básico", "medio", "medio", "avanzado", "avanzado"}[i-7]))
			}
		}
		if section == "mapa de dependencias" {
			b.WriteString("```mermaid\nflowchart LR\nA --> B\n```\n")
		}
		if section == "ruta" {
			for i, p := range parts {
				b.WriteString(fmt.Sprintf("%d. T.%s — %s\n", i+1, p.id, p.title))
			}
		}
		if section == "plan visual" {
			b.WriteString("| Parte | Nodo | Escalón | Tipo | Muestra |\n|---|---|---|---|---|\n")
			for _, p := range parts {
				b.WriteString("| " + p.id + " | T." + p.id + " | básico | tabla | ejemplo |\n")
			}
		}
		if section == "bibliografía" {
			b.WriteString("| Claim | Fuente | Verificado | ✅ verificado |\n")
		}
		if section == "ejercicios" {
			b.WriteString("| Ejercicio | Nodo | Formato | Mide |\n")
		}
	}
	return b.String()
}

func fixtureMisPalabras(parts []partCfg) string {
	var b strings.Builder
	b.WriteString("---\ntipo: mis-palabras\n---\n# Vuelcos\n")
	for i, p := range parts {
		b.WriteString(fmt.Sprintf("\n## Parte %d — %s\nVuelca aquí, con tus palabras, todo lo que entendiste y lo que no entendiste.\n\n", i+1, p.title))
	}
	return b.String()
}

func indexNote(parts []partCfg) string {
	var b strings.Builder
	b.WriteString("---\ntipo: indice\n---\n# Índice\n")
	for i, p := range parts {
		b.WriteString("\n- [[explicaciones/Parte " + itoa(i+1) + " - " + slugForTest(p.id) + "|" + p.title + "]] — 🔓 abierta\n")
	}
	return b.String()
}

func (f *fixture) writePreparationBundle(t *testing.T, parts []partCfg) {
	t.Helper()
	sections := ""
	for _, section := range []string{"pre-preguntas", "resultado", "tabla de plan", "mapa de dependencias", "ruta", "plan visual", "estructura", "vuelco", "bibliografía", "ejercicios", "post-preguntas", "bitácora"} {
		sections += "\n## " + section + "\nContenido verificado de " + section + ".\n"
		if section == "tabla de plan" {
			for _, qid := range []string{"d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "d10", "d11", "d12"} {
				tag := "P0." + strings.TrimPrefix(qid, "d")
				if strings.TrimPrefix(qid, "d") > "6" {
					tag = "T.p1"
				}
				sections += "Pregunta " + qid + " — " + tag + " evaluado.\n"
			}
		}
		if section == "mapa de dependencias" {
			sections += "```mermaid\nflowchart LR\nA --> B\n```\n"
		}
		if section == "ruta" {
			for i, p := range parts {
				sections += fmt.Sprintf("%d. T.%s — %s\n", i+1, p.id, p.title)
			}
		}
		if section == "plan visual" {
			sections += "| Parte | Nodo | Escalón | Tipo | Muestra |\n|---|---|---|---|---|\n"
			for _, p := range parts {
				sections += "| " + p.id + " | T." + p.id + " | básico | tabla | ejemplo |\n"
			}
		}
		if section == "bibliografía" {
			sections += "| Afirmación | Fuente | Qué verifica | ✅ verificado |\n"
		}
		if section == "ejercicios" {
			sections += "| Ejercicio | Nodo | Formato | Mide |\n"
		}
	}
	f.write(t, "planificador.md", "# Plan de estudio\n"+sections)
	f.write(t, "mapa.mmd", "flowchart LR\n  A[Concepto] --> B[Aplicación]\n")
	f.write(t, "explicacion.md", "---\ntipo: indice\n---\n# Índice\n\n")
	var body strings.Builder
	for i, p := range parts {
		body.WriteString("\n## Parte ")
		body.WriteString(itoa(i + 1))
		body.WriteString(" — ")
		body.WriteString(p.title)
		body.WriteString("\n")
		body.WriteString("Vuelca aquí, con tus palabras, todo lo que entendiste y lo que no entendiste.\n\n")
	}
	f.write(t, "mis-palabras.md", "---\ntipo: mis-palabras\n---\n# Vuelcos\n"+body.String())
}

type diagQuestionWire struct {
	ID        string            `json:"id"`
	Type      string            `json:"type"`
	Level     int               `json:"level"`
	Subtema   string            `json:"subtema"`
	Nivel     string            `json:"nivel"`
	Enunciado string            `json:"enunciado"`
	Pieza     map[string]string `json:"pieza"`
	Options   map[string]string `json:"options"`
	Answer    string            `json:"answer"`
}

func optionSet() map[string]string {
	return map[string]string{"A": "opcion a", "B": "opcion b", "C": "opcion c", "D": "opcion d", "E": "No sé"}
}

// diagKey is the deterministic answer key for diagnostic question index i.
func diagKey(i int) string { return string(rune('A' + i%4)) }

func buildDiagQuestions(prereq, topic int, parts ...partCfg) []diagQuestionWire {
	topicSubtema := "T.p1"
	if len(parts) > 0 && parts[0].id != "" {
		topicSubtema = "T." + parts[0].id
	}
	var qs []diagQuestionWire
	n := 0
	for i := 0; i < prereq; i++ {
		qs = append(qs, diagQuestionWire{
			ID: "d" + itoa(n+1), Type: "prerequisite", Level: 1,
			Subtema: "P0." + itoa(i+1), Nivel: "básico", Enunciado: "¿Qué resultado produce este caso?",
			Pieza:   map[string]string{"tipo": "caso", "contenido": "Caso concreto con datos de ejemplo."},
			Options: optionSet(), Answer: diagKey(n),
		})
		n++
	}
	levels := []int{1, 1, 2, 2, 3, 3}
	for i := 0; i < topic; i++ {
		lvl := 1
		if i < len(levels) {
			lvl = levels[i]
		}
		nivel := map[int]string{1: "básico", 2: "medio", 3: "avanzado"}[lvl]
		qs = append(qs, diagQuestionWire{
			ID: "d" + itoa(n+1), Type: "topic", Level: lvl,
			Subtema: topicSubtema, Nivel: nivel, Enunciado: "¿Qué resultado produce este caso?",
			Pieza:   map[string]string{"tipo": "caso", "contenido": "Caso concreto con datos de ejemplo."},
			Options: optionSet(), Answer: diagKey(n),
		})
		n++
	}
	return qs
}

func (f *fixture) writeDiagQuestions(t *testing.T, qs []diagQuestionWire) {
	t.Helper()
	f.writeJSON(t, "diagnosis/questions.json", map[string]any{"questions": qs})
	f.writeJSON(t, "quiz.json", map[string]any{"questions": qs})
	f.write(t, "quiz.md", diagnosticQuizNote(qs, "pending", ""))
}

func diagnosticQuizNote(qs []diagQuestionWire, state, score string) string {
	var b strings.Builder
	b.WriteString("---\ntipo: quiz-diagnostico\nestado: " + state + "\n")
	if score != "" {
		b.WriteString("puntaje: " + score + "\n")
	}
	b.WriteString("---\n# Diagnóstico\n")
	for _, q := range qs {
		b.WriteString("\n## " + q.ID + "\n" + q.Enunciado + "\n" + q.Pieza["contenido"] + "\n")
		b.WriteString("subtema: " + q.Subtema + "\nnivel: " + q.Nivel + "\n")
		for _, k := range []string{"A", "B", "C", "D"} {
			b.WriteString(k + ". " + q.Options[k] + "\n")
		}
		b.WriteString("E. No sé\n")
	}
	return b.String()
}

// writeDiagAnswers answers every diagnostic question correctly except the
// given 0-based indexes (answered "No sé" via option E unless idx%2==0).
func (f *fixture) writeDiagAnswers(t *testing.T, wrong ...int) {
	f.writeDiagAnswersFor(t, defaultParts(), wrong...)
}

func (f *fixture) writeDiagAnswersFor(t *testing.T, parts []partCfg, wrong ...int) {
	t.Helper()
	var questionFile struct {
		Questions []diagQuestionWire `json:"questions"`
	}
	if err := json.Unmarshal(f.read(t, "quiz.json"), &questionFile); err != nil {
		t.Fatal(err)
	}
	qsWire := questionFile.Questions
	answers := map[string]string{}
	for i, q := range qsWire {
		answers[q.ID] = q.Answer
		for _, w := range wrong {
			if i == w {
				answers[q.ID] = "E"
			}
		}
	}
	f.writeJSON(t, "diagnosis/answers.json", map[string]any{"answers": answers})
	f.writeJSON(t, "quiz.answers.json", map[string]any{"answers": answers})
	qs := make([]diagQuestion, 0, len(qsWire))
	for _, q := range qsWire {
		qs = append(qs, diagQuestion{ID: q.ID, Type: q.Type, Level: q.Level, Subtema: q.Subtema, Nivel: q.Nivel, Enunciado: q.Enunciado, Pieza: pieza{Tipo: q.Pieza["tipo"], Contenido: q.Pieza["contenido"]}, Options: q.Options, Answer: q.Answer})
	}
	f.writeJSON(t, "quiz.json", map[string]any{"questions": qsWire})
	f.write(t, "quiz.md", diagnosticQuizNote(qsWire, "completado", fmt.Sprintf("%d/%d", scoreDiag(qs, answers).Correct, len(qs))))
	f.write(t, "diagnosis/.fixture_complete", "")
}

type quizQuestionWire struct {
	ID        string            `json:"id"`
	Central   bool              `json:"central,omitempty"`
	Subtema   string            `json:"subtema"`
	Nivel     string            `json:"nivel"`
	Enunciado string            `json:"enunciado"`
	Options   map[string]string `json:"options"`
	Answer    string            `json:"answer"`
}

func quizKey(i int) string { return string(rune('A' + i%4)) }

func buildQuizQuestions(part string) []quizQuestionWire {
	var qs []quizQuestionWire
	for i := 0; i < 5; i++ {
		qs = append(qs, quizQuestionWire{
			ID: "q" + itoa(i+1), Central: i < 2, Subtema: "T." + part, Nivel: "medio",
			Enunciado: "¿Qué resultado produce este caso?", Options: optionSet(), Answer: quizKey(i),
		})
	}
	return qs
}

func (f *fixture) writeQuizQuestions(t *testing.T, part string) {
	t.Helper()
	qs := buildQuizQuestions(part)
	f.writeJSON(t, "mini-quiz/"+part+".json", map[string]any{"questions": qs})
}

// writeQuizAnswers answers the first `correct` questions right (rest "No sé").
func (f *fixture) writeQuizAnswers(t *testing.T, part string, correct int) {
	t.Helper()
	var wire struct {
		Questions []quizQuestionWire `json:"questions"`
	}
	if err := json.Unmarshal(f.read(t, "mini-quiz/"+part+".json"), &wire); err != nil {
		t.Fatal(err)
	}
	qs := wire.Questions
	answers := map[string]string{}
	for i, q := range qs {
		if i < correct {
			answers[q.ID] = q.Answer
		} else {
			answers[q.ID] = "E"
		}
	}
	f.writeJSON(t, "mini-quiz/"+part+".answers.json", map[string]any{"answers": answers})
}

func (f *fixture) canonicalPartFile(t *testing.T, part string) string {
	t.Helper()
	var plan planDoc
	if err := json.Unmarshal(f.read(t, "plan.json"), &plan); err != nil {
		t.Fatal(err)
	}
	rel, err := partRel(&plan, "explicaciones/Parte {index} - {slug}.md", part)
	if err != nil {
		t.Fatal(err)
	}
	return rel
}

func (f *fixture) writeExplanation(t *testing.T, part string, vis bool, marker string) {
	t.Helper()
	body := "---\ntipo: explicacion\nnodo: T." + part + "\nnivel: medio\n---\n# " + part + "\n\nExplicación de la parte con ejemplos concretos. " + marker + "\n\n## Ejemplo\n\nCaso numérico paso a paso.\n\n**Fuente**: Sutton & Barto, verificación de fixture.\n\n## Mini-quiz\n"
	if vis {
		body += "\n![diagrama](diagrama-" + part + ".png)\nCómo leerlo: sigue los pasos de izquierda a derecha.\n"
	}
	for _, q := range buildQuizQuestions(part) {
		body += "\n" + q.Enunciado + "\n"
	}
	f.write(t, f.canonicalPartFile(t, part), body)
}

func (f *fixture) writeOwnWords(t *testing.T, part string) {
	t.Helper()
	f.writeOwnWordsText(t, part, strings.Repeat("explico la idea con mis propias palabras y conecto cada paso. ", 3))
}

func (f *fixture) writeOwnWordsText(t *testing.T, part, submission string) {
	t.Helper()
	path := "mis-palabras.md"
	text := string(f.read(t, path))
	var plan planDoc
	if err := json.Unmarshal(f.read(t, "plan.json"), &plan); err != nil {
		t.Fatal(err)
	}
	for i, p := range plan.Parts {
		if p.ID != part {
			continue
		}
		heading := fmt.Sprintf("## Parte %d — %s", i+1, p.Title)
		start := strings.Index(text, heading)
		if start < 0 {
			t.Fatalf("missing own-words heading for %s", part)
		}
		start += len(heading)
		end := len(text)
		if next := strings.Index(text[start:], "\n## "); next >= 0 {
			end = start + next
		}
		marker := "Vuelca aquí, con tus palabras, todo lo que entendiste y lo que no entendiste."
		text = text[:start] + "\n" + marker + "\n" + submission + "\n" + text[end:]
		f.write(t, path, text)
		return
	}
	t.Fatalf("unknown own-words part %s", part)
}

func (f *fixture) writeFeedback(t *testing.T, part string, difficulty bool) {
	t.Helper()
	f.writeJSON(t, "feedback/"+part+".json", map[string]any{
		"partId": part, "difficultyDetected": difficulty, "notes": "resultado del mini quiz y dificultades observadas",
	})
}

// --- stage helpers ---------------------------------------------------------

func (f *fixture) initOK(t *testing.T) {
	t.Helper()
	rep, code := f.run(t, f.opts("init", ""))
	assertGatePassing(t, rep, code, "accepted")
}

func (f *fixture) advanceOK(t *testing.T, stage string) Report {
	t.Helper()
	f.reviewPending(t, stage)
	rep, code := f.run(t, f.opts("advance", stage))
	if rep.Status != "accepted" && rep.Status != "completed" {
		t.Fatalf("advance %s: status = %q, want accepted/completed (detail: %s, checks: %+v)",
			stage, rep.Status, rep.Detail, rep.Checks)
	}
	if fails := failIDs(rep); len(fails) > 0 {
		t.Fatalf("advance %s passed with FAIL checks: %v", stage, fails)
	}
	if code != 0 {
		t.Fatalf("advance %s: exit code = %d, want 0 (checks: %+v)", stage, code, rep.Checks)
	}
	return rep
}

func (f *fixture) statusExpect(t *testing.T, want string) Report {
	t.Helper()
	rep, code := f.run(t, f.opts("status", ""))
	if want == "accepted" || want == "completed" || want == "waiting" || want == "skipped" {
		assertGatePassing(t, rep, code, want)
	} else {
		assertBlocked(t, rep, code)
	}
	return rep
}

// readyThroughPlanning drives the deterministic prefix of the flow.
func (f *fixture) readyThroughPlanning(t *testing.T, wrong ...int) {
	t.Helper()
	f.readyParts(t, defaultParts(), wrong...)
}

func (f *fixture) readyParts(t *testing.T, parts []partCfg, wrong ...int) {
	t.Helper()
	f.initOK(t)
	f.writePlan(t, parts...)
	f.advanceOK(t, "preparation")
	qs := buildDiagQuestions(6, 6, parts...)
	f.writeDiagQuestions(t, qs)
	if wrong != nil {
		f.writeDiagAnswersFor(t, parts, wrong...)
	}
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades detectadas en consenso y en quórums.", []string{"d3"}, parts...)
	f.advanceOK(t, "planning")
}

// advanceExpectBlocked records any pending reviews first, runs advance and
// asserts a blocked outcome with a FAIL check id.
func (f *fixture) advanceExpectBlocked(t *testing.T, stage, failID string, reasonSub string) Report {
	t.Helper()
	f.reviewPending(t, stage)
	rep, code := f.run(t, f.opts("advance", stage))
	assertBlocked(t, rep, code)
	c, ok := hasCheck(rep, failID)
	if !ok {
		t.Fatalf("expected FAIL check %q, got %+v", failID, rep.Checks)
	}
	if c.Status != "FAIL" {
		t.Fatalf("check %q status = %q, want FAIL", failID, c.Status)
	}
	if reasonSub != "" && !strings.Contains(c.Reason, reasonSub) {
		t.Fatalf("check %q reason = %q, want substring %q", failID, c.Reason, reasonSub)
	}
	return rep
}

// --- recorded review helpers ----------------------------------------------

// pendingListOf normalizes report evidence.pendingReviews (built in-process
// as []map[string]any, decoded from CLI JSON as []any).
func pendingListOf(evidence map[string]any) []map[string]any {
	switch v := evidence["pendingReviews"].(type) {
	case []map[string]any:
		return v
	case []any:
		var out []map[string]any
		for _, item := range v {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	}
	return nil
}

// reviewPending records a benign review for every pending review request of a
// stage, as the chat (or a subagent it dispatches) would: gate verdict PASS
// (requirement met), assessment verdict FAIL (central-gap rubric: FAIL means
// no gap is present — PASS would assert a gap and trigger adaptation).
func (f *fixture) reviewPending(t *testing.T, stage string) int {
	t.Helper()
	rep, code := f.run(t, f.opts("validate", stage))
	if code != 0 {
		return 0 // objective failures surface on advance itself
	}
	n := 0
	for _, p := range pendingListOf(rep.Evidence) {
		opts := f.opts("review", stage)
		opts.Rule, _ = p["rule"].(string)
		opts.Verdict = benignVerdict(p)
		opts.Reason = "chat review of the artifact against the rubric"
		opts.Reviewer = "test-reviewer"
		rrep, rcode := f.run(t, opts)
		if rcode != 0 || rrep.Status != "accepted" {
			t.Fatalf("record review %s: status=%q exit=%d detail=%q",
				p["rule"], rrep.Status, rcode, rrep.Detail)
		}
		n++
	}
	return n
}

// benignVerdict picks the review verdict a reviewer records when the
// requirement is met: gates PASS; assessments FAIL (their rubric asserts the
// problem is present, so FAIL means absent).
func benignVerdict(p map[string]any) string {
	if kind, _ := p["kind"].(string); kind == "assessment" {
		return "FAIL"
	}
	return "PASS"
}

// recordReview records one explicit review verdict for a rubric.
func (f *fixture) recordReview(t *testing.T, stage, rule, verdict, reason string) {
	t.Helper()
	opts := f.opts("review", stage)
	opts.Rule, opts.Verdict, opts.Reason, opts.Reviewer = rule, verdict, reason, "test-reviewer"
	rep, code := f.run(t, opts)
	if code != 0 || rep.Status != "accepted" {
		t.Fatalf("record review %s: status=%q exit=%d detail=%q",
			rule, rep.Status, code, rep.Detail)
	}
}
