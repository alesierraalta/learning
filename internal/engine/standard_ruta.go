package engine

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"

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

// The pre-reading is an introduction in everyday words, not a two-line abstract
// (S28): four to six sentences, about 60 to 160 words. The note keeps two sentences
// per paragraph, so six sentences come in up to three short paragraphs.
const (
	rutaPreReadingMinSentences  = 4
	rutaPreReadingMaxSentences  = 6
	rutaPreReadingMinWords      = 60
	rutaPreReadingMaxWords      = 160
	rutaPreReadingMaxParagraphs = 3
	// rutaDetailMinWords is what a route line says about its step: one plain
	// sentence, ten words or more, so the reader knows what is coming.
	rutaDetailMinWords = 10
)

// rutaDefinition reads a bold label used as a definition, the shape the guide
// asks the tutor for: «**Término**: es …» or «**Término** es …». The verb that
// defines is read without case, because Spanish writes it both ways.
var (
	rutaBoldLabel    = regexp.MustCompile(`^\*\*([^*]+)\*\*\s*:?\s*(.*)$`)
	rutaDefiningVerb = regexp.MustCompile(`(?i)^(es|son|significa|significan|se llama|se trata de)\b`)
	rutaDFNTag       = regexp.MustCompile(`<dfn>([^<]+)</dfn>`)
)

// rutaDefinedTerms collects the terms the part explains later: the bold labels it uses
// as definitions, and any `<dfn>`, read after `## Ruta` because the pre-reading and the
// route come before the explanation.
func rutaDefinedTerms(text string) []string {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	start := 0
	for i, line := range lines {
		if rutaHeading.MatchString(line) {
			start = i + 1
			break
		}
	}
	vistos := map[string]bool{}
	var terms []string
	add := func(term string) {
		term = strings.TrimSpace(term)
		clave := rutaPlain(term)
		if clave == "" || vistos[clave] {
			return
		}
		vistos[clave] = true
		terms = append(terms, term)
	}
	for i := start; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		for _, m := range rutaDFNTag.FindAllStringSubmatch(line, -1) {
			add(m[1])
		}
		m := rutaBoldLabel.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		if rutaDefiningVerb.MatchString(strings.TrimSpace(m[2])) {
			add(m[1])
			continue
		}
		// A label on its own line, defined by the sentence right after it.
		if strings.TrimSpace(m[2]) != "" {
			continue
		}
		for j := i + 1; j < len(lines); j++ {
			if strings.TrimSpace(lines[j]) == "" {
				continue
			}
			if rutaDefiningVerb.MatchString(strings.TrimSpace(lines[j])) {
				add(m[1])
			}
			break
		}
	}
	return terms
}

// rutaPlain lowercases a rune slice and drops the accents, one rune out for one rune in,
// so an index into the plain text is an index into the original.
func rutaPlain(s string) string {
	runes := []rune(s)
	for i, r := range runes {
		runes[i] = rutaUnaccent(r)
	}
	return strings.ToLower(string(runes))
}

// rutaUnaccent maps the Spanish vowels and ñ to their plain form. Lowercase and uppercase
// are folded before the lookup, so both spellings land on the same rune.
func rutaUnaccent(r rune) rune {
	switch strings.ToLower(string(r)) {
	case "á":
		return 'a'
	case "é":
		return 'e'
	case "í":
		return 'i'
	case "ó":
		return 'o'
	case "ú", "ü":
		return 'u'
	case "ñ":
		return 'n'
	}
	return r
}

// rutaWordRune reports whether r belongs to a word: a letter, a digit or a combining mark,
// so a term is matched whole and not inside another word.
func rutaWordRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsMark(r)
}

// rutaParaphrased reports whether the term ending at index end is followed by its plain
// words: a parenthesis («la especificación (el documento que dice qué debe hacer el
// sistema)») or a dash and a phrase of three words or more.
func rutaParaphrased(runes []rune, end int) bool {
	i := end
	for i < len(runes) && unicode.IsSpace(runes[i]) {
		i++
	}
	if i >= len(runes) {
		return false
	}
	switch runes[i] {
	case '(', '[':
		cierre := ')'
		if runes[i] == '[' {
			cierre = ']'
		}
		for j := i + 1; j < len(runes); j++ {
			if runes[j] == cierre {
				return len(strings.Fields(string(runes[i+1:j]))) >= 2
			}
		}
		return false
	case '—', '–', '-':
		j := i + 1
		for j < len(runes) && runes[j] != '.' && runes[j] != '!' && runes[j] != '?' && runes[j] != '\n' {
			j++
		}
		return len(strings.Fields(string(runes[i+1:j]))) >= 3
	}
	return false
}

// rutaNamesTerm reports whether segment uses term without saying what it means right
// there. The comparison ignores case and accents and matches the whole word.
func rutaNamesTerm(segment, term string) bool {
	runes := []rune(segment)
	plain := []rune(rutaPlain(segment))
	pat := []rune(rutaPlain(term))
	if len(pat) == 0 || len(pat) > len(plain) {
		return false
	}
	for i := 0; i+len(pat) <= len(plain); i++ {
		var igual bool = true
		for k := range pat {
			if plain[i+k] != pat[k] {
				igual = false
				break
			}
		}
		if !igual {
			continue
		}
		if i > 0 && rutaWordRune(plain[i-1]) {
			continue
		}
		end := i + len(pat)
		if end < len(plain) && rutaWordRune(plain[end]) {
			continue
		}
		if rutaParaphrased(runes, end) {
			continue
		}
		return true
	}
	return false
}

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

// rutaPreReadingFinding measures the pre-reading as an introduction (S28): up to three
// short paragraphs that add up to four to six sentences and about 60 to 160 words. It
// returns the finding that names what is missing, or "" when the warm-up is there.
func rutaPreReadingFinding(text string) string {
	bloques := rutaPreReading(text)
	if len(bloques) == 0 {
		return "no pre-reading before ## Ruta — write an introduction in everyday words of 4 to 6 sentences " +
			"(about 60 to 160 words, in short paragraphs of two sentences) saying what the part covers and why it matters, " +
			"right after the title and before the route, so the reader arrives ready for it"
	}
	shape := "the warm-up before ## Ruta is 4 to 6 sentences, about 60 to 160 words, in short paragraphs (two sentences each)"
	mejorFrases, mejorPalabras := 0, 0
	for start := range bloques {
		for size := 1; size <= rutaPreReadingMaxParagraphs && start+size <= len(bloques); size++ {
			bloque := strings.Join(bloques[start:start+size], " ")
			frases := len(rutaSentence.FindAllString(bloque, -1))
			palabras := len(strings.Fields(bloque))
			if frases >= rutaPreReadingMinSentences && frases <= rutaPreReadingMaxSentences &&
				palabras >= rutaPreReadingMinWords && palabras <= rutaPreReadingMaxWords {
				return ""
			}
			if frases > mejorFrases {
				mejorFrases, mejorPalabras = frases, palabras
			}
		}
	}
	return fmt.Sprintf("the pre-reading before ## Ruta has %d sentence(s) and %d word(s) — %s: "+
		"the big picture and why it matters, in words the reader already knows", mejorFrases, mejorPalabras, shape)
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
	preReading := rutaPreReadingFinding(text)
	if preReading != "" {
		findings = append(findings, preReading)
	}
	// «No term before its explanation»: a term the part defines later is not a word the
	// reader has yet, so naming it here without plain words right after it is a finding.
	terms := rutaDefinedTerms(text)
	if preReading == "" {
		for _, bloque := range rutaPreReading(text) {
			for _, term := range terms {
				if rutaNamesTerm(bloque, term) {
					findings = append(findings, fmt.Sprintf(
						"the pre-reading names «%s», a term the part only explains later — say it in everyday words "+
							"or paraphrase it right there («%s (… en palabras llanas)»)", term, term))
					break
				}
			}
		}
	}
	for i, line := range ruta {
		if rutaDetailWords(line) < rutaDetailMinWords {
			findings = append(findings, fmt.Sprintf(
				"## Ruta line %d names the step and says nothing more — write «<step> — <one plain sentence of what will be seen there>», "+
					"with a separator («—», «:» or «-») and at least %d words after it", i+1, rutaDetailMinWords))
		}
		for _, term := range terms {
			if rutaNamesTerm(rutaLine.ReplaceAllString(line, ""), term) {
				findings = append(findings, fmt.Sprintf(
					"## Ruta line %d names «%s», a term the part only explains later — say it in everyday words "+
						"or paraphrase it right there («%s (… en palabras llanas)»)", i+1, term, term))
				break
			}
		}
	}
	return findings
}
