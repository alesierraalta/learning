package engine

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"learning/internal/rules"
)

// The prose register, mirrored from `tools/register/measure.mjs` and `hallazgos.mjs`: the five
// structural rules the engine enforces. The term rule (`termino-sin-explicar`) needs the
// common-Spanish lexicon, so it lives in the tool only. A zero threshold is not declared, so a
// frozen snapshot without the block refuses nothing. Each finding starts with its rule name, the
// same name explain-check prints, and `TestRegisterMatchesExplainCheck` holds the two together.

var (
	registerLkOpen    = regexp.MustCompile(`(?i)^<lk-[a-z-]+`)
	registerLkClose   = regexp.MustCompile(`(?i)</lk-[a-z-]+>\s*$`)
	registerLkAny     = regexp.MustCompile(`(?i)</lk-[a-z-]+>`)
	registerHeading   = regexp.MustCompile(`^#{1,6}\s`)
	registerHeadingTx = regexp.MustCompile(`^#{1,6}\s+`)
	registerBoldLine  = regexp.MustCompile(`^\*\*([^*]+)\*\*:?$`)
	registerRule      = regexp.MustCompile(`^(-{3,}|\*{3,}|_{3,})$`)
	registerQuote     = regexp.MustCompile(`^>\s?`)
	registerCitation  = regexp.MustCompile(`:chatgpt-content-reference\{[^}]*\}`)
	registerLink      = regexp.MustCompile(`\[([^\]]+)\]\((?:https?:)[^)]*\)`)
	registerImage     = regexp.MustCompile(`!\[([^\]]*)\]\([^)]*\)`)
	registerMathEnd   = regexp.MustCompile(`\\\]`)
	registerMathMarks = regexp.MustCompile(`\\\[|\\\]`)
	registerItem      = regexp.MustCompile(`^(?:[-*•]|\d+[.)])\s+(.*)$`)
	registerWord      = regexp.MustCompile(`\d+(?:[.,]\d+)*|\p{L}[\p{L}\p{M}’'_-]*`)
	registerCodeSpan  = regexp.MustCompile("`[^`]*`")
	registerMathInl   = regexp.MustCompile(`\\\(|\\\)|\\\[|\\\]`)
	registerMarks     = regexp.MustCompile("[*_#>|]")
	registerBoldSpan  = regexp.MustCompile(`\*\*([^*]+)\*\*`)
	registerCalc      = regexp.MustCompile(`\d[\d.,]*\s*[-+×*/]\s*\d[\d.,]*[^=\n]*=\s*-?\d`)
	registerWordPair  = regexp.MustCompile(`(?i)[a-záéíóúñ]{4,}\s+[a-záéíóúñ]{4,}`)
	registerDefLine   = regexp.MustCompile(`^\*\*[^*]+\*\*:?$`)
	registerDefCue    = regexp.MustCompile(`(?i)\*\*[^*]+\*\*:?\s*(?:es|son)\b`)
	registerTitle     = regexp.MustCompile(`(?i)^(?:dr|dra|sr|sra|ud|uds|d|dña)$`)
	registerDigits    = regexp.MustCompile(`^\d+$`)
	// A source or attribution line (`**Fuente**: …`, `Fuente: …`) names where the text comes from:
	// it is not prose (SOURCE_LINE in measure.mjs).
	registerSource = regexp.MustCompile(`(?i)^(?:\*\*(?:fuentes?|sources?)\*\*|\*?(?:fuentes?|sources?)\*?\s*:)`)
)

// registerExamples are the sentences that open a concrete example (EXAMPLE_MARKERS in measure.mjs).
var registerExamples = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bpor ejemplo\b`),
	regexp.MustCompile(`(?i)\bejemplo conductor\b`),
	regexp.MustCompile(`(?i)\ben nuestro ejemplo\b`),
	regexp.MustCompile(`(?i)\bnuestro ejemplo\b`),
	regexp.MustCompile(`(?i)\bimagina(?:te|mos)?\b`),
	regexp.MustCompile(`(?i)\bsupongamos\b`),
	regexp.MustCompile(`(?i)\bsupón\b`),
	regexp.MustCompile(`(?i)\busaremos siempre el mismo ejemplo\b`),
	regexp.MustCompile(`(?i)\bel caso concreto\b`),
	regexp.MustCompile(`(?i)\bnuestro caso\b`),
	regexp.MustCompile(`(?i)\btenemos un\b`),
}

// registerContrasts are the contrast markers (CONTRAST_MARKERS in measure.mjs).
var registerContrasts = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bantes\b`),
	regexp.MustCompile(`(?i)\bdespués\b`),
	regexp.MustCompile(`(?i)\bdespues\b`),
	regexp.MustCompile(`(?i)\ben cambio\b`),
	regexp.MustCompile(`(?i)\ba diferencia\b`),
	regexp.MustCompile(`(?i)\bal revés\b`),
	regexp.MustCompile(`(?i)\bal reves\b`),
	regexp.MustCompile(`(?i)\bpor el contrario\b`),
	regexp.MustCompile(`(?i)\ben lugar de\b`),
	regexp.MustCompile(`(?i)\bes incorrecto\b`),
	regexp.MustCompile(`(?i)\bno es lo mismo\b`),
	regexp.MustCompile(`(?i)\bvisualmente\b`),
	regexp.MustCompile(`(?i)\bno exactamente\b`),
}

var (
	registerCodeLangs = map[string]bool{
		"sql": true, "js": true, "ts": true, "javascript": true, "typescript": true, "bash": true,
		"sh": true, "json": true, "rust": true, "python": true, "html": true, "css": true,
		"yaml": true, "yml": true, "tsx": true, "jsx": true, "go": true,
	}
	registerAbbrev = map[string]bool{
		"p.ej": true, "ej": true, "etc": true, "vs": true, "aprox": true, "núm": true, "num": true,
		"fig": true, "cap": true, "art": true, "dr": true, "dra": true, "sr": true, "sra": true,
		"ud": true, "uds": true, "ee.uu": true, "a.c": true, "d.c": true, "p": true, "pp": true,
		"vol": true, "ed": true, "trad": true, "máx": true, "mín": true, "inc": true, "s.l": true,
		"s.a": true, "tel": true, "av": true,
	}
	// BOLD_STOPLIST in measure.mjs: the words a bold span may carry without being a term.
	registerBoldStop = map[string]bool{
		"fuente": true, "ruta": true, "importante": true, "nota": true, "ojo": true,
		"simplificado": true, "resumen": true, "en": true, "cuidado": true, "atención": true, "atencion": true,
	}
)

const registerBoxChars = "┌┐└┘│─├┤┬┴┼►◄▼▲█▂▃▄▅▆▇"

// registerProse is the text a reader reads as prose, and the stepped calculation lines apart:
// `extractProse` in measure.mjs, line for line.
func registerProse(text string) (string, []string) {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	var prose, steps []string
	i := 0
	if len(lines) > 0 && strings.TrimSpace(lines[0]) == "---" {
		for k := 1; k < len(lines); k++ {
			if strings.TrimSpace(lines[k]) == "---" {
				i = k + 1
				break
			}
		}
	}
	inQuiz := false
	for ; i < len(lines); i++ {
		t := strings.TrimSpace(lines[i])
		switch {
		case registerLkOpen.MatchString(t):
			if !registerLkClose.MatchString(t) {
				for i+1 < len(lines) && !registerLkAny.MatchString(lines[i]) {
					i++
				}
			}
		case strings.HasPrefix(t, "```"):
			lang := strings.ToLower(strings.TrimSpace(t[3:]))
			var body []string
			for i++; i < len(lines) && !strings.HasPrefix(strings.TrimSpace(lines[i]), "```"); i++ {
				body = append(body, lines[i])
			}
			if !registerCodeLangs[lang] {
				steps = append(steps, registerCodeSteps(body)...)
			}
		case strings.HasPrefix(t, `\[`):
			var buf []string
			for ; i < len(lines) && !registerMathEnd.MatchString(lines[i]); i++ {
				buf = append(buf, lines[i])
			}
			if i < len(lines) {
				buf = append(buf, lines[i])
			}
			if step := strings.TrimSpace(registerMathMarks.ReplaceAllString(strings.Join(buf, " "), "")); step != "" {
				steps = append(steps, step)
			}
		case registerHeading.MatchString(t):
			inQuiz = strings.Contains(strings.ToLower(t), "quiz")
			label := strings.TrimSpace(registerHeadingTx.ReplaceAllString(t, ""))
			if m := registerBoldLine.FindStringSubmatch(label); m != nil && !registerSource.MatchString(label) {
				prose = append(prose, "**"+strings.TrimSpace(m[1])+"**")
			}
		case inQuiz, strings.HasPrefix(t, "|"), registerRule.MatchString(t):
			// A quiz section, a table row and a rule line are not prose.
		default:
			body := registerQuote.ReplaceAllString(t, "")
			body = registerCitation.ReplaceAllString(body, "")
			body = registerLink.ReplaceAllString(body, "$1")
			body = registerImage.ReplaceAllString(body, "$1")
			if body = strings.TrimSpace(body); body != "" && !registerSource.MatchString(body) {
				prose = append(prose, body)
			}
		}
	}
	return strings.Join(prose, "\n"), steps
}

// registerCodeSteps keeps a fenced block of arithmetic: at least two stepped lines and no box
// drawing. Every filled line is kept, as the tool keeps them.
func registerCodeSteps(body []string) []string {
	var filled []string
	arithmetic := 0
	diagram := false
	for _, l := range body {
		if strings.TrimSpace(l) == "" {
			continue
		}
		filled = append(filled, strings.TrimSpace(l))
		if registerIsStep(l) {
			arithmetic++
		}
		if strings.ContainsAny(l, registerBoxChars) {
			diagram = true
		}
	}
	if diagram || arithmetic < 2 {
		return nil
	}
	return filled
}

// registerIsStep is `isStepLine` in measure.mjs: a short line with a digit and an operator, that
// is not a sentence.
func registerIsStep(line string) bool {
	t := strings.TrimSpace(line)
	if t == "" || utf8.RuneCountInString(t) > 90 {
		return false
	}
	if !strings.ContainsFunc(t, unicode.IsDigit) || !strings.ContainsAny(t, "=+-×*/^≈→") {
		return false
	}
	if strings.HasSuffix(t, ".") || strings.HasSuffix(t, "!") || strings.HasSuffix(t, "?") {
		if registerWordPair.MatchString(t) {
			return false
		}
	}
	return true
}

// registerSentences splits the prose the way `splitSentences` does: a list item is a sentence,
// and a line is cut at a terminator followed by a space, unless the word before it is an
// abbreviation.
func registerSentences(prose string) []string {
	var out []string
	for _, raw := range strings.Split(prose, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		if m := registerItem.FindStringSubmatch(line); m != nil {
			if body := strings.TrimSpace(m[1]); body != "" {
				out = append(out, body)
			}
			continue
		}
		out = append(out, registerSplitInline(line)...)
	}
	var kept []string
	for _, s := range out {
		if strings.ContainsFunc(s, unicode.IsLetter) {
			kept = append(kept, s)
		}
	}
	return kept
}

func registerSplitInline(line string) []string {
	chars := []rune(line)
	var out []string
	var buf []rune
	for i := 0; i < len(chars); i++ {
		buf = append(buf, chars[i])
		c := chars[i]
		if c != '.' && c != '!' && c != '?' && c != '…' {
			continue
		}
		for i+1 < len(chars) && strings.ContainsRune(".!?…", chars[i+1]) {
			i++
			buf = append(buf, chars[i])
		}
		for i+1 < len(chars) && strings.ContainsRune("»\"”’)]'", chars[i+1]) {
			i++
			buf = append(buf, chars[i])
		}
		if i+1 >= len(chars) {
			break
		}
		if !unicode.IsSpace(chars[i+1]) {
			continue
		}
		head := strings.TrimSpace(string(buf))
		if registerAbbreviationCut(head, string(chars[i+1:])) {
			continue
		}
		if registerDigits.MatchString(lastWordOf(head)) || utf8.RuneCountInString(head) < 3 {
			continue
		}
		out = append(out, head)
		buf = nil
		for i+1 < len(chars) && unicode.IsSpace(chars[i+1]) {
			i++
		}
	}
	if rest := strings.TrimSpace(string(buf)); rest != "" {
		out = append(out, rest)
	}
	return out
}

// registerAbbreviationCut reports whether a terminator after an abbreviation does not end the
// sentence: «p.ej. el robot» continues, «Dr. García» continues, «etc. Y sigue» ends.
func registerAbbreviationCut(head, rest string) bool {
	last := lastWordOf(head)
	if !registerAbbrev[strings.ToLower(last)] {
		return false
	}
	next := firstRune(strings.TrimLeftFunc(rest, unicode.IsSpace))
	return registerTitle.MatchString(last) || !strings.ContainsRune("ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÑ¿¡«\"", next)
}

// lastWordOf is the last word of a sentence head, without its closing marks.
func lastWordOf(head string) string {
	fields := strings.Fields(strings.TrimRight(head, ".!?…»\"”’)]'"))
	if len(fields) == 0 {
		return head
	}
	return fields[len(fields)-1]
}

func firstRune(s string) rune {
	r, _ := utf8.DecodeRuneInString(s)
	return r
}

// registerWords is `tokenize` in measure.mjs: code spans, math delimiters and marks are not words.
func registerWords(text string) []string {
	clean := registerCodeSpan.ReplaceAllString(text, " ")
	clean = registerMathInl.ReplaceAllString(clean, " ")
	clean = registerMarks.ReplaceAllString(clean, " ")
	words := registerWord.FindAllString(clean, -1)
	for i, w := range words {
		words[i] = strings.TrimSuffix(strings.TrimSuffix(w, "'s"), "’s")
	}
	return words
}

// registerPercentile is `percentile` in measure.mjs: linear between the two ranks around p.
func registerPercentile(xs []float64, p float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	sorted := append([]float64(nil), xs...)
	sort.Float64s(sorted)
	idx := float64(len(sorted)-1) * p
	lo, hi := int(math.Floor(idx)), int(math.Ceil(idx))
	if lo == hi {
		return sorted[lo]
	}
	return sorted[lo] + (sorted[hi]-sorted[lo])*(idx-float64(lo))
}

// registerMeasures is what the rules read from one part: the numbers `measureText` reports.
type registerMeasures struct {
	nWords     float64
	mean, p90  float64
	bold       int
	contrast   int
	inline     int
	stepped    int
	longestRun int
	defs       []int
	ejemplo    int
}

func (m registerMeasures) per1000(n int) float64 {
	if m.nWords == 0 {
		return 0
	}
	return float64(n) / m.nWords * 1000
}

func registerMeasure(text string) registerMeasures {
	prose, steps := registerProse(text)
	sentences := registerSentences(prose)
	m := registerMeasures{nWords: float64(len(registerWords(prose)))}

	var lengths []float64
	for _, s := range sentences {
		if n := len(registerWords(s)); n > 0 {
			lengths = append(lengths, float64(n))
		}
	}
	for _, n := range lengths {
		m.mean += n
	}
	if len(lengths) > 0 {
		m.mean /= float64(len(lengths))
	}
	m.p90 = registerPercentile(lengths, 0.9)

	for _, match := range registerBoldSpan.FindAllStringSubmatch(prose, -1) {
		if name := strings.TrimSpace(match[1]); name != "" && !registerBoldStop[strings.ToLower(name)] {
			m.bold++
		}
	}
	for _, re := range registerContrasts {
		m.contrast += len(re.FindAllStringIndex(prose, -1))
	}
	for _, s := range sentences {
		if registerCalc.MatchString(s) {
			m.inline++
		}
	}
	run := 0
	for _, s := range steps {
		if registerIsStep(s) {
			m.stepped++
			run++
			m.longestRun = max(m.longestRun, run)
		} else {
			run = 0
		}
	}
	m.defs, m.ejemplo = registerDefinitions(sentences)
	return m
}

// registerFindings is the prose register measured on one part, against the learner's limits: each rule
// that fails names the numbers that failed it. The text is the part's own file.
func registerFindings(text string, lim rules.RegisterLimits) []string {
	m := registerMeasure(text)
	var findings []string
	for _, finding := range []string{
		registerFramesFinding(m, lim),
		registerBoldFinding(m, lim),
		registerSceneFinding(m, lim),
		registerContrastFinding(m, lim),
		registerStepsFinding(m, lim),
	} {
		if finding != "" {
			findings = append(findings, finding)
		}
	}
	return findings
}

// frases-largas: the mean and the 90th percentile of words per sentence. Zero limits are not declared.
func registerFramesFinding(m registerMeasures, lim rules.RegisterLimits) string {
	if lim.MeanWords == 0 && lim.P90Words == 0 {
		return ""
	}
	if m.mean <= lim.MeanWords && m.p90 <= lim.P90Words {
		return ""
	}
	return fmt.Sprintf(
		"frases-largas: media %.1f palabras por frase (tope %.0f) · p90 %.1f (tope %.0f) — divide las frases largas: una idea por frase",
		m.mean, lim.MeanWords, m.p90, lim.P90Words)
}

// sin-negritas: bold term spans per thousand prose words.
func registerBoldFinding(m registerMeasures, lim rules.RegisterLimits) string {
	if lim.Negritas == 0 || m.per1000(m.bold) >= lim.Negritas {
		return ""
	}
	return fmt.Sprintf(
		"sin-negritas: %.1f negrita(s)-término por 1000 palabras (mínimo %.0f) — marca cada término técnico en negrita y defínelo en una línea",
		m.per1000(m.bold), lim.Negritas)
}

// sin-escena-antes: the share of definitions that come after the part's first concrete example.
// Without a definition there is nothing to place, and no example means every definition came first.
func registerSceneFinding(m registerMeasures, lim rules.RegisterLimits) string {
	if len(m.defs) == 0 {
		return ""
	}
	before := 0
	for _, i := range m.defs {
		if m.ejemplo < 0 || i < m.ejemplo {
			before++
		}
	}
	after := float64(len(m.defs)-before) / float64(len(m.defs))
	if after+1e-9 >= lim.EscenaAntes {
		return ""
	}
	return fmt.Sprintf(
		"sin-escena-antes: %.0f %% de las definiciones van después del primer ejemplo (mínimo %.0f %%) — dibuja o nombra el ejemplo antes de definir",
		after*100, lim.EscenaAntes*100)
}

// sin-contraste: before/after markers per thousand prose words.
func registerContrastFinding(m registerMeasures, lim rules.RegisterLimits) string {
	if lim.Contrast == 0 || m.per1000(m.contrast) >= lim.Contrast {
		return ""
	}
	return fmt.Sprintf(
		"sin-contraste: %.1f marcador(es) de contraste por 1000 palabras (mínimo %.0f) — escribe un antes y un después",
		m.per1000(m.contrast), lim.Contrast)
}

// cuentas-sin-pasos: a calculation in a sentence, or a stepped block, is stepped line by line.
func registerStepsFinding(m registerMeasures, lim rules.RegisterLimits) string {
	calcula := m.inline > 0 || m.stepped > 0
	if !calcula || (lim.Steps == 0 && lim.Run == 0) {
		return ""
	}
	if m.per1000(m.stepped) >= lim.Steps && float64(m.longestRun) >= lim.Run {
		return ""
	}
	return fmt.Sprintf(
		"cuentas-sin-pasos: %d cuenta(s) en la frase · %.1f renglón(es) de cuenta por 1000 palabras (mínimo %.0f), bloque de %d (mínimo %.0f) — pásala a renglones, un paso por línea",
		m.inline, m.per1000(m.stepped), lim.Steps, m.longestRun, lim.Run)
}

// The learner's levels (#250). The file is `niveles-alumno.json` in the Learnings root above the note: the studio
// keeps it equal to the learner's stored preferences, and explain-check reads the same file. It is not
// `preferencias.json`: the store keeps that name as its legacy import, and never writes it again.
const (
	registerPreferences = "niveles-alumno.json"
	// registerRootDepth bounds the search: `<root>/<tema>/explicaciones/<nota>.md` is two folders up, and
	// `<root>/_archivo/<tema>/explicaciones/<nota>.md` is three. A file further up is not this learner's.
	registerRootDepth = 4
	registerDefault   = rules.RegisterDefaultLevel
)

// learnerLevels returns the learner's sencillez and tecnicidad for a note. The nearest folder above the
// note, at most registerRootDepth up, that holds the file gives them. A folder that holds learning.db is
// the root itself: with no file there, the defaults apply. An unreadable file or an unknown level is the default.
func learnerLevels(note string) (sencillez, tecnicidad string) {
	dir := filepath.Dir(note)
	for depth := 0; depth < registerRootDepth; depth++ {
		if raw, err := os.ReadFile(filepath.Join(dir, registerPreferences)); err == nil {
			return levelsFrom(raw)
		}
		if _, err := os.Stat(filepath.Join(dir, "learning.db")); err == nil {
			break
		}
		up := filepath.Dir(dir)
		if up == dir {
			break
		}
		dir = up
	}
	return registerDefault, registerDefault
}

// levelsFrom reads the two levels from a preferences document.
func levelsFrom(raw []byte) (string, string) {
	var doc struct {
		Aspectos []struct {
			ID    string `json:"id"`
			Nivel string `json:"nivel"`
		} `json:"aspectos"`
	}
	levels := map[string]string{}
	if err := json.Unmarshal(raw, &doc); err == nil {
		for _, a := range doc.Aspectos {
			levels[a.ID] = a.Nivel
		}
	}
	pick := func(id string) string {
		for _, level := range rules.RegisterLevels {
			if levels[id] == level {
				return level
			}
		}
		return registerDefault
	}
	return pick("sencillez"), pick("tecnicidad")
}

// registerDefinitions is `definicionesYEjemplos` in measure.mjs: the sentences that define a term
// (a bold line, or a bold term followed by «es»/«son»), and the first concrete example.
func registerDefinitions(sentences []string) (defs []int, ejemplo int) {
	ejemplo = -1
	for i, s := range sentences {
		if ejemplo < 0 {
			for _, re := range registerExamples {
				if re.MatchString(s) {
					ejemplo = i
					break
				}
			}
		}
		t := strings.TrimSpace(s)
		if registerDefLine.MatchString(t) || registerDefCue.MatchString(t) {
			defs = append(defs, i)
		}
	}
	return defs, ejemplo
}
