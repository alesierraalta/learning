package engine

import (
	"strings"

	"learning/internal/rules"
)

// miniQuizSection returns the body of «## Mini-quiz», up to the next «## » heading, and whether the note has one.
func miniQuizSection(text string) (string, bool) {
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		if !miniQuizTitulo.MatchString(line) {
			continue
		}
		end := len(lines)
		for j := i + 1; j < len(lines); j++ {
			if encabezado.MatchString(lines[j]) {
				end = j
				break
			}
		}
		return strings.Join(lines[i+1:end], "\n"), true
	}
	return "", false
}

// quizFindings measures the mini-quiz (#265): it is the interactive lk-quiz, never a numbered list under its
// heading. A page the tutor wrote must carry the lk-quiz itself: the reader adds nothing to such a page.
func quizFindings(text string, th rules.PartStandardThresholds, page bool) []string {
	if !th.InteractiveQuiz {
		return nil
	}
	sinCodigo := cercado.ReplaceAllString(text, " ")
	var out []string
	if body, ok := miniQuizSection(sinCodigo); ok && preguntaNumerada.MatchString(body) {
		out = append(out, "el mini-quiz es una lista numerada: el lector lo dibuja como lk-quiz interactivo · deja el encabezado «## Mini-quiz» y pon las preguntas en mini-quiz/<parte>.json")
	}
	if page && !lkQuizEtiqueta.MatchString(sinCodigo) {
		out = append(out, "la página no trae el lk-quiz · escribe <lk-quiz></lk-quiz> bajo «## Mini-quiz»: el lector no añade el quiz a una página que escribió el turno")
	}
	return out
}
