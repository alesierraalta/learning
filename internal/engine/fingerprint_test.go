package engine

import (
	"os"
	"path/filepath"
	"testing"
)

// The canonical form is implemented twice: here and in integrations/pi/bridge.ts. This golden value
// is the only thing that keeps them honest, so it is pinned literally and the bridge test asserts
// the same string for the same quiz.
const goldenQuizFingerprint = "sha256:96f60d11ca8ce936895b2cd34d5bd9c7e51fbe722f33b3c2ce7481eb9fbb9642"

func goldenQuiz() []quizQuestion {
	return []quizQuestion{
		{
			ID:        "q1",
			Enunciado: "¿Qué es una clave primaria?",
			Answer:    "B",
			Options:   map[string]string{"A": "Una fila", "B": "El campo que identifica", "C": "Un índice", "D": "Una tabla", "E": "No sé"},
		},
		{
			ID:        "q2",
			Enunciado: "¿Qué hace una clave foránea?",
			Answer:    "D",
			Options:   map[string]string{"A": "Ordena", "B": "Borra", "C": "Duplica", "D": "Referencia otra tabla", "E": "No sé"},
		},
	}
}

func TestQuizFingerprintMatchesTheBridgeGoldenValue(t *testing.T) {
	if got := quizFingerprint(goldenQuiz()); got != goldenQuizFingerprint {
		t.Fatalf("fingerprint drifted from the bridge's canonical form:\n got %s\nwant %s\nif the bridge changed on purpose, update both sides and the golden value", got, goldenQuizFingerprint)
	}
}

// #416: this is the defect that motivated the hash. A quiz re-keyed in place keeps every id, every
// statement and every option, so anything that hashes only the wording calls the old answers fresh
// and grades them against the new key.
func TestQuizFingerprintChangesWhenOnlyTheKeyChanges(t *testing.T) {
	requeued := goldenQuiz()
	requeued[0].Answer = "C"
	if quizFingerprint(requeued) == goldenQuizFingerprint {
		t.Fatal("a quiz whose keyed letter changed must not keep the same fingerprint")
	}
}

func TestQuizFingerprintIgnoresOptionMapOrder(t *testing.T) {
	reordered := goldenQuiz()
	// Go maps have no order, so this pins the intent: the hash sorts letters itself.
	reordered[0].Options = map[string]string{"E": "No sé", "D": "Una tabla", "C": "Un índice", "B": "El campo que identifica", "A": "Una fila"}
	if quizFingerprint(reordered) != goldenQuizFingerprint {
		t.Fatal("the order options were written in must not change the fingerprint")
	}
}

func TestLoadAnswersQuizReadsTheNamedQuiz(t *testing.T) {
	ws := t.TempDir()
	rel := "mini-quiz/p1.answers.json"
	if err := os.MkdirAll(filepath.Join(ws, "mini-quiz"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ws, rel), []byte(`{"quiz":"`+goldenQuizFingerprint+`","answers":{"q1":"B","q2":"D"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := loadAnswersQuiz(ws, rel); got != goldenQuizFingerprint {
		t.Fatalf("loadAnswersQuiz = %q", got)
	}
	// A file written before #416 names no quiz: the engine must treat it as answering another one.
	if err := os.WriteFile(filepath.Join(ws, rel), []byte(`{"answers":{"q1":"B","q2":"D"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := loadAnswersQuiz(ws, rel); got != "" {
		t.Fatalf("a legacy answers file must name no quiz, got %q", got)
	}
}
