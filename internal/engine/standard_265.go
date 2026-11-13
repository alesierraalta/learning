package engine

import (
	"fmt"
	"os"
	"path/filepath"
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

// figureFindings measures that the page carries every figure of the note, as the same block (whitespace aside).
func figureFindings(note, page string, th rules.PartStandardThresholds) []string {
	if !th.RichPage {
		return nil
	}
	kept := espacios.ReplaceAllString(page, "")
	for _, block := range figureBlocks(note) {
		if !strings.Contains(kept, espacios.ReplaceAllString(block.text, "")) {
			return []string{fmt.Sprintf("la página no trae la figura <%s> de la nota: cada figura de la nota va en la página tal cual", block.tag)}
		}
	}
	return nil
}

type figureBlock struct{ tag, text string }

// figureBlocks returns every `<lk-…>` block of a note, up to its own closing tag.
func figureBlocks(note string) []figureBlock {
	var out []figureBlock
	for _, open := range figuraAbre.FindAllStringSubmatchIndex(note, -1) {
		name := note[open[2]:open[3]]
		closing := "</" + name + ">"
		end := strings.Index(note[open[1]:], closing)
		if end < 0 {
			continue
		}
		stop := open[1] + end + len(closing)
		out = append(out, figureBlock{tag: name, text: note[open[0]:stop]})
	}
	return out
}

// richPageFindings measures the page the turn wrote beside the part's note with the same thresholds (#265). The
// page must measure as its note, carry every figure the note draws, and carry the interactive quiz. Its findings
// name the page, so the tutor corrects the file that is wrong.
func richPageFindings(c *evalCtx, rel, note string, th rules.PartStandardThresholds) []string {
	if !th.RichPage {
		return nil
	}
	pagePath := absPath(c.ws, strings.TrimSuffix(rel, ".md")+".html")
	raw, err := os.ReadFile(pagePath)
	if err != nil {
		return nil
	}
	page := string(raw)
	text := notaDeHTML(page)
	var out []string
	out = append(out, standardFindings(text, th)...)
	if th.Register != nil {
		sencillez, tecnicidad := learnerLevels(absPath(c.ws, rel))
		out = append(out, registerFindings(text, th.Register.Limits(sencillez, tecnicidad))...)
	}
	out = append(out, glosarioFindings(text, th)...)
	out = append(out, quizFindings(text, th, true)...)
	out = append(out, figureFindings(note, page, th)...)
	name := filepath.Base(pagePath)
	for i := range out {
		out[i] = name + ": " + out[i]
	}
	return out
}
