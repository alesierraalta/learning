package engine

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

type finalQuestionWire struct {
	ID        string `json:"id"`
	Subtema   string `json:"subtema"`
	Nivel     string `json:"nivel"`
	Formato   string `json:"formato"`
	Enunciado string `json:"enunciado"`
	Respuesta string `json:"respuesta"`
}

func closingQuestions() []finalQuestionWire {
	return []finalQuestionWire{
		{ID: "f1", Subtema: "T.p1", Nivel: "medio", Formato: "mcq",
			Enunciado: "¿Qué opción describe el resultado final del caso?", Respuesta: "B"},
		{ID: "f2", Subtema: "T.p1", Nivel: "avanzado", Formato: "abierta",
			Enunciado: "Explica con tus palabras por qué el sistema converge.", Respuesta: "Porque cada réplica acepta el mismo registro."},
	}
}

// writeClosingArtifacts produces the exercises note and the final quiz with a
// choice item and an open item, plus the learner answers.
func (f *fixture) writeClosingArtifacts(t *testing.T, choice, open, puntaje string) {
	t.Helper()
	f.write(t, "ejercicios.md", "---\ntipo: ejercicios\n---\n# Ejercicios\n\n## Ejercicio 1\nAplica el concepto a un caso nuevo y justifica cada paso.\n")
	qs := closingQuestions()
	answers := map[string]string{"f1": choice, "f2": open}
	var plan planDoc
	if err := json.Unmarshal(f.read(t, "plan.json"), &plan); err != nil {
		t.Fatal(err)
	}
	for i, p := range plan.Parts {
		if p.Subtema == "T.p1" {
			continue
		}
		id := fmt.Sprintf("f%d", len(qs)+1)
		qs = append(qs, finalQuestionWire{ID: id, Subtema: p.Subtema, Nivel: "medio", Formato: "abierta",
			Enunciado: fmt.Sprintf("Relaciona la parte %d con el resto del tema.", i+1), Respuesta: "Relación esperada."})
		answers[id] = "Respuesta abierta del alumno."
	}
	f.writeJSON(t, "cuestionario-final.json", map[string]any{"questions": qs})
	f.writeJSON(t, "cuestionario-final.answers.json", map[string]any{"answers": answers})
	var body strings.Builder
	fmt.Fprintf(&body, "---\ntipo: cuestionario-final\nestado: completado\npuntaje: %s\n---\n# Cuestionario final\n", puntaje)
	for _, q := range qs {
		fmt.Fprintf(&body, "\n## %s\n%s\n", q.ID, q.Enunciado)
	}
	f.write(t, "cuestionario-final.md", body.String())
}

// rescoreMap records the post-quiz re-scoring in the plan note and the map.
func (f *fixture) rescoreMap(t *testing.T, marker string) {
	t.Helper()
	f.write(t, "planificador.md", string(f.read(t, "planificador.md"))+"\nRe-puntaje final ("+marker+"): T.p1 dominado.\n")
	f.write(t, "mapa.mmd", string(f.read(t, "mapa.mmd"))+"  B --> C["+marker+"]\n")
}

// completeThroughAdaptation drives a one-part topic up to the closing stages.
func (f *fixture) completeThroughAdaptation(t *testing.T) {
	t.Helper()
	p1 := partCfg{id: "p1", ex: true, vis: true, title: "Parte"}
	f.readyParts(t, []partCfg{p1}, 2, 6)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 5)
	f.advanceOK(t, "quiz")
	f.writeFeedback(t, "p1", true)
	f.advanceOK(t, "feedback")
	f.writePlanWith(t, "Actualizada tras el feedback.", []string{"d3"}, p1)
	f.advanceOK(t, "planning")
	f.advanceOK(t, "adaptation")
}

// Open final-quiz answers are free text: recorded and required, never
// graded by string match; only choice items produce the derived score.
func TestFinalQuizAcceptsOpenAnswersAndScoresChoiceItems(t *testing.T) {
	f := newFixture(t)
	f.completeThroughAdaptation(t)
	f.writeClosingArtifacts(t, "B", "Cada réplica termina aceptando el mismo registro ordenado.", "1/1")
	f.advanceOK(t, "exercises")
	rep := f.advanceOK(t, "final_quiz")
	if got, _ := rep.Evidence["finalQuizScore"].(string); got != "1/1" {
		t.Fatalf("finalQuizScore = %q, want 1/1 (choice items only)", got)
	}
	if got, _ := rep.Evidence["finalOpenAnswers"].(int); got != 1 {
		t.Fatalf("finalOpenAnswers = %v, want 1 recorded open answer", rep.Evidence["finalOpenAnswers"])
	}
}

// An empty open answer is missing learner input, not an accepted submission.
func TestFinalQuizRejectsEmptyOpenAnswer(t *testing.T) {
	f := newFixture(t)
	f.completeThroughAdaptation(t)
	f.writeClosingArtifacts(t, "B", "   ", "1/1")
	f.advanceOK(t, "exercises")
	// Waiting only for the learner's answer is a pause, not a chat failure.
	f.statusExpect(t, "accepted")
	before := f.tryReadState(t)
	f.advanceExpectBlocked(t, "final_quiz", "final-quiz-note", "f2")
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("rejected final quiz mutated state")
	}
}

// A choice item still needs an option letter.
func TestFinalQuizRejectsNonLetterChoiceAnswer(t *testing.T) {
	f := newFixture(t)
	f.completeThroughAdaptation(t)
	f.writeClosingArtifacts(t, "la segunda", "Respuesta abierta válida.", "0/1")
	f.advanceOK(t, "exercises")
	f.advanceExpectBlocked(t, "final_quiz", "final-quiz-note", "f1")
}

// Completion requires the map re-score AFTER the final quiz; a completed
// topic returns to blocked when the re-scored notes change, and can be
// repaired without redoing the final quiz.
func TestFinalRequiresRescoreAfterFinalQuiz(t *testing.T) {
	f := newFixture(t)
	f.completeThroughAdaptation(t)
	f.writeClosingArtifacts(t, "B", "Cada réplica acepta el mismo registro.", "1/1")
	f.advanceOK(t, "exercises")
	f.advanceOK(t, "final_quiz")

	before := f.tryReadState(t)
	f.advanceExpectBlocked(t, "final", "all-stages-current", "after final_quiz")
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("rejected completion mutated state")
	}

	f.rescoreMap(t, "v1")
	f.statusExpect(t, "accepted")
	rep := f.advanceOK(t, "final")
	if rep.Status != "completed" {
		t.Fatalf("final status = %q, want completed", rep.Status)
	}
	f.statusExpect(t, "completed")

	f.rescoreMap(t, "v2")
	rep = f.statusExpect(t, "blocked")
	if c, _ := hasCheck(rep, "receipts-fresh"); !strings.Contains(c.Reason, "final") {
		t.Fatalf("receipts-fresh = %q, want stale final receipt", c.Reason)
	}
	f.advanceOK(t, "final")
	f.statusExpect(t, "completed")
}

// A re-scored plan that loses a mandatory section cannot complete.
func TestFinalRevalidatesRescoredPlan(t *testing.T) {
	f := newFixture(t)
	f.completeThroughAdaptation(t)
	f.writeClosingArtifacts(t, "B", "Cada réplica acepta el mismo registro.", "1/1")
	f.advanceOK(t, "exercises")
	f.advanceOK(t, "final_quiz")
	plan := string(f.read(t, "planificador.md"))
	broken := strings.Replace(plan, "## bibliografía", "## notas", 1)
	if broken == plan {
		t.Fatal("fixture bibliography heading not found")
	}
	f.write(t, "planificador.md", broken)
	f.rescoreMap(t, "v1")
	f.advanceExpectBlocked(t, "final", "rescored-planificador", "bibliografía")
}

// The map is a real dependency graph, not any file: an invalid map blocks
// planning and cannot complete the topic after the final re-score.
func TestPlanningRejectsInvalidMap(t *testing.T) {
	f := newFixture(t)
	p1 := partCfg{id: "p1", ex: true, vis: true, title: "Parte"}
	f.initOK(t)
	f.writePlan(t, p1)
	f.advanceOK(t, "preparation")
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6, p1))
	f.writeDiagAnswersFor(t, []partCfg{p1}, 2, 6)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades detectadas.", []string{"d3"}, p1)
	f.write(t, "mapa.mmd", "not a valid map\n")
	before := f.tryReadState(t)
	f.advanceExpectBlocked(t, "planning", "mapa-file", "graph")
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("rejected planning mutated state")
	}
}

func TestFinalRejectsInvalidRescoredMap(t *testing.T) {
	f := newFixture(t)
	f.completeThroughAdaptation(t)
	f.writeClosingArtifacts(t, "B", "Cada réplica acepta el mismo registro.", "1/1")
	f.advanceOK(t, "exercises")
	f.advanceOK(t, "final_quiz")
	f.rescoreMap(t, "v1")
	f.write(t, "mapa.mmd", "not a valid map; changed after final_quiz\n")
	before := f.tryReadState(t)
	f.advanceExpectBlocked(t, "final", "rescored-map", "graph")
	if string(f.tryReadState(t)) != string(before) {
		t.Fatal("rejected completion mutated state")
	}
}
