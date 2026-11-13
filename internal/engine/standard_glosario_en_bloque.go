package engine

import (
	"fmt"
	"regexp"
	"strings"

	"learning/internal/rules"
)

// The rules of #265, measured on the note and on the page the turn wrote beside it. Each one is declared by an
// additive key (partStandard.glosarioEnBloque, partStandard.interactiveQuiz, partStandard.richPage): a rules
// snapshot that does not declare a key keeps the part checks it started with. The same rules are read by
// tools/register/hallazgos.mjs and tools/explain-check.mjs; a test crosses their verdicts on the bench fixtures.

// glosarioEnBloque is the run of definitions that makes a glossary block: three «Término: Es …» in a row,
// with no sentence of the example between them. The learner's register reference never puts two in a row.
const glosarioEnBloque = 3

var (
	definicionEnNegrita = regexp.MustCompile(`^\*\*([^*]+)\*\*\s*:\s*(.+)$`)
	definicionEnLlano   = regexp.MustCompile(`^([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ .-]{1,40}):\s*(.+)$`)
	terminoSolo         = regexp.MustCompile(`^\*\*[^*]+\*\*\s*:?$`)
	verboDefinidor      = regexp.MustCompile(`^(Es|Son|Significa|Significan|Se llama|Se trata de)\b`)
	miniQuizTitulo      = regexp.MustCompile(`(?i)^##\s*Mini-quiz\s*$`)
	encabezado          = regexp.MustCompile(`^##\s`)
	preguntaNumerada    = regexp.MustCompile(`(?m)^\s*\d+[.)]\s`)
	lkQuizEtiqueta      = regexp.MustCompile(`<lk-quiz[\s>]`)
	cercado             = regexp.MustCompile("(?s)```.*?```")
	espacios            = regexp.MustCompile(`\s+`)
	figuraAbre          = regexp.MustCompile(`<(lk-[a-z][a-z-]*)\b[^>]*>`)
)

// definitionRuns returns the length of every run of definitions in a row (blank lines do not break a run) and
// the first definition of each run: the term and the sentence that defines it.
type definitionRun struct {
	count int
	term  string
	frase string
}

func definitionRuns(text string) []definitionRun {
	var runs []definitionRun
	var actual *definitionRun
	lines := strings.Split(text, "\n")
	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		term, sentence, ok := definitionAt(lines, &i, line)
		if !ok {
			if actual != nil {
				runs = append(runs, *actual)
				actual = nil
			}
			continue
		}
		if actual == nil {
			actual = &definitionRun{term: term, frase: sentence}
		}
		actual.count++
	}
	if actual != nil {
		runs = append(runs, *actual)
	}
	return runs
}

// definitionAt reads one definition that starts at line i: a bold term with its sentence on the same line or on
// the next non-blank line, or a plain «Término: Es …». i moves to the sentence's line when it takes the next line.
func definitionAt(lines []string, i *int, line string) (term, sentence string, ok bool) {
	if m := definicionEnNegrita.FindStringSubmatch(line); m != nil && verboDefinidor.MatchString(m[2]) {
		return strings.TrimSpace(m[1]), strings.TrimSpace(m[2]), true
	}
	if m := definicionEnLlano.FindStringSubmatch(line); m != nil && verboDefinidor.MatchString(m[2]) {
		return strings.TrimSpace(m[1]), strings.TrimSpace(m[2]), true
	}
	if !terminoSolo.MatchString(line) {
		return "", "", false
	}
	j := *i + 1
	for j < len(lines) && strings.TrimSpace(lines[j]) == "" {
		j++
	}
	if j >= len(lines) || !verboDefinidor.MatchString(strings.TrimSpace(lines[j])) {
		return "", "", false
	}
	*i = j
	term = strings.TrimSpace(strings.TrimSuffix(strings.ReplaceAll(line, "*", ""), ":"))
	return term, strings.TrimSpace(lines[j]), true
}

// glosarioFindings measures the glossary block (#265): a run of three or more definitions in a row.
func glosarioFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.GlosarioEnBloque {
		return nil
	}
	var out []string
	for _, run := range definitionRuns(text) {
		if run.count >= glosarioEnBloque {
			out = append(out, fmt.Sprintf("glosario en bloque: %d definiciones seguidas, sin una frase del ejemplo entre ellas (empieza en «%s») · reparte las definiciones: entre una y otra va una frase del ejemplo o una escena", run.count, run.term))
		}
	}
	return out
}
