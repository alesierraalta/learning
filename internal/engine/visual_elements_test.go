package engine

import (
	"os"
	"regexp"
	"strings"
	"testing"

	"learning/internal/rules"
)

var exampleJSON = regexp.MustCompile(`(?s)<script type="application/json">(.*?)</script>`)

// The canonical example payloads are what the tutor is told to copy. Reading
// them here keeps the prose-budget test honest about their real size.
func exampleSpec(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile("../../integrations/pi/kit/examples/" + name)
	if err != nil {
		t.Fatal(err)
	}
	match := exampleJSON.FindSubmatch(raw)
	if match == nil {
		t.Fatalf("%s has no JSON payload", name)
	}
	return strings.TrimSpace(string(match[1]))
}

func stepFigureBlock(el, payload string) string {
	return "<" + el + "><script type=\"application/json\">" + payload + "</script></" + el + ">"
}

// S10: a new figure may satisfy a "needs a scene" rule, but it must never
// excuse a broken legacy figure that is actually present in the note.
func TestLegacyFigureStillGatedBesideNewFigure(t *testing.T) {
	broken := `<lk-scene><script type="application/json">{"title":"vacía"}</script></lk-scene>`
	stage := stepFigureBlock("lk-stage", `{"question":"¿Qué cambia?","focus":"cambia","actors":[{"id":"a","kind":"block","cell":"A1","name":"A","color":"#123456"}],"lanes":[],"steps":[{"narrator":["Uno."]},{"narrator":["Dos."]},{"narrator":["Tres."]}]}`)
	note := broken + "\n" + stage
	if got := sceneFindings(note, rules.PartStandardThresholds{MinScenes: 1, MaxScenes: 1}); len(got) == 0 {
		t.Fatal("a broken <lk-scene> was excused by a valid <lk-stage>")
	}
}

// S18/S25: only the legacy deck/story has a step cap. A worked example may
// grow to as many steps as its explanation needs.
func TestNewStepFiguresHaveNoStepCap(t *testing.T) {
	var steps []string
	for i := 0; i < 12; i++ {
		steps = append(steps, `{"title":"Paso","narrator":["Explica."],"blocks":[{"kind":"note","text":"Detalle."}]}`)
	}
	payload := `{"form":"example","kicker":"K","question":"¿Cómo se calcula?","steps":[` + strings.Join(steps, ",") + `]}`
	note := stepFigureBlock("lk-guided", payload)
	if count, problems := progressiveProblems(withoutCodeFences(note)); count == 0 || len(problems) > 0 {
		t.Fatalf("12-step lk-guided: count = %d, problems = %v; want one clean walkthrough", count, problems)
	}
}

// The JSON children of the new figures are declarations, not prose the reader
// has to read, whatever their canonical size.
func TestProseWordsIgnoresNewFigurePayloads(t *testing.T) {
	files := []string{"lk-stage-robot.html", "lk-codestep.html", "lk-tablestep.html", "lk-guided.html", "lk-lanes.html"}
	var note strings.Builder
	note.WriteString("# Parte 1\n\nUna frase corta para presentar las figuras.\n\n")
	for _, file := range files {
		el := strings.TrimSuffix(file, ".html")
		if file == "lk-stage-robot.html" {
			el = "lk-stage"
		}
		note.WriteString(stepFigureBlock(el, exampleSpec(t, file)))
		note.WriteString("\n\n")
	}
	words := proseWords(note.String())
	if words > 20 {
		t.Fatalf("proseWords = %d; the JSON payloads were counted as prose", words)
	}
	if got := tamanoFindings(note.String(), rules.PartStandardThresholds{MaxProseWords: 450}); len(got) > 0 {
		t.Fatalf("canonical figures spent the prose budget: %v", got)
	}
}
