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

func setExamSource(t *testing.T, f *fixture, source string) {
	t.Helper()
	state := f.state(t)
	exam := state["exam"].(map[string]any)
	exam["source"] = source
	f.writeJSON(t, ".learning/state.json", state)
}

func patchPlanSourceStructure(t *testing.T, f *fixture, source string, structure []map[string]any) {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal(f.read(t, "plan.json"), &doc); err != nil {
		t.Fatalf("decode plan.json: %v", err)
	}
	exam := doc["examen"].(map[string]any)
	if source == "" {
		delete(exam, "fuente")
	} else {
		exam["fuente"] = source
	}
	if structure == nil {
		delete(exam, "estructura")
	} else {
		exam["estructura"] = structure
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
		{"positive practice minimum", func(doc map[string]any) {
			doc["thresholds"].(map[string]any)["exam"].(map[string]any)["minPracticePerPart"] = float64(0)
		}, "exam minPracticePerPart must be positive"},
		{"nonnegative practice minimum", func(doc map[string]any) {
			doc["thresholds"].(map[string]any)["exam"].(map[string]any)["minPracticePerPart"] = float64(-1)
		}, "exam minPracticePerPart must not be negative"},
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
		{"format case and whitespace mismatch", "oral", "", " ORAL ", "", strings.Repeat("o", 24), strings.Repeat("p", 24), `plan examen formato = " ORAL ", want "oral"`},

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

func TestExamPlanStillRequiresTheParetoPlan(t *testing.T) {
	f := newExamFixture(t)
	setExamState(t, f, "oral", "")
	f.writePlan(t, defaultParts()...)
	purpose := strings.Repeat("oral purpose ", 3)
	patchPlanExam(t, f, "oral", "", map[string]string{"p1": purpose, "p2": purpose})
	before := f.tryReadState(t)

	rep, code := f.run(t, f.opts("advance", "preparation"))
	pareto, hasPareto := hasCheck(rep, "pareto-plan")
	exam, hasExam := hasCheck(rep, "exam-plan")
	if code != 1 || rep.Status != "blocked" || !hasPareto || pareto.Status != "FAIL" || !hasExam || exam.Status != "PASS" {
		t.Fatalf("preparation checks = %+v, status %q exit %d; want Pareto FAIL and exam-plan PASS", rep.Checks, rep.Status, code)
	}
	if !bytes.Equal(before, f.tryReadState(t)) {
		t.Fatal("Pareto-rejected exam plan changed state")
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

func TestExamPlanDoesNotBypassTheParetoPartGate(t *testing.T) {
	f := newExamFixture(t)
	setExamState(t, f, "oral", "")
	purpose := strings.Repeat("oral purpose ", 3)
	writeExamPlan(t, f, "oral", "", purpose)
	f.advanceOK(t, "preparation")
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6, defaultParts()...))
	f.writeDiagAnswersFor(t, defaultParts(), 2, 6)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades detectadas en consenso y en quórums.", []string{"d3"}, defaultParts()...)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80%")
	patchPlanExam(t, f, "oral", "", map[string]string{"p1": purpose, "p2": purpose})
	f.advanceOK(t, "planning")
	f.writeVitalExplanation(t, "p1", false, "Relleno.")
	before := f.tryReadState(t)

	rep, code := f.run(t, f.opts("advance", "explanation"))
	check, ok := hasCheck(rep, "pareto-part")
	if code != 1 || rep.Status != "blocked" || !ok || check.Status != "FAIL" {
		t.Fatalf("exam explanation pareto-part = %+v, status %q exit %d checks %+v; want blocked/1 with Pareto failure", check, rep.Status, code, rep.Checks)
	}
	if !bytes.Equal(before, f.tryReadState(t)) {
		t.Fatal("Pareto-rejected exam part changed state")
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
	return examClosingFixtureWithSource(t, format, practice, artifactFormat, "", nil, questions, answers)
}

func examClosingFixtureWithSource(t *testing.T, format, practice, artifactFormat, source string, structure []map[string]any, questions []map[string]any, answers map[string]string) *fixture {
	t.Helper()
	f := examRulesFixture(t)
	opts := f.opts("init", "")
	opts.Exam, opts.Practice = format, practice
	if rep, code := f.run(t, opts); code != 0 || rep.Status != "accepted" {
		t.Fatalf("init exam run: status=%q exit=%d detail=%s", rep.Status, code, rep.Detail)
	}
	if source != "" {
		setExamSource(t, f, source)
	}
	p1 := partCfg{id: "p1", ex: true, vis: true, title: "Parte"}
	f.writePlan(t, p1)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80%")
	purpose := "Esta parte prepara cómo responder el examen con sus conceptos principales."
	patchPlanExam(t, f, format, practice, map[string]string{"p1": purpose})
	if source != "" || structure != nil {
		patchPlanSourceStructure(t, f, source, structure)
	}
	f.advanceOK(t, "preparation")
	f.writeDiagQuestions(t, buildDiagQuestions(6, 6, p1))
	f.writeDiagAnswersFor(t, []partCfg{p1}, 2, 6)
	f.advanceOK(t, "diagnosis")
	f.writePlanWith(t, "Dificultades detectadas en consenso.", []string{"d3"}, p1)
	f.patchPlanPareto(t, paretoBlock(), "la capacidad que rinde el 80%")
	patchPlanExam(t, f, format, practice, map[string]string{"p1": purpose})
	if source != "" || structure != nil {
		patchPlanSourceStructure(t, f, source, structure)
	}
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
	if source != "" || structure != nil {
		patchPlanSourceStructure(t, f, source, structure)
	}
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
			name: "questionnaire format is not case or whitespace folded", stateForm: "oral", fileForm: " oral ",
			questions: []map[string]any{
				examQuestion("f1", "mcq", "¿Qué opción describe el resultado?", "B", "", ""),
				examQuestion("f2", "abierta", "Explica por qué funciona.", "", "", ""),
			}, answers: map[string]string{"f1": "B", "f2": "Respuesta abierta válida."},
			want: `cuestionario-final.json formato = " oral ", want "oral"`,
		},
		{
			name: "oral accepts equality with case and whitespace around choice format", stateForm: "oral", fileForm: "oral",
			questions: []map[string]any{
				examQuestion("f1", " MCQ ", "¿Qué opción describe el resultado?", "B", "", ""),
				examQuestion("f2", "abierta", "Explica por qué funciona.", "", "", ""),
			}, answers: map[string]string{"f1": "B", "f2": "Respuesta abierta válida."},
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
			name: "practical deliverable rejects Unicode whitespace only", stateForm: "practical", practice: "build an app", fileForm: "practical",
			questions: []map[string]any{
				examQuestion("f1", "mcq", "¿Qué opción describe el resultado?", "B", "", ""),
				examQuestion("f2", "abierta", "Construye una aplicación.", "", "practica", "\u2003"),
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

func TestWrittenExamStillRequiresTheExistingMixedQuestionFormat(t *testing.T) {
	f := examClosingFixture(t, "written", "", "written", []map[string]any{
		examQuestion("f1", "mcq", "¿Qué opción describe el resultado?", "B", "", ""),
	}, map[string]string{"f1": "B"})
	before := f.tryReadState(t)

	rep, code := f.run(t, f.opts("advance", "final_quiz"))
	mock, hasMock := hasCheck(rep, "exam-mock")
	finalQuiz, hasFinalQuiz := hasCheck(rep, "final-quiz-note")
	if code != 1 || rep.Status != "blocked" || !hasMock || mock.Status != "PASS" || !hasFinalQuiz || finalQuiz.Status != "FAIL" || !strings.Contains(finalQuiz.Reason, "both choice and open questions") {
		t.Fatalf("written final quiz checks = %+v, status %q exit %d; want exam-mock PASS and existing mixed-format failure", rep.Checks, rep.Status, code)
	}
	if !bytes.Equal(before, f.tryReadState(t)) {
		t.Fatal("written exam without the question mix changed state")
	}
}

func TestExamPlanSkipsForRunsWithoutExamIncludingLegacyState(t *testing.T) {
	f := newExamFixture(t)
	legacy := f.state(t)
	delete(legacy, "scope")
	delete(legacy, "exam")
	f.writeJSON(t, ".learning/state.json", legacy)
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
	if _, ok := state["scope"]; ok {
		t.Fatalf("legacy-shaped state unexpectedly gained scope: %v", state["scope"])
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
	if report["scope"] != "complete" {
		t.Fatalf("status for a legacy state reports scope %v, want complete", report["scope"])
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

func examPracticeCheckForTest(t *testing.T, f *fixture, stage string, exam *Exam) (Check, bool) {
	t.Helper()
	r, err := rules.Load(productionRulesPath)
	if err != nil {
		t.Fatalf("load production rules: %v", err)
	}
	f.writePlan(t, partCfg{id: "p1", title: "Parte"})
	st := &State{Scope: scopePareto, Exam: exam}
	if exam == nil {
		st.Scope = scopeComplete
	}
	result := evalStage(r, st, f.ws, stage, "p1")
	return hasCheck(Report{Checks: result.checks}, "exam-practice")
}

func TestExamPracticeRunsAtEveryPartStage(t *testing.T) {
	r, err := rules.Load(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, stage := range r.PartStages {
		t.Run(stage, func(t *testing.T) {
			f := newFixture(t)
			f.writeJSON(t, "practica/p1.json", map[string]any{"exercises": []any{
				map[string]any{"id": "app-1", "enunciado": "Construye una aplicación.", "entregable": "Aplicación ejecutable.", "solucion": "Implementa la entrada y salida."},
				map[string]any{"id": "app-2", "enunciado": "Valida otra entrada.", "entregable": "Prueba automatizada.", "solucion": "Comprueba los casos límite."},
			}})
			check, ok := examPracticeCheckForTest(t, f, stage, &Exam{Format: "practical"})
			if !ok || check.Status != "PASS" {
				t.Fatalf("%s exam-practice = %+v, present=%t; want PASS", stage, check, ok)
			}
		})
	}
}

func TestExamPracticeCountsCodeExercises(t *testing.T) {
	f := newFixture(t)
	f.writeJSON(t, "practica/p1.json", map[string]any{"exercises": []any{
		map[string]any{"id": "app-1", "enunciado": "Construye una aplicación.", "entregable": "Aplicación ejecutable.", "solucion": "Implementa la entrada y salida."},
	}})
	f.writeJSON(t, "codigo/app-check/ejercicio.json", map[string]any{
		"parte": "p1", "enunciado": "Implementa la validación de entrada.",
	})
	f.writeJSON(t, "codigo/other-part/ejercicio.json", map[string]any{
		"parte": "p2", "enunciado": "Este ejercicio pertenece a otra parte.",
	})
	check, ok := examPracticeCheckForTest(t, f, "explanation", &Exam{Format: "practical"})
	if !ok || check.Status != "PASS" {
		t.Fatalf("exam-practice = %+v, present=%t; want PASS counting the matching code exercise", check, ok)
	}
}

func TestExamPracticeRejectsInsufficientOrInvalidSources(t *testing.T) {
	valid := `{"id":"app-1","enunciado":"Construye una aplicación.","entregable":"Aplicación ejecutable.","solucion":"Implementa la entrada y salida."}`
	cases := []struct {
		name string
		file string
		want string
	}{
		{"missing sources", "", "part p1 needs at least 2 practical exercises: practica/p1.json is missing and no matching codigo/<id>/ejercicio.json was found"},
		{"too few exercises", `{"exercises":[` + valid + `]}`, "part p1 has 1 practical exercise in practica/p1.json and 0 matching codigo/<id>/ejercicio.json files; need at least 2"},
		{"empty solution", `{"exercises":[{"id":"app-1","enunciado":"Construye una aplicación.","entregable":"Aplicación ejecutable.","solucion":"  "},{"id":"app-2","enunciado":"Valida otra entrada.","entregable":"Prueba automatizada.","solucion":"Comprueba los casos límite."}]}`, `part p1: practica/p1.json exercise "app-1" has an empty solucion`},
		{"empty statement", `{"exercises":[{"id":"app-1","enunciado":"  ","entregable":"Aplicación ejecutable.","solucion":"Implementa la entrada y salida."},{"id":"app-2","enunciado":"Valida otra entrada.","entregable":"Prueba automatizada.","solucion":"Comprueba los casos límite."}]}`, `part p1: practica/p1.json exercise "app-1" has an empty enunciado`},
		{"empty deliverable", `{"exercises":[{"id":"app-1","enunciado":"Construye una aplicación.","entregable":"  ","solucion":"Implementa la entrada y salida."},{"id":"app-2","enunciado":"Valida otra entrada.","entregable":"Prueba automatizada.","solucion":"Comprueba los casos límite."}]}`, `part p1: practica/p1.json exercise "app-1" has an empty entregable`},
		{"duplicate id", `{"exercises":[` + valid + `,` + valid + `]}`, `part p1: practica/p1.json repeats exercise id "app-1"`},
		{"unsafe id", `{"exercises":[{"id":"../outside","enunciado":"Construye una aplicación.","entregable":"Aplicación ejecutable.","solucion":"Implementa la entrada y salida."},{"id":"app-2","enunciado":"Valida otra entrada.","entregable":"Prueba automatizada.","solucion":"Comprueba los casos límite."}]}`, `part p1: practica/p1.json exercise 1 id "../outside" is not a safe ID`},
		{"malformed JSON", `{"exercises":[`, "part p1: practica/p1.json is not valid JSON; repair the exercise JSON"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			if tc.file != "" {
				f.write(t, "practica/p1.json", tc.file)
			}
			check, ok := examPracticeCheckForTest(t, f, "explanation", &Exam{Format: "practical"})
			if !ok || check.Status != "FAIL" || check.Reason != tc.want {
				t.Fatalf("exam-practice = %+v, present=%t; want FAIL with exact reason %q", check, ok, tc.want)
			}
		})
	}
}

func TestExamPracticeOnlyCountsCodeExercisesForTheCurrentPart(t *testing.T) {
	cases := []struct {
		name      string
		parte     string
		enunciado string
		want      string
	}{
		{"other part", "p2", "Este ejercicio pertenece a otra parte.", "part p1 needs at least 2 practical exercises: practica/p1.json is missing and no matching codigo/<id>/ejercicio.json was found"},
		{"empty statement", "p1", "  ", "part p1 has no file practica/p1.json and 0 matching codigo/<id>/ejercicio.json files; codigo/app/ejercicio.json has an empty enunciado; need at least 2"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			f.writeJSON(t, "codigo/app/ejercicio.json", map[string]any{
				"parte": tc.parte, "enunciado": tc.enunciado,
			})
			check, ok := examPracticeCheckForTest(t, f, "explanation", &Exam{Format: "practical"})
			if !ok || check.Status != "FAIL" || check.Reason != tc.want {
				t.Fatalf("exam-practice = %+v, present=%t; want FAIL with exact reason %q", check, ok, tc.want)
			}
		})
	}
}

func TestExamPlanRequiresSourceAndStructureDeclarations(t *testing.T) {
	validStructure := []map[string]any{{"tipo": "abierta", "cantidad": float64(2)}}
	cases := []struct {
		name       string
		fuente     string
		estructura []map[string]any
		want       string
	}{
		{"missing fuente", "", validStructure, `plan examen fuente is missing, want "fuentes/parcial.pdf"`},
		{"mismatched fuente", "fuentes/otro.pdf", validStructure, `plan examen fuente = "fuentes/otro.pdf", want "fuentes/parcial.pdf"`},
		{"missing estructura", "fuentes/parcial.pdf", nil, "plan examen estructura needs at least one item"},
		{"bad cantidad", "fuentes/parcial.pdf", []map[string]any{{"tipo": "abierta", "cantidad": float64(0)}}, `plan examen estructura tipo "abierta" cantidad must be at least 1 (got 0)`},
		{"duplicate tipo", "fuentes/parcial.pdf", []map[string]any{{"tipo": "abierta", "cantidad": float64(1)}, {"tipo": "abierta", "cantidad": float64(2)}}, `plan examen estructura repeats tipo "abierta"`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newExamFixture(t)
			setExamState(t, f, "oral", "")
			setExamSource(t, f, "fuentes/parcial.pdf")
			writeExamPlan(t, f, "oral", "", strings.Repeat("oral-purpose-", 3))
			patchPlanSourceStructure(t, f, tc.fuente, tc.estructura)
			before := f.tryReadState(t)

			rep, code := f.run(t, f.opts("advance", "preparation"))
			check, ok := hasCheck(rep, "exam-plan")
			if code != 1 || rep.Status != "blocked" || !ok || check.Status != "FAIL" || check.Reason != tc.want {
				t.Fatalf("exam-plan = %+v, status %q exit %d; want exact reason %q", check, rep.Status, code, tc.want)
			}
			if !bytes.Equal(before, f.tryReadState(t)) {
				t.Fatal("rejected source plan changed state")
			}
		})
	}
}

func TestExamPlanWithoutSourceAllowsOptionalStructure(t *testing.T) {
	f := newExamFixture(t)
	setExamState(t, f, "oral", "")
	writeExamPlan(t, f, "oral", "", strings.Repeat("oral-purpose-", 3))
	patchPlanSourceStructure(t, f, "", []map[string]any{{"tipo": "abierta", "cantidad": float64(2)}})

	rep, code := f.run(t, f.opts("advance", "preparation"))
	check, ok := hasCheck(rep, "exam-plan")
	if code != 0 || rep.Status != "accepted" || !ok || check.Status != "PASS" {
		t.Fatalf("exam-plan = %+v, status %q exit %d; optional structure without source must not change behavior", check, rep.Status, code)
	}
}

func TestExamMockMatchesTheRealQuestionStructure(t *testing.T) {
	questions := []map[string]any{
		examQuestion("f1", "mcq", "¿Qué opción describe el resultado?", "B", "seleccion", ""),
		examQuestion("f2", "abierta", "Explica por qué funciona.", "", "desarrollo", ""),
		examQuestion("f3", "abierta", "Analiza el caso límite.", "", "otro", ""),
	}
	answers := map[string]string{"f1": "B", "f2": "Respuesta abierta válida.", "f3": "Respuesta aplicada válida."}
	cases := []struct {
		name       string
		estructura []map[string]any
		want       string
	}{
		{
			name: "matching type counts",
			estructura: []map[string]any{
				{"tipo": "seleccion", "cantidad": float64(1)},
				{"tipo": "desarrollo", "cantidad": float64(1)},
				{"tipo": "otro", "cantidad": float64(1)},
			},
		},
		{
			name: "all missing, short and unexpected kinds are listed",
			estructura: []map[string]any{
				{"tipo": "seleccion", "cantidad": float64(1)},
				{"tipo": "desarrollo", "cantidad": float64(2)},
				{"tipo": "esperada", "cantidad": float64(1)},
			},
			want: `cuestionario-final.json estructura differs from plan: tipo "desarrollo" has 1, want 2; tipo "esperada" has 0, want 1; tipo "otro" has 1, want 0`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := examClosingFixtureWithSource(t, "written", "", "written", "fuentes/parcial.pdf", tc.estructura, questions, answers)
			before := f.tryReadState(t)

			rep, code := f.run(t, f.opts("advance", "final_quiz"))
			check, ok := hasCheck(rep, "exam-mock")
			if tc.want == "" {
				if code != 0 || rep.Status != "accepted" || !ok || check.Status != "PASS" {
					t.Fatalf("exam-mock = %+v, status %q exit %d; want PASS", check, rep.Status, code)
				}
				return
			}
			if code != 1 || rep.Status != "blocked" || !ok || check.Status != "FAIL" || check.Reason != tc.want {
				t.Fatalf("exam-mock = %+v, status %q exit %d; want exact reason %q", check, rep.Status, code, tc.want)
			}
			if !bytes.Equal(before, f.tryReadState(t)) {
				t.Fatal("rejected source mock changed state")
			}
		})
	}
}

func TestExamMockWithoutSourceIgnoresOptionalStructure(t *testing.T) {
	questions := []map[string]any{
		examQuestion("f1", "mcq", "¿Qué opción describe el resultado?", "B", "seleccion", ""),
		examQuestion("f2", "abierta", "Explica por qué funciona.", "", "desarrollo", ""),
	}
	answers := map[string]string{"f1": "B", "f2": "Respuesta abierta válida."}
	structure := []map[string]any{{"tipo": "no-presente", "cantidad": float64(3)}}
	f := examClosingFixtureWithSource(t, "written", "", "written", "", structure, questions, answers)

	rep, code := f.run(t, f.opts("advance", "final_quiz"))
	check, ok := hasCheck(rep, "exam-mock")
	if code != 0 || rep.Status != "accepted" || !ok || check.Status != "PASS" {
		t.Fatalf("exam-mock = %+v, status %q exit %d; no-source behavior must ignore optional structure", check, rep.Status, code)
	}
}

func TestExamPracticeSkipsOutsidePracticalExamRuns(t *testing.T) {
	cases := []struct {
		name string
		exam *Exam
		want string
	}{
		{"non-exam", nil, "run has no declared exam format"},
		{"oral", &Exam{Format: "oral"}, `exam format "oral" does not require practical part exercises`},
		{"written", &Exam{Format: "written"}, `exam format "written" does not require practical part exercises`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			check, ok := examPracticeCheckForTest(t, f, "explanation", tc.exam)
			if !ok || check.Status != "SKIP" || check.Reason != tc.want {
				t.Fatalf("exam-practice = %+v, present=%t; want SKIP with exact reason %q", check, ok, tc.want)
			}
			if tc.exam == nil {
				r, err := rules.Load(productionRulesPath)
				if err != nil {
					t.Fatal(err)
				}
				var decl rules.CheckDecl
				for _, candidate := range r.Checks["explanation"] {
					if candidate.ID == "exam-practice" {
						decl = candidate
						break
					}
				}
				r.Checks = map[string][]rules.CheckDecl{"explanation": {decl}}
				r.Conditions = nil
				if _, err := buildReceipts(r, f.ws, "explanation", "p1"); err != nil {
					t.Fatalf("non-exam stage receipt required the skipped practical artifact: %v", err)
				}
			}
		})
	}
}
