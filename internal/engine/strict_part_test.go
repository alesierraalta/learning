package engine

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

// strictReady enrolls a strict-flow topic and plans it (method preferencias).
func strictReady(t *testing.T, parts ...partCfg) *fixture {
	t.Helper()
	f := newFixture(t)
	f.rules = strictRulesFile(t)
	if len(parts) == 0 {
		parts = defaultParts()
	}
	f.readyParts(t, parts, 2)
	return f
}

// writeVuelco records the tutor's verdict on the learner's own words for one part.
func (f *fixture) writeVuelco(t *testing.T, part string, understood bool, evidence string) {
	t.Helper()
	f.writeJSON(t, "vuelco/"+part+".json", map[string]any{"entendio": understood, "evidencia": evidence})
}

// passQuiz writes and passes the part's mini-quiz (5/5).
func (f *fixture) passQuiz(t *testing.T, part string) {
	t.Helper()
	f.writeQuizQuestions(t, part)
	f.writeQuizAnswers(t, part, 5)
	f.advanceOK(t, "quiz")
}

// addRemedial inserts a remedial part into plan.json right after the part `after`,
// touching nothing else: the tutor declares it without replanning.
func (f *fixture) addRemedial(t *testing.T, id, after, remedia, analisis, title string) {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal(f.read(t, "plan.json"), &doc); err != nil {
		t.Fatal(err)
	}
	var parts []any
	for _, raw := range doc["parts"].([]any) {
		parts = append(parts, raw)
		if raw.(map[string]any)["id"] == after {
			parts = append(parts, map[string]any{
				"id": id, "title": title, "slug": id, "subtema": "T." + id,
				"examplesPlanned": true, "visualsPlanned": true, "remedia": remedia, "analisis": analisis,
			})
		}
	}
	doc["parts"] = parts
	f.writeJSON(t, "plan.json", doc)
}

// setAnalisis rewrites the analysis a remedial part declares.
func (f *fixture) setAnalisis(t *testing.T, id, analisis string) {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal(f.read(t, "plan.json"), &doc); err != nil {
		t.Fatal(err)
	}
	for _, raw := range doc["parts"].([]any) {
		if p := raw.(map[string]any); p["id"] == id {
			p["analisis"] = analisis
		}
	}
	f.writeJSON(t, "plan.json", doc)
}

// writeFreshQuiz writes a remedial mini-quiz whose questions are new, and the
// explanation that carries them.
func (f *fixture) writeFreshQuiz(t *testing.T, part, variant string) {
	t.Helper()
	qs := buildQuizQuestions(part)
	for i := range qs {
		qs[i].Enunciado = "¿Qué cambia en el caso " + variant + " número " + itoa(i+1) + "?"
	}
	f.writeJSON(t, "mini-quiz/"+part+".json", map[string]any{"questions": qs})
	body := "---\ntipo: explicacion\nnodo: T." + part + "\nnivel: medio\n---\n# " + part + "\n\nRefuerzo de la carencia detectada con un caso nuevo. " + variant +
		"\n\n## Ejemplo\n\nCaso numérico paso a paso.\n\n**Fuente**: Sutton & Barto, verificación de fixture.\n\n## Mini-quiz\n" +
		"\n![diagrama](diagrama-" + part + ".png)\nCómo leerlo: sigue los pasos de izquierda a derecha.\n\n![detalle](detalle-" + part + ".png)\nCómo leerlo: compara las dos barras.\n"
	for _, q := range qs {
		body += "\n" + q.Enunciado + "\n"
	}
	rel := f.canonicalPartFile(t, part)
	f.write(t, rel, body)
	f.linkPartInIndex(t, rel)
	// Inserted parts shift the numbering: the tutor rewrites the index; here the
	// part is appended when it has no line yet.
	target := strings.TrimSuffix(rel, ".md")
	if index := string(f.read(t, "explicacion.md")); !strings.Contains(index, "[["+target+"|") {
		f.write(t, "explicacion.md", strings.TrimRight(index, "\n")+"\n- [["+target+"|"+strings.TrimPrefix(target, "explicaciones/")+"]] — 🔓 abierta\n")
	}
}

func nextOf(t *testing.T, f *fixture) (string, string) {
	t.Helper()
	rep, _ := f.run(t, f.opts("status", ""))
	return rep.NextStage, rep.Part
}

// S4: explanation → mini-quiz → own words.
func TestStrictPartTakesTheQuizBeforeTheOwnWords(t *testing.T) {
	f := strictReady(t)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	if stage, part := nextOf(t, f); stage != "quiz" || part != "p1" {
		t.Fatalf("after the explanation next = %s/%s, want quiz/p1", stage, part)
	}
	f.passQuiz(t, "p1")
	if stage, _ := nextOf(t, f); stage != "own_words" {
		t.Fatalf("after the quiz next = %s, want own_words", stage)
	}
}

// S5: own words close only with the tutor's recorded verdict and its evidence.
func TestStrictOwnWordsNeedTheTutorsVerdict(t *testing.T) {
	f := strictReady(t)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.passQuiz(t, "p1")
	f.writeOwnWords(t, "p1")
	before := f.stateBytes(t)
	f.advanceExpectBlocked(t, "own_words", "own-words-verdict", "vuelco/p1.json")
	f.writeVuelco(t, "p1", true, "")
	f.advanceExpectBlocked(t, "own_words", "own-words-verdict", "evidencia")
	if !bytes.Equal(before, f.stateBytes(t)) {
		t.Fatal("a refused own-words advance changed the state")
	}
	f.writeVuelco(t, "p1", true, "Explicó la réplica con su propio ejemplo y el porqué del quórum.")
	f.advanceOK(t, "own_words")
	if stage, _ := nextOf(t, f); stage != "feedback" {
		t.Fatalf("after understood own words next = %s, want feedback", stage)
	}
}

// S5/S6: a passed quiz with own words that show no understanding fails the part.
func TestStrictOwnWordsWithoutUnderstandingFailTheParts(t *testing.T) {
	f := strictReady(t)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.passQuiz(t, "p1")
	f.writeOwnWords(t, "p1")
	f.writeVuelco(t, "p1", false, "Repite la definición pero confunde réplica con respaldo.")
	f.advanceOK(t, "own_words")
	if stage, part := nextOf(t, f); stage != "remedial" || part != "p1" {
		t.Fatalf("after own words without understanding next = %s/%s, want remedial/p1", stage, part)
	}
}

// S6/S7: a failed quiz owes an analysed remedial part with a quiz that differs from
// every earlier attempt; nothing else moves until it exists; there is no retry cap.
func TestStrictFailedQuizOwesARemedialPartWithAFreshQuiz(t *testing.T) {
	f := strictReady(t)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 2)
	rep := f.advanceOK(t, "quiz")
	if rep.NextStage != "remedial" || rep.Part != "p1" {
		t.Fatalf("failed quiz next = %s/%s, want remedial/p1", rep.NextStage, rep.Part)
	}
	before := f.stateBytes(t)
	f.advanceExpectBlocked(t, "explanation", "remedial-part", "remedia")
	if !bytes.Equal(before, f.stateBytes(t)) {
		t.Fatal("advancing past an owed remedial part changed the state")
	}

	// A remedial part needs the analysis of why the learner failed.
	f.addRemedial(t, "p1r1", "p1", "p1", "", "Refuerzo")
	if stage, part := nextOf(t, f); stage != "explanation" || part != "p1r1" {
		t.Fatalf("with a declared remedial part next = %s/%s, want explanation/p1r1", stage, part)
	}
	f.writeFreshQuiz(t, "p1r1", "A")
	f.advanceExpectBlocked(t, "explanation", "remedial-analysis", "analisis")
	f.setAnalisis(t, "p1r1", "Acertó la definición pero falló los dos casos de quórum: no divide la mayoría.")
	f.advanceOK(t, "explanation")

	// The same questions again are refused: the quiz must differ.
	f.writeQuizQuestions(t, "p1r1")
	f.writeQuizAnswers(t, "p1r1", 5)
	f.advanceExpectBlocked(t, "quiz", "fresh-quiz", "q1")

	// A fresh quiz failed again owes another remedial part: no cap.
	f.writeFreshQuiz(t, "p1r1", "A")
	f.writeQuizAnswers(t, "p1r1", 1)
	if rep := f.advanceOK(t, "quiz"); rep.NextStage != "remedial" || rep.Part != "p1r1" {
		t.Fatalf("failed remedial quiz next = %s/%s, want remedial/p1r1", rep.NextStage, rep.Part)
	}
	f.addRemedial(t, "p1r2", "p1r1", "p1", "Sigue sin dividir: el quórum se cuenta, no se estima. Caso con números pequeños.", "Segundo refuerzo")
	f.writeFreshQuiz(t, "p1r2", "A")
	f.advanceOK(t, "explanation")
	f.writeQuizAnswers(t, "p1r2", 5)
	f.advanceExpectBlocked(t, "quiz", "fresh-quiz", "q1")
	// The explanation carries its quiz, so a new quiz re-opens the explanation.
	f.writeFreshQuiz(t, "p1r2", "B")
	f.advanceOK(t, "explanation")
	f.writeQuizAnswers(t, "p1r2", 5)
	f.advanceOK(t, "quiz")
	if stage, part := nextOf(t, f); stage != "own_words" || part != "p1r2" {
		t.Fatalf("passed remedial quiz next = %s/%s, want own_words/p1r2", stage, part)
	}
	st := f.state(t)
	order := st["partOrder"].([]any)
	if strings.Join([]string{order[0].(string), order[1].(string), order[2].(string), order[3].(string)}, ",") != "p1,p1r1,p1r2,p2" {
		t.Fatalf("partOrder = %v, want p1,p1r1,p1r2,p2", order)
	}
}

// S8: a topic whose rules snapshot predates the strict flow keeps its order and re-teach.
func TestSnapshotWithoutStrictFlowKeepsOwnWordsBeforeTheQuiz(t *testing.T) {
	f := newFixture(t)
	f.readyThroughPlanning(t, 2, 6)
	f.writeExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	if stage, _ := nextOf(t, f); stage != "own_words" {
		t.Fatalf("old snapshot next = %s, want own_words", stage)
	}
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 2)
	if rep := f.advanceOK(t, "quiz"); rep.NextStage != "explanation" {
		t.Fatalf("old snapshot failed quiz next = %s, want explanation (re-teach)", rep.NextStage)
	}
}
