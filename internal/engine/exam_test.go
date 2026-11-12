package engine

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"learning/internal/rules"
)

func examRulesFile(t *testing.T, source string) string {
	t.Helper()
	raw, err := os.ReadFile(source)
	if err != nil {
		t.Fatalf("read rules %s: %v", source, err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("decode rules: %v", err)
	}
	thresholds := doc["thresholds"].(map[string]any)
	if _, ok := thresholds["exam"]; !ok {
		thresholds["exam"] = map[string]any{"formats": []any{"oral", "written", "practical"}, "minPartChars": float64(24)}
	}
	checks := doc["checks"].(map[string]any)
	addCheck := func(stage, id, kind, path string, receipt any) {
		list := checks[stage].([]any)
		for _, rawDecl := range list {
			if rawDecl.(map[string]any)["id"] == id {
				return
			}
		}
		decl := map[string]any{"id": id, "kind": kind, "path": path}
		if receipt != nil {
			decl["receipt"] = receipt
		}
		checks[stage] = append(list, decl)
	}
	addCheck("preparation", "exam-plan", "exam_plan", "plan.json", false)
	addCheck("planning", "exam-plan", "exam_plan", "plan.json", nil)
	addCheck("final_quiz", "exam-mock", "exam_mock", "cuestionario-final.json", nil)
	encoded, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "exam-rules.json")
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func examRulesFixture(t *testing.T) *fixture {
	t.Helper()
	f := newFixture(t)
	f.rules = examRulesFile(t, f.rulesPath())
	return f
}

func newExamFixture(t *testing.T) *fixture {
	t.Helper()
	f := examRulesFixture(t)
	if rep, code := f.run(t, f.opts("init", "")); code != 0 || rep.Status != "accepted" {
		t.Fatalf("init exam rules: status=%q exit=%d detail=%s", rep.Status, code, rep.Detail)
	}
	return f
}

func setExamState(t *testing.T, f *fixture, format, practice string) {
	t.Helper()
	state := f.state(t)
	state["scope"] = "pareto"
	exam := map[string]any{"format": format}
	if practice != "" {
		exam["practice"] = practice
	}
	state["exam"] = exam
	f.writeJSON(t, ".learning/state.json", state)
}

func patchPlanExam(t *testing.T, f *fixture, format, practice string, parts map[string]string) {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal(f.read(t, "plan.json"), &doc); err != nil {
		t.Fatalf("decode plan.json: %v", err)
	}
	if format == "" {
		delete(doc, "examen")
	} else {
		exam := map[string]any{"formato": format}
		if practice != "" {
			exam["practica"] = practice
		}
		doc["examen"] = exam
	}
	for _, rawPart := range doc["parts"].([]any) {
		part := rawPart.(map[string]any)
		if purpose := parts[part["id"].(string)]; purpose != "" {
			part["examen"] = purpose
		} else {
			delete(part, "examen")
		}
	}
	f.writeJSON(t, "plan.json", doc)
}

func writeExamPlan(t *testing.T, f *fixture, format, practice, purpose string) {
	t.Helper()
	f.writePlan(t, defaultParts()...)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80%")
	patchPlanExam(t, f, format, practice, map[string]string{"p1": purpose, "p2": purpose})
}

func TestExamRulesRequireValidThresholds(t *testing.T) {
	base := examRulesFile(t, productionRulesPath)
	if _, err := rules.Load(base); err != nil {
		t.Fatalf("valid exam rules rejected: %v", err)
	}
	mutate := func(t *testing.T, edit func(map[string]any)) string {
		t.Helper()
		raw, err := os.ReadFile(base)
		if err != nil {
			t.Fatal(err)
		}
		var doc map[string]any
		if err := json.Unmarshal(raw, &doc); err != nil {
			t.Fatal(err)
		}
		edit(doc)
		encoded, err := json.Marshal(doc)
		if err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(t.TempDir(), "invalid-exam-rules.json")
		if err := os.WriteFile(path, encoded, 0o644); err != nil {
			t.Fatal(err)
		}
		return path
	}
	cases := []struct {
		name string
		edit func(map[string]any)
		want string
	}{
		{"checks need thresholds", func(doc map[string]any) {
			delete(doc["thresholds"].(map[string]any), "exam")
		}, "needs the exam thresholds"},
		{"positive minimum", func(doc map[string]any) {
			doc["thresholds"].(map[string]any)["exam"].(map[string]any)["minPartChars"] = float64(0)
		}, "exam minPartChars must be positive"},
		{"nonempty formats", func(doc map[string]any) {
			doc["thresholds"].(map[string]any)["exam"].(map[string]any)["formats"] = []any{}
		}, "exam formats must not be empty"},
		{"supported formats", func(doc map[string]any) {
			doc["thresholds"].(map[string]any)["exam"].(map[string]any)["formats"] = []any{"oral", "screen"}
		}, `exam format "screen" is unsupported`},
		{"unique formats", func(doc map[string]any) {
			doc["thresholds"].(map[string]any)["exam"].(map[string]any)["formats"] = []any{"oral", "oral"}
		}, `exam formats must be unique (got "oral")`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := rules.Load(mutate(t, tc.edit))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("rules.Load error = %v, want message containing %q", err, tc.want)
			}
		})
	}
}

func TestExamPlanRejectsMissingMismatchedAndShortDeclarations(t *testing.T) {
	cases := []struct {
		name         string
		runFormat    string
		runPractice  string
		planFormat   string
		planPractice string
		p1Purpose    string
		p2Purpose    string
		want         string
	}{
		{"missing plan exam", "oral", "", "", "", strings.Repeat("o", 24), strings.Repeat("p", 24), "plan.json needs an examen object for this run"},
		{"wrong format", "oral", "", "written", "", strings.Repeat("o", 24), strings.Repeat("p", 24), `plan examen formato = "written", want "oral"`},
		{"short part purpose", "oral", "", "oral", "", strings.Repeat("o", 23), strings.Repeat("p", 24), "plan part p1 examen needs at least 24 characters (got 23)"},
		{"missing part purpose", "oral", "", "oral", "", "", strings.Repeat("p", 24), "plan part p1 examen needs at least 24 characters (got 0)"},
		{"wrong practical kind", "practical", "build an app", "practical", "build a lab", strings.Repeat("o", 24), strings.Repeat("p", 24), `plan examen practica = "build a lab", want "build an app"`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newExamFixture(t)
			setExamState(t, f, tc.runFormat, tc.runPractice)
			writeExamPlan(t, f, tc.planFormat, tc.planPractice, tc.p1Purpose)
			if tc.p2Purpose != "" {
				patchPlanExam(t, f, tc.planFormat, tc.planPractice, map[string]string{"p1": tc.p1Purpose, "p2": tc.p2Purpose})
			}
			before := f.tryReadState(t)
			rep, code := f.run(t, f.opts("advance", "preparation"))
			check, ok := hasCheck(rep, "exam-plan")
			if code != 1 || rep.Status != "blocked" || !ok || check.Status != "FAIL" || check.Reason != tc.want {
				t.Fatalf("advance preparation = status %q exit %d exam-plan %+v; want blocked/1 and exact reason %q (all checks %+v)", rep.Status, code, check, tc.want, rep.Checks)
			}
			if !bytes.Equal(before, f.tryReadState(t)) {
				t.Fatal("rejected exam plan changed state")
			}
		})
	}
}

func TestExamPlanPassesAtPreparationAndPlanning(t *testing.T) {
	f := newExamFixture(t)
	setExamState(t, f, "oral", "")
	writeExamPlan(t, f, "oral", "", strings.Repeat("oral-purpose-", 3))
	rep := f.advanceOK(t, "preparation")
	if check, ok := hasCheck(rep, "exam-plan"); !ok || check.Status != "PASS" {
		t.Fatalf("preparation exam-plan = %+v, want PASS", check)
	}
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6, defaultParts()...))
	f.writeDiagAnswersFor(t, defaultParts(), 2, 6)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades detectadas en consenso y en quórums.", []string{"d3"}, defaultParts()...)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80%")
	patchPlanExam(t, f, "oral", "", map[string]string{"p1": strings.Repeat("oral-purpose-", 3), "p2": strings.Repeat("oral-purpose-", 3)})
	rep, code := f.run(t, f.opts("advance", "planning"))
	check, ok := hasCheck(rep, "exam-plan")
	if code != 0 || rep.Status != "accepted" || !ok || check.Status != "PASS" {
		t.Fatalf("planning exam-plan = %+v, status %q exit %d; want PASS", check, rep.Status, code)
	}
}

func TestExamPlanMustSurvivePlanningRewrite(t *testing.T) {
	f := newExamFixture(t)
	setExamState(t, f, "oral", "")
	writeExamPlan(t, f, "oral", "", strings.Repeat("oral-purpose-", 3))
	f.advanceOK(t, "preparation")
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6, defaultParts()...))
	f.writeDiagAnswersFor(t, defaultParts(), 2, 6)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades detectadas en consenso y en quórums.", []string{"d3"}, defaultParts()...)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80%")
	before := f.tryReadState(t)
	rep, code := f.run(t, f.opts("advance", "planning"))
	check, ok := hasCheck(rep, "exam-plan")
	if code != 1 || rep.Status != "blocked" || !ok || check.Status != "FAIL" || check.Reason != "plan.json needs an examen object for this run" {
		t.Fatalf("planning exam-plan = %+v, status %q exit %d; want blocked/1 and dropped-plan failure", check, rep.Status, code)
	}
	if !bytes.Equal(before, f.tryReadState(t)) {
		t.Fatal("rejected planning rewrite changed state")
	}
}

func examQuestion(id, format, text, answer, typ, deliverable string) map[string]any {
	q := map[string]any{"id": id, "subtema": "T.p1", "nivel": "medio", "formato": format, "enunciado": text, "respuesta": answer}
	if typ != "" {
		q["tipo"] = typ
	}
	if deliverable != "" {
		q["entregable"] = deliverable
	}
	return q
}

func writeExamMock(t *testing.T, f *fixture, format string, questions []map[string]any, answers map[string]string) {
	t.Helper()
	f.writeJSON(t, "cuestionario-final.json", map[string]any{"formato": format, "questions": questions})
	f.writeJSON(t, "cuestionario-final.answers.json", map[string]any{"answers": answers})
	var body strings.Builder
	choiceCount, correct := 0, 0
	for _, q := range questions {
		id := q["id"].(string)
		if isMCQFormat(q["formato"].(string)) {
			choiceCount++
			if strings.EqualFold(norm(answers[id]), norm(q["respuesta"].(string))) {
				correct++
			}
		}
	}
	fmt.Fprintf(&body, "---\ntipo: cuestionario-final\nestado: completado\npuntaje: %d/%d\n---\n# Cuestionario final\n", correct, choiceCount)
	for _, q := range questions {
		fmt.Fprintf(&body, "\n## %s\n%s\n", q["id"], q["enunciado"])
	}
	f.write(t, "cuestionario-final.md", body.String())
}

func examClosingFixture(t *testing.T, format, practice, artifactFormat string, questions []map[string]any, answers map[string]string) *fixture {
	t.Helper()
	f := examRulesFixture(t)
	opts := f.opts("init", "")
	opts.Exam, opts.Practice = format, practice
	if rep, code := f.run(t, opts); code != 0 || rep.Status != "accepted" {
		t.Fatalf("init exam run: status=%q exit=%d detail=%s", rep.Status, code, rep.Detail)
	}
	p1 := partCfg{id: "p1", ex: true, vis: true, title: "Parte"}
	f.writePlan(t, p1)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80%")
	purpose := "Esta parte prepara cómo responder el examen con sus conceptos principales."
	patchPlanExam(t, f, format, practice, map[string]string{"p1": purpose})
	f.advanceOK(t, "preparation")
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6, p1))
	f.writeDiagAnswersFor(t, []partCfg{p1}, 2, 6)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades detectadas en consenso.", []string{"d3"}, p1)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80%")
	patchPlanExam(t, f, format, practice, map[string]string{"p1": purpose})
	f.advanceOK(t, "planning")
	f.writeVitalExplanation(t, "p1", true, "v1")
	f.advanceOK(t, "explanation")
	f.writeOwnWords(t, "p1")
	f.advanceOK(t, "own_words")
	f.writeQuizQuestions(t, "p1")
	f.writeQuizAnswers(t, "p1", 5)
	f.advanceOK(t, "quiz")
	f.writeFeedback(t, "p1", true)
	f.advanceOK(t, "feedback")
	f.writePlanWith(t, "Actualizada tras el feedback.", []string{"d3"}, p1)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80%")
	patchPlanExam(t, f, format, practice, map[string]string{"p1": purpose})
	f.advanceOK(t, "planning")
	f.advanceOK(t, "adaptation")
	f.advanceOK(t, "exercises")
	writeExamMock(t, f, artifactFormat, questions, answers)
	return f
}

func TestExamMockEnforcesFormatSpecificQuestionShape(t *testing.T) {
	cases := []struct {
		name      string
		stateForm string
		practice  string
		fileForm  string
		questions []map[string]any
		answers   map[string]string
		want      string
	}{
		{
			name: "written keeps the current mix", stateForm: "written", fileForm: "written",
			questions: []map[string]any{
				examQuestion("f1", "mcq", "¿Qué opción describe el resultado?", "B", "", ""),
				examQuestion("f2", "abierta", "Explica por qué funciona.", "", "", ""),
			}, answers: map[string]string{"f1": "B", "f2": "Respuesta abierta válida."},
		},
		{
			name: "format must match", stateForm: "oral", fileForm: "written",
			questions: []map[string]any{
				examQuestion("f1", "mcq", "¿Qué opción describe el resultado?", "B", "", ""),
				examQuestion("f2", "abierta", "Explica por qué funciona.", "", "", ""),
			}, answers: map[string]string{"f1": "B", "f2": "Respuesta abierta válida."},
			want: `cuestionario-final.json formato = "written", want "oral"`,
		},
		{
			name: "oral needs enough open questions", stateForm: "oral", fileForm: "oral",
			questions: []map[string]any{
				examQuestion("f1", "mcq", "¿Qué opción describe el resultado?", "B", "", ""),
				examQuestion("f2", "multiple choice", "¿Qué paso produce el resultado?", "C", "", ""),
				examQuestion("f3", "abierta", "Explica por qué funciona.", "", "", ""),
			}, answers: map[string]string{"f1": "B", "f2": "C", "f3": "Respuesta abierta válida."},
			want: "oral exam needs at least as many open questions as choice questions (1 open, 2 choice)",
		},
		{
			name: "practical needs a practice deliverable", stateForm: "practical", practice: "build an app", fileForm: "practical",
			questions: []map[string]any{
				examQuestion("f1", "mcq", "¿Qué opción describe el resultado?", "B", "", ""),
				examQuestion("f2", "abierta", "Construye una aplicación.", "", "", ""),
			}, answers: map[string]string{"f1": "B", "f2": "Respuesta aplicada válida."},
			want: `practical exam needs at least one question with tipo "practica" and a non-empty entregable`,
		},
		{
			name: "practical deliverable cannot be blank", stateForm: "practical", practice: "build an app", fileForm: "practical",
			questions: []map[string]any{
				examQuestion("f1", "mcq", "¿Qué opción describe el resultado?", "B", "", ""),
				examQuestion("f2", "abierta", "Construye una aplicación.", "", "practica", "  "),
			}, answers: map[string]string{"f1": "B", "f2": "Respuesta aplicada válida."},
			want: `practical exam needs at least one question with tipo "practica" and a non-empty entregable`,
		},
		{
			name: "practical accepted", stateForm: "practical", practice: "build an app", fileForm: "practical",
			questions: []map[string]any{
				examQuestion("f1", "mcq", "¿Qué opción describe el resultado?", "B", "", ""),
				examQuestion("f2", "abierta", "Construye una aplicación.", "", "practica", "Una aplicación que procesa la entrada y muestra el resultado."),
			}, answers: map[string]string{"f1": "B", "f2": "Respuesta aplicada válida."},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := examClosingFixture(t, tc.stateForm, tc.practice, tc.fileForm, tc.questions, tc.answers)
			before := f.tryReadState(t)
			rep, code := f.run(t, f.opts("advance", "final_quiz"))
			check, ok := hasCheck(rep, "exam-mock")
			if tc.want == "" {
				if code != 0 || rep.Status != "accepted" || !ok || check.Status != "PASS" {
					t.Fatalf("final exam-mock = %+v, status %q exit %d; want PASS", check, rep.Status, code)
				}
				return
			}
			if code != 1 || rep.Status != "blocked" || !ok || check.Status != "FAIL" || check.Reason != tc.want {
				t.Fatalf("final exam-mock = %+v, status %q exit %d; want blocked/1 and exact reason %q", check, rep.Status, code, tc.want)
			}
			if !bytes.Equal(before, f.tryReadState(t)) {
				t.Fatal("rejected mock exam changed state")
			}
		})
	}
}

func TestExamPlanSkipsForRunsWithoutExamIncludingLegacyState(t *testing.T) {
	f := newExamFixture(t)
	f.writePlan(t, defaultParts()...)
	preparation := f.advanceOK(t, "preparation")
	if check, ok := hasCheck(preparation, "exam-plan"); !ok || check.Status != "SKIP" {
		t.Fatalf("preparation exam-plan = %+v, want SKIP", check)
	}
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6, defaultParts()...))
	f.writeDiagAnswersFor(t, defaultParts(), 2, 6)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades detectadas.", []string{"d3"}, defaultParts()...)
	planning := f.advanceOK(t, "planning")
	if check, ok := hasCheck(planning, "exam-plan"); !ok || check.Status != "SKIP" {
		t.Fatalf("planning exam-plan = %+v, want SKIP", check)
	}
	state := f.state(t)
	if _, ok := state["exam"]; ok {
		t.Fatalf("legacy-shaped state unexpectedly gained exam: %v", state["exam"])
	}
	rep := f.statusExpect(t, "accepted")
	encoded, err := json.Marshal(rep)
	if err != nil {
		t.Fatal(err)
	}
	var report map[string]any
	if err := json.Unmarshal(encoded, &report); err != nil {
		t.Fatal(err)
	}
	if _, ok := report["exam"]; ok {
		t.Fatalf("status for a legacy state reports an exam: %v", report["exam"])
	}
}

func TestExamMockSkipsForRunsWithoutExam(t *testing.T) {
	f := examRulesFixture(t)
	f.completeThroughAdaptation(t)
	f.writeClosingArtifacts(t, "B", "Cada réplica termina aceptando el mismo registro.", "1/1")
	f.advanceOK(t, "exercises")
	rep := f.advanceOK(t, "final_quiz")
	if check, ok := hasCheck(rep, "exam-mock"); !ok || check.Status != "SKIP" {
		t.Fatalf("final exam-mock = %+v, want SKIP", check)
	}
}
