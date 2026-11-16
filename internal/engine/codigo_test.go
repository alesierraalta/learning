package engine

import (
	"encoding/json"
	"strings"
	"testing"

	"learning/internal/rules"
)

// plsqlFlat is the PA_Reportes package with its statements run into one line of prose: the shape #332 refuses.
const plsqlFlat = "CREATE OR REPLACE PACKAGE PA_Reportes AS PROCEDURE mostrar_cliente(p_id NUMBER); PROCEDURE mostrar_cliente; END PA_Reportes;"

// plsqlFenced is the same package written as the tutor must write it: a fenced block that keeps its lines.
const plsqlFenced = "```plsql\nCREATE OR REPLACE PACKAGE PA_Reportes AS\n  PROCEDURE mostrar_cliente(p_id NUMBER);\n  PROCEDURE mostrar_cliente;\nEND PA_Reportes;\n```"

func codigoRules(t *testing.T, path string) rules.Thresholds {
	t.Helper()
	r, err := rules.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	return r.Thresholds
}

func TestCodeInProseNamesCodeFlattenedIntoProse(t *testing.T) {
	cases := []struct {
		name      string
		text      string
		flattened bool
	}{
		{"plsql statements run into one line", "¿Qué imprime? " + plsqlFlat, true},
		{"begin and end on one line", "¿Qué pasa con BEGIN NULL; END;?", true},
		{"three keywords in sequence", "¿Qué devuelve SELECT id FROM clientes WHERE id = 1?", true},
		{"assignments run into one line", "Si x := 1; y := x + 1; ¿cuánto vale y?", true},
		{"fenced code keeps its lines", "¿Qué imprime?\n" + plsqlFenced, false},
		{"fence then prose", "```sql\nSELECT id FROM clientes WHERE id = 1;\n```\n¿Qué devuelve la consulta?", false},
		{"unclosed fence is code to its end", "```sql\nSELECT id FROM clientes WHERE id = 1;", false},
		{"prose with semicolons", "Explica la regla; luego indica el caso; por último, el coste.", false},
		{"one statement is not refused", "¿Qué devuelve SELECT * FROM clientes?", false},
		{"clauses named as words", "¿Qué cláusula filtra filas, WHERE o HAVING?", false},
		{"plain question", "¿Cuál es la diferencia entre un índice y una clave primaria?", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := codeInProse(tc.text)
			if (got != "") != tc.flattened {
				t.Fatalf("codeInProse(%q) = %q, want flattened=%v", tc.text, got, tc.flattened)
			}
		})
	}
}

func TestCodeInProseRefusesStemAndOptionsByIDOnlyWhereDeclared(t *testing.T) {
	declared := rules.Thresholds{CodigoEnLinea: true}
	err := checkCodeInProse("d2", declared, "¿Qué imprime?", plsqlFlat)
	if err == nil || !strings.Contains(err.Error(), "codigo-en-linea") || !strings.Contains(err.Error(), "d2") {
		t.Fatalf("a flattened stem must be refused by rule and id, got %v", err)
	}
	err = checkCodeInProse("c1", declared, "¿Qué hace?", "A", "BEGIN NULL; END;")
	if err == nil || !strings.Contains(err.Error(), "c1") {
		t.Fatalf("a flattened option must be refused by its question id, got %v", err)
	}
	if err := checkCodeInProse("d2", declared, "¿Qué imprime?", plsqlFenced); err != nil {
		t.Fatalf("fenced code is not refused: %v", err)
	}
	// A frozen snapshot never declared the rule, so the questions it accepted stay accepted.
	if err := checkCodeInProse("d2", rules.Thresholds{}, "¿Qué imprime?", plsqlFlat); err != nil {
		t.Fatalf("an undeclared rule refuses nothing: %v", err)
	}
}

func diagFixtureQuestion(id, enunciado string) diagQuestion {
	return diagQuestion{
		ID: id, Type: "topic", Level: 1, Subtema: "T.p1", Nivel: "básico", Enunciado: enunciado,
		Pieza:   pieza{Tipo: "codigo", Lenguaje: "plsql", Contenido: "CREATE OR REPLACE PACKAGE PA_Reportes AS\n  PROCEDURE mostrar_cliente;\nEND PA_Reportes;"},
		Options: optionSet(), Answer: "B",
	}
}

func TestDiagnosisQuestionRefusesCodeFlattenedIntoItsStem(t *testing.T) {
	planSubs := map[string]bool{"T.p1": true}
	production := codigoRules(t, productionRulesPath)
	flat := diagFixtureQuestion("d2", "¿Cómo resuelve el motor PL/SQL la invocación? "+plsqlFlat)
	err := validateDiagQuestion(flat, map[string]bool{}, planSubs, production)
	if err == nil || !strings.Contains(err.Error(), "codigo-en-linea") || !strings.Contains(err.Error(), "d2") {
		t.Fatalf("the production rules must refuse the flattened stem by rule and id, got %v", err)
	}

	fenced := diagFixtureQuestion("d2", "¿Cómo resuelve el motor PL/SQL la invocación?\n"+plsqlFenced)
	if err := validateDiagQuestion(fenced, map[string]bool{}, planSubs, production); err != nil {
		t.Fatalf("the same code in a fence is accepted: %v", err)
	}
}

func TestFrozenDiagnosisSnapshotKeepsAcceptingTheQuestionsItAccepted(t *testing.T) {
	planSubs := map[string]bool{"T.p1": true}
	frozen := codigoRules(t, repoRulesPath)
	flat := diagFixtureQuestion("d2", "¿Cómo resuelve el motor PL/SQL la invocación? "+plsqlFlat)
	if err := validateDiagQuestion(flat, map[string]bool{}, planSubs, frozen); err != nil {
		t.Fatalf("a run started before #332 keeps its rules: %v", err)
	}
}

func quizFixtureQuestion(id, enunciado, answer string) quizQuestion {
	return quizQuestion{ID: id, Subtema: "T.p1", Nivel: "básico", Enunciado: enunciado, Options: optionSet(), Answer: answer}
}

func TestMiniQuizRefusesCodeFlattenedIntoAnOption(t *testing.T) {
	th := codigoRules(t, repoRulesPath)
	th.CodigoEnLinea = true
	planSubs := map[string]bool{"T.p1": true}
	qs := []quizQuestion{
		quizFixtureQuestion("q1", "¿Qué hace el bloque?", "B"),
		quizFixtureQuestion("q2", "¿Qué devuelve la consulta?", "D"),
		quizFixtureQuestion("q3", "¿Cuál es la clave?", "A"),
		quizFixtureQuestion("q4", "¿Qué pasa al borrar?", "C"),
		quizFixtureQuestion("q5", "¿Qué es un índice?", "B"),
	}
	qs[1].Options["C"] = "SELECT id FROM clientes WHERE id = 1"
	err := validateQuizQuestions(qs, "T.p1", planSubs, th)
	if err == nil || !strings.Contains(err.Error(), "codigo-en-linea") || !strings.Contains(err.Error(), "q2") {
		t.Fatalf("a mini-quiz option carrying flattened code is refused by rule and id, got %v", err)
	}
	th.CodigoEnLinea = false
	if err := validateQuizQuestions(qs, "T.p1", planSubs, th); err != nil {
		t.Fatalf("a frozen mini-quiz keeps accepting its questions: %v", err)
	}
}

func TestFinalQuestionnaireRefusesCodeFlattenedIntoAStem(t *testing.T) {
	qs := []finalQuestion{
		{ID: "f1", Enunciado: "Explica la regla de la transacción."},
		{ID: "f2", Enunciado: "¿Qué imprime el bloque? " + plsqlFlat},
	}
	err := finalCodeInProse(qs, rules.Thresholds{CodigoEnLinea: true})
	if err == nil || !strings.Contains(err.Error(), "codigo-en-linea") || !strings.Contains(err.Error(), "f2") {
		t.Fatalf("the final questionnaire refuses a flattened stem by rule and id, got %v", err)
	}
	if err := finalCodeInProse(qs, rules.Thresholds{}); err != nil {
		t.Fatalf("a frozen run refuses nothing: %v", err)
	}
}

// The live diagnosis question of #332 as the tutor writes it: the stem is prose and its code is a pieza codigo in
// plsql. The same stem with the code run into it is the shape the rule refuses.
func TestTheLiveQuestionAsTheTutorWritesItPassesTheRule(t *testing.T) {
	th := codigoRules(t, productionRulesPath)
	planSubs := map[string]bool{"T.p1": true}
	stem := "¿Cómo resuelve el motor PL/SQL la invocación de PA_Reportes.mostrar_cliente cuando se ejecuta sin argumentos y cuál es el resultado de la emisión de datos?"
	code := "CREATE OR REPLACE PACKAGE PA_Reportes AS\n  PROCEDURE mostrar_cliente(p_id NUMBER);\n  PROCEDURE mostrar_cliente;\nEND PA_Reportes;\n/\nCREATE OR REPLACE PACKAGE BODY PA_Reportes AS\n  PROCEDURE mostrar_cliente(p_id NUMBER) IS\n  BEGIN\n    FOR r IN (SELECT id, nombre FROM clientes WHERE p_id IS NULL OR id = p_id ORDER BY id) LOOP\n      DBMS_OUTPUT.PUT_LINE('Cliente: ' || r.nombre);\n    END LOOP;\n  END mostrar_cliente;\n\n  PROCEDURE mostrar_cliente IS\n  BEGIN\n    mostrar_cliente(NULL);\n  END mostrar_cliente;\nEND PA_Reportes;"
	question := diagQuestion{
		ID: "d2", Type: "topic", Level: 1, Subtema: "T.p1", Nivel: "básico", Enunciado: stem,
		Pieza: pieza{Tipo: "codigo", Lenguaje: "plsql", Contenido: code},
		Options: map[string]string{
			"A": "Invoca la sobrecarga sin parámetros, la cual delega en el procedimiento con argumento pasando NULL y lista secuencialmente a todos los clientes ordenados por id.",
			"B": "Se genera un error de ambigüedad de firma (PLS-00307) porque dos procedimientos en el mismo paquete no pueden compartir el mismo identificador.",
			"C": "No imprime ninguna fila porque la cláusula WHERE p_id IS NULL evalúa a falso cuando el parámetro se omite en la llamada externa.",
			"D": "Ejecuta un bucle infinito porque el procedimiento sobrecargado entra en recursión directa al llamarse con el mismo nombre.",
			"E": "No sé",
		},
		Answer: "A",
	}
	if err := validateDiagQuestion(question, map[string]bool{}, planSubs, th); err != nil {
		t.Fatalf("the question as the tutor writes it must pass: %v", err)
	}
	question.Enunciado = stem + " " + plsqlFlat
	if err := validateDiagQuestion(question, map[string]bool{}, planSubs, th); err == nil || !strings.Contains(err.Error(), "codigo-en-linea") {
		t.Fatalf("the same code run into the stem must be refused, got %v", err)
	}
}

func TestPiezaKeepsItsLanguageAndStaysOptional(t *testing.T) {
	var q diagQuestion
	raw := `{"id":"d2","pieza":{"tipo":"codigo","lenguaje":"plsql","contenido":"SELECT 1 FROM dual;"}}`
	if err := json.Unmarshal([]byte(raw), &q); err != nil {
		t.Fatal(err)
	}
	if q.Pieza.Lenguaje != "plsql" || q.Pieza.Tipo != "codigo" {
		t.Fatalf("pieza = %+v, want codigo in plsql", q.Pieza)
	}
	var legacy diagQuestion
	if err := json.Unmarshal([]byte(`{"id":"d1","pieza":{"tipo":"codigo","contenido":"x"}}`), &legacy); err != nil {
		t.Fatal(err)
	}
	if legacy.Pieza.Lenguaje != "" {
		t.Fatalf("a pieza without lenguaje reads as none, got %q", legacy.Pieza.Lenguaje)
	}
}
