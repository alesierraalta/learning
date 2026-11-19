package engine

import (
	"fmt"
	"strings"
	"testing"

	"learning/internal/rules"
)

// A note written only with the new elements must satisfy the part gates that
// used to demand <lk-walkthrough>/<lk-story>, without changing old notes.
func TestNewFiguresSatisfyPartGates(t *testing.T) {
	steps := `[{"title":"Primero","narrator":["Empieza."]},{"title":"Segundo","narrator":["Cambia."]},{"title":"Tercero","narrator":["Termina."]}]`
	note := "# Parte 1\n\n" +
		`<lk-stage><script type="application/json">{"question":"¿Qué cambia?","focus":"cambia","actors":[{"id":"a","kind":"block","cell":"A1","name":"A","color":"#123456"}],"lanes":[],"steps":` + steps + `}</script></lk-stage>` + "\n\n" +
		`<lk-guided><script type="application/json">{"form":"formula","kicker":"K","question":"¿Cuánto vale $C$?","steps":[{"title":"Símbolo","blocks":[{"kind":"formula","tokens":[{"t":"C"}]}]},{"title":"Valor","blocks":[{"kind":"formula","tokens":[{"t":"1"}]}]},{"title":"Resultado","blocks":[{"kind":"formula","tokens":[{"t":"C"},{"t":"="},{"t":"1"}]}]}]}</script></lk-guided>` + "\n\n" +
		"Cómo leerlo: sigue los pasos.\n\n```mermaid\ngraph LR; A --> B;\n```\n"

	if n, problems := progressiveProblems(withoutCodeFences(note)); n == 0 || len(problems) > 0 {
		t.Fatalf("progressiveProblems = %d, %v; want a clean new deck", n, problems)
	}
	checks := []struct {
		name string
		call func() []string
	}{
		{"storyLanguage", func() []string { return storyLanguageFindings(note, rules.PartStandardThresholds{StoryLanguage: true}) }},
		{"storyHeader", func() []string { return storyHeaderFindings(note, rules.PartStandardThresholds{StoryHeader: true}) }},
		{"storyStage", func() []string { return storyStageFindings(note, rules.PartStandardThresholds{StoryStage: true}) }},
		{"storyMotion", func() []string { return storyMotionFindings(note, rules.PartStandardThresholds{StoryMotion: true}) }},
		{"moveUndrawn", func() []string {
			return moveUndrawnFindings(note, rules.PartStandardThresholds{StoryMoveDrawable: true})
		}},
		{"storySummary", func() []string { return faltaResumenFindings(note, rules.PartStandardThresholds{StorySummary: true}) }},
		{"storyFocus", func() []string { return faltaFocoFindings(note, rules.PartStandardThresholds{StoryFocus: true}) }},
		{"formulaWalkthrough", func() []string {
			return formulaWalkthroughFindings(note, rules.PartStandardThresholds{FormulaWalkthrough: true})
		}},
		{"legend", func() []string { return legendFindings(note, rules.PartStandardThresholds{FormulaLegend: true}) }},
		{"scene", func() []string { return sceneFindings(note, rules.PartStandardThresholds{MinScenes: 1, MaxScenes: 1}) }},
	}
	for _, c := range checks {
		t.Run(c.name, func(t *testing.T) {
			if got := c.call(); len(got) > 0 {
				t.Fatalf("%s = %v; want no findings for a new-element note", c.name, got)
			}
		})
	}
}

// T9: the new step figures are visuals in their own right, judged by the
// payload the reader draws. The old figure and its reading-guide rule stay put.
func TestVisualCounterCountsStepElements(t *testing.T) {
	payloads := map[string]string{
		"lk-stage":     `{"question":"¿Qué pasa?","focus":"pasa","actors":[{"id":"a","kind":"block","cell":"A1","name":"A","color":"#123456"}],"lanes":[],"steps":[{}]}`,
		"lk-codestep":  `{"title":"Bucle","language":"python","code":["x = 1"],"steps":[{"line":1,"state":{},"narrator":["Empieza."]}]}`,
		"lk-tablestep": `{"title":"Filas","tables":{"t":{"columns":["id"],"rows":[{"id":"r1","cells":{"id":"r1"}}]}},"steps":[{"op":"select","table":"t","columns":["id"]}]}`,
		"lk-guided":    `{"form":"formula","kicker":"K","question":"¿Cuánto?","steps":[{"blocks":[{"kind":"note","text":"Respuesta."}]}]}`,
		"lk-lanes":     `{"form":"timeline","kicker":"K","question":"¿Cuándo?","timeUnit":"día","timeMax":4,"lanes":[{"id":"a","name":"A"}],"items":[{"id":"i","lane":"a","label":"Paso","start":0,"end":2}],"steps":[{}]}`,
	}
	block := func(el, payload string) string {
		return fmt.Sprintf("<%s>\n<script type=\"application/json\">\n%s\n</script>\n</%s>", el, payload, el)
	}
	for el, payload := range payloads {
		t.Run(el, func(t *testing.T) {
			if got, missing := countVisualsAndGuides(block(el, payload), nil, []string{"svg"}, "Cómo leerlo"); got != 1 || missing != 1 {
				t.Fatalf("count = %d, missing guides = %d; want 1 and 1", got, missing)
			}
			// payload → guide, as the existing figures require.
			text := block(el, payload) + "\nCómo leerlo: mira el paso.\n"
			if got, missing := countVisualsAndGuides(text, nil, []string{"svg"}, "Cómo leerlo"); got != 1 || missing != 0 {
				t.Fatalf("guided count = %d, missing = %d; want 1 and 0", got, missing)
			}
			// An empty or unparsable payload is not a visual.
			for _, bad := range []string{`{"title":"vacío"}`, "{", `[]`} {
				if got := countVisuals(block(el, bad), nil, []string{"svg"}); got != 0 {
					t.Fatalf("%s: count = %d for %s, want 0", el, got, bad)
				}
			}
			// One-line payloads count too, beside an old figure.
			compact := fmt.Sprintf("<%s><script type=\"application/json\">%s</script></%s>", el, payload, el)
			figure := `<lk-figure><script type="application/json">{"grids":[{"cols":1,"rows":1,"w":9,"h":9,"cells":[{"c":0,"r":0}]}]}</script></lk-figure>`
			if got := countVisuals(compact+figure, nil, []string{"svg"}); got != 2 {
				t.Fatalf("compact count = %d, want 2 (new element + old figure)", got)
			}
			if got := countVisuals("```text\n"+strings.ReplaceAll(compact, "\n", " ")+"\n```", nil, []string{"svg"}); got != 0 {
				t.Fatalf("count = %d inside a code sample, want 0", got)
			}
		})
	}
}
