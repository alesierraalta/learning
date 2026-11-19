package engine

import (
	"fmt"
	"regexp"
	"strings"

	"learning/internal/rules"
)

// routeSection reports whether the part opens a `## Ruta` section and returns its
// numbered lines.
func routeSection(text string) (bool, []string) {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	for i, line := range lines {
		if !rutaHeading.MatchString(line) {
			continue
		}
		var ruta []string
		for _, rest := range lines[i+1:] {
			if h2Start.MatchString(rest) {
				break
			}
			if rutaLine.MatchString(rest) {
				ruta = append(ruta, rest)
			}
		}
		return true, ruta
	}
	return false, nil
}

// routeLines reports whether the part opens a `## Ruta` section and how many
// numbered lines it lists.
func routeLines(text string) (bool, int) {
	found, ruta := routeSection(text)
	return found, len(ruta)
}

// rutaSeparator is the mark that ends the step's name in a route line and starts
// the sentence saying what will be seen there: `—`, `–`, `:` or `-`. The dash is
// read between spaces so a hyphen inside a word is not a separator, and the colon
// is read by its trailing space, because Spanish does not put one before it.
var rutaSeparator = regexp.MustCompile(`(?:\s[—–]|[—–]|:\s|\s-\s)`)

// rutaDetailWords counts the words a route line writes after its separator. Zero
// means the line names the step and says nothing about what will be seen there.
func rutaDetailWords(line string) int {
	body := rutaLine.ReplaceAllString(line, "")
	loc := rutaSeparator.FindStringIndex(body)
	if loc == nil {
		return 0
	}
	return len(strings.Fields(body[loc[1]:]))
}

// rutaSentence is a sentence terminator and what follows it: the pre-reading is
// counted in sentences, not in punctuation marks.
var rutaSentence = regexp.MustCompile(`[.!?](?:\s|$)`)

// rutaPreReading is the summary a new part writes before `## Ruta`: the prose
// paragraphs that come after the title and before the route, one block each.
func rutaPreReading(text string) []string {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	// The front matter is metadata, not prose.
	if len(lines) > 0 && strings.TrimSpace(lines[0]) == "---" {
		for i := 1; i < len(lines); i++ {
			if strings.TrimSpace(lines[i]) == "---" {
				lines = lines[i+1:]
				break
			}
		}
	}
	var bloques []string
	var actual []string
	cierra := func() {
		if len(actual) > 0 {
			bloques = append(bloques, strings.Join(actual, " "))
			actual = nil
		}
	}
	inFence := false
	for _, line := range lines {
		trim := strings.TrimSpace(line)
		if rutaHeading.MatchString(trim) {
			break
		}
		if strings.HasPrefix(trim, "```") {
			inFence = !inFence
			cierra()
			continue
		}
		if inFence {
			continue
		}
		// A heading, a table, a raw element, a bullet or a numbered line is not a
		// preview paragraph: the pre-reading is prose.
		if trim == "" || strings.HasPrefix(trim, "#") || strings.HasPrefix(trim, "|") ||
			strings.HasPrefix(trim, "<") || strings.HasPrefix(trim, "- ") ||
			strings.HasPrefix(trim, "* ") || rutaLine.MatchString(trim) {
			cierra()
			continue
		}
		actual = append(actual, trim)
	}
	cierra()
	return bloques
}

// hasRutaPreReading reports whether one of those paragraphs is the short
// pre-reading the contract asks for: two or three plain sentences, at most 70
// words.
func hasRutaPreReading(text string) bool {
	for _, bloque := range rutaPreReading(text) {
		frases := len(rutaSentence.FindAllString(bloque, -1))
		if frases < 2 || frases > 3 {
			continue
		}
		if len(strings.Fields(bloque)) <= 70 {
			return true
		}
	}
	return false
}

// rutaFindings measures the route: the part opens with ## Ruta and lists as many
// numbered lines as the rules declare, one step each. A part written to the new
// contract —only step figures, `usesStepFigures`— also opens with a short
// pre-reading of what it covers and describes what will be seen in every line
// (S27). A legacy part is not asked for either: its route keeps the shape it had
// when it was published (S10).
func rutaFindings(text string, th rules.PartStandardThresholds) []string {
	found, ruta := routeSection(text)
	switch {
	case !found:
		return []string{fmt.Sprintf(
			"no ## Ruta section — open the part with ## Ruta and %d to %d numbered lines, one step each",
			th.MinRutaLines, th.MaxRutaLines)}
	case len(ruta) < th.MinRutaLines || len(ruta) > th.MaxRutaLines:
		return []string{fmt.Sprintf(
			"## Ruta lists %d numbered line(s) (the route is %d to %d) — name the steps the part actually teaches, one line each",
			len(ruta), th.MinRutaLines, th.MaxRutaLines)}
	}
	if !usesStepFigures(text) {
		return nil
	}
	var findings []string
	if !hasRutaPreReading(text) {
		findings = append(findings, "no pre-reading before ## Ruta — write 2 or 3 plain sentences (at most 70 words) "+
			"saying what the part covers, right after the title and before the route, so the reader arrives ready for it")
	}
	for i, line := range ruta {
		if rutaDetailWords(line) < 6 {
			findings = append(findings, fmt.Sprintf(
				"## Ruta line %d names the step and says nothing more — write «<step> — <one sentence of what will be seen there>», "+
					"with a separator («—», «:» or «-») and at least 6 words after it", i+1))
		}
	}
	return findings
}
