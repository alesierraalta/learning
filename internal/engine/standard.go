package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"

	"learning/internal/rules"
)

// The measured explanation standard: a part is one idea, and the standard says
// how big one idea is. `skills/explicacion-interactiva/SKILL.md` «Tamaño de
// parte» and `references/estandar-explicacion.md` §0 fix the budget and
// `tools/explain-check.mjs` / `tools/part-lint.mjs` measure it; this check
// enforces the same numbers inside the engine so a part that misses them never
// reaches the learner, and the tutor's own run of the tools agrees with the
// refusal it gets here.
//
// The counting is a port of the tools, not a reinterpretation: the prose budget
// is `part-lint.mjs` byte for byte (code fences, scene and walkthrough blocks,
// table lines, headings and loose tags are not prose), and the structural rules
// are `explain-check.mjs` (route, content sections, scenes, walkthroughs, drawn
// ASCII, formula legend, no closing summary). Geometry (scene-gate's overlap and
// typography) stays in the node tools: it needs a browser, and the engine does
// not run one. `thresholds.partStandard` carries the numbers; a rules snapshot
// without that block declares no standard and is never measured against it.

var (
	// proseFence removes fenced blocks: code and text blocks are not read as
	// prose.
	proseFence = regexp.MustCompile("(?s)```.*?```")
	// proseScene and proseWalkthrough remove the drawn blocks: a scene and a
	// walkthrough are looked at, not read.
	proseScene       = regexp.MustCompile(`(?s)<lk-scene.*?</lk-scene>`)
	proseWalkthrough = regexp.MustCompile(`(?s)<lk-walkthrough.*?</lk-walkthrough>`)
	// proseTableLine removes a markdown table row.
	proseTableLine = regexp.MustCompile(`(?m)^\|.*\|$`)
	// proseHeading removes a heading line.
	proseHeading = regexp.MustCompile(`(?m)^#{1,6}\s.*$`)
	// proseTag removes a loose HTML tag, so only its text remains.
	proseTag = regexp.MustCompile(`<[^>]+>`)

	// h2Heading matches a level-2 heading and captures its title: the standard
	// counts content sections at that level only.
	h2Heading = regexp.MustCompile(`(?m)^##[ \t]+(.+)$`)
	// rutaHeading matches the route heading on its own line.
	rutaHeading = regexp.MustCompile(`^##\s*Ruta\s*$`)
	// h2Start matches the line that ends the route section: the next level-2
	// heading (or a deeper one, as the tool reads it).
	h2Start = regexp.MustCompile(`^##\s`)
	// rutaLine matches a numbered route line (1. / 2) / …).
	rutaLine = regexp.MustCompile(`^\s*\d+[.)]`)

	sceneOpen       = regexp.MustCompile(`<lk-scene[\s>]`)
	walkthroughOpen = regexp.MustCompile(`<lk-walkthrough[\s>]`)
	// sceneBlock is a closed scene: the standard asks whether its payload draws,
	// so it reads the whole block and not only its opening tag.
	sceneBlock = regexp.MustCompile(`(?s)<lk-scene[\s>].*?</lk-scene>`)
	// walkthroughBlock is a closed walkthrough: its steps carry the scenes, and a
	// scene's formula is a formula the reader has to be able to read.
	walkthroughBlock = regexp.MustCompile(`(?s)<lk-walkthrough[\s>].*?</lk-walkthrough>`)

	// proseVisualBlocks are the closed visual blocks the rhythm rule removes:
	// a scene, a walkthrough or a quiz is looked at, not read. The tool names
	// them one by one because a regular expression cannot back-reference the
	// tag it opened.
	proseVisualBlocks = []*regexp.Regexp{
		regexp.MustCompile(`(?s)<lk-scene[\s\S]*?</lk-scene>`),
		regexp.MustCompile(`(?s)<lk-walkthrough[\s\S]*?</lk-walkthrough>`),
		regexp.MustCompile(`(?s)<lk-quiz[\s\S]*?</lk-quiz>`),
		regexp.MustCompile(`(?s)<lk-quick-quiz[\s\S]*?</lk-quick-quiz>`),
	}
	// proseNotProse matches a line that is not a paragraph: a heading, a table
	// row or a tag line.
	proseNotProse = regexp.MustCompile(`^\s*(#{1,6}\s|\||<)`)
	// proseBullet matches a list item: each bullet is its own unit, so a list of
	// short bullets is never a wall of prose.
	proseBullet = regexp.MustCompile(`^\s*(?:[-*]\s+|\d+[.)]\s+)`)
	// proseMarker strips the marker a paragraph line opens with.
	proseMarker = regexp.MustCompile(`^\s*(>\s?|[-*]\s+|\d+[.)]\s+)`)
	// sentenceEnd counts a sentence: a terminator followed by a space or the end
	// of the paragraph.
	sentenceEnd = regexp.MustCompile(`[.!?](\s|$)`)

	// asciiArrow matches a line that draws an arrow with box characters.
	asciiArrow = regexp.MustCompile(`─+[►▶▸]`)

	mathBlock = regexp.MustCompile(`(?s)<lk-math[^>]*>(.*?)</lk-math>`)
	// mathDisplay and mathInline are the plain LaTeX a part writes when it skips
	// the kit's formula element: `$$…$$` and `$…$`. The legend reads them too,
	// because a formula is a formula wherever it is written.
	mathDisplay = regexp.MustCompile(`(?s)\$\$(.+?)\$\$`)
	mathInline  = regexp.MustCompile(`\$([^$\n]+?)\$`)
	// mathInlineLooksLikeMath keeps prose prices out of the legend: an inline
	// `$…$` counts as math when it carries a macro, an operator or no space.
	mathInlineLooksLikeMath = regexp.MustCompile(`[\\^_=]`)
	mathMacro               = regexp.MustCompile(`\\[A-Za-z]+`)
	mathGroup               = regexp.MustCompile(`\{[^}]*\}`)
	mathWord                = regexp.MustCompile(`[A-Za-z]+`)
	// mathGreek reads a Greek letter as the symbol it is: a formula drawn with
	// the scene's atoms writes `σ` and `μ`, never `\sigma` and `\mu`.
	mathGreek = regexp.MustCompile(`\p{Greek}`)
	// mathEuler drops Euler's number: `e^{…}` is a constant, not a symbol the part
	// defines. A bare `e` elsewhere stays a symbol.
	mathEuler = regexp.MustCompile(`(^|[^A-Za-z])e\s*\^`)

	closingSummary = regexp.MustCompile(`(?im)^#{1,6}\s*(Resumen para guardar|Apuntes comprimidos|En resumen)`)
)

// mathGreekMacros are the LaTeX macros that name a Greek letter: the variables of
// a formula, which a part writes either as a macro (`\sigma`) or literally (`σ`).
// Every other macro is a command, and a command is never a symbol.
var mathGreekMacros = map[string]bool{
	"alpha": true, "beta": true, "gamma": true, "delta": true, "epsilon": true,
	"varepsilon": true, "zeta": true, "eta": true, "theta": true, "vartheta": true,
	"iota": true, "kappa": true, "lambda": true, "mu": true, "nu": true, "xi": true,
	"omicron": true, "pi": true, "varpi": true, "rho": true, "varrho": true,
	"sigma": true, "varsigma": true, "tau": true, "upsilon": true, "phi": true,
	"varphi": true, "chi": true, "psi": true, "omega": true, "digamma": true,
	"Gamma": true, "Delta": true, "Theta": true, "Lambda": true, "Xi": true,
	"Pi": true, "Sigma": true, "Upsilon": true, "Phi": true, "Psi": true, "Omega": true,
}

// mathConstants are the Greek macros that name a constant instead of a variable:
// π is the same number in every formula, so the legend never asks who it is.
var mathConstants = map[string]bool{"pi": true, "Pi": true, "varpi": true}

// mathConstantLetters is the same rule for a formula that writes the letter itself.
var mathConstantLetters = map[string]bool{"π": true, "Π": true, "ϖ": true}

// asciiBoxChars are the characters a drawn diagram leaves behind: the standard
// draws with an <lk-scene> or a mermaid block, never with characters.
const asciiBoxChars = "┌┐└┘├┤┬┴┼│╔╗╚╝║█▓▒░"

// proseWords counts the words a part asks the reader to read, exactly as
// `tools/part-lint.mjs` counts them: code fences, scene and walkthrough blocks,
// table rows, headings and loose tags are removed first, so a visual never
// spends the prose budget.
func proseWords(text string) int {
	out := strings.ReplaceAll(text, "\r\n", "\n")
	out = proseFence.ReplaceAllString(out, " ")
	out = proseScene.ReplaceAllString(out, " ")
	out = proseWalkthrough.ReplaceAllString(out, " ")
	out = proseTableLine.ReplaceAllString(out, " ")
	out = proseHeading.ReplaceAllString(out, " ")
	out = proseTag.ReplaceAllString(out, " ")
	return len(strings.Fields(out))
}

// proseParagraphs returns the paragraphs the rhythm rule reads, exactly as
// `tools/explain-check.mjs` builds them: fenced code and the closed visual
// blocks are not prose, a heading, a table row or a tag line is not a
// paragraph, a bullet is its own unit (a list is one idea per line, never a
// wall), and the lines of a paragraph are joined with a space.
func proseParagraphs(text string) []string {
	out := strings.ReplaceAll(text, "\r\n", "\n")
	out = proseFence.ReplaceAllString(out, "\n\n")
	for _, block := range proseVisualBlocks {
		out = block.ReplaceAllString(out, "\n\n")
	}
	var blocks [][]string
	var current []string
	for _, line := range strings.Split(out, "\n") {
		if proseNotProse.MatchString(line) {
			continue
		}
		bullet := proseBullet.MatchString(line)
		if bullet || strings.TrimSpace(line) == "" {
			if len(current) > 0 {
				blocks = append(blocks, current)
			}
			current = nil
			if bullet {
				current = []string{line}
			}
			continue
		}
		current = append(current, line)
	}
	if len(current) > 0 {
		blocks = append(blocks, current)
	}
	paragraphs := make([]string, 0, len(blocks))
	for _, block := range blocks {
		lines := make([]string, 0, len(block))
		for _, line := range block {
			lines = append(lines, proseMarker.ReplaceAllString(line, ""))
		}
		if p := strings.TrimSpace(strings.Join(lines, " ")); p != "" {
			paragraphs = append(paragraphs, p)
		}
	}
	return paragraphs
}

// wallParagraphs returns the paragraphs that carry more sentences than the
// standard allows. The sentence is the tool's: a terminator followed by a
// space or the end of the paragraph.
func wallParagraphs(text string, max int) []string {
	var walls []string
	for _, p := range proseParagraphs(text) {
		if len(sentenceEnd.FindAllStringIndex(p, -1)) > max {
			walls = append(walls, p)
		}
	}
	return walls
}

// openingWords returns the first n words of a paragraph, so a refusal quotes
// the wall the tutor has to find and split.
func openingWords(p string, n int) string {
	fields := strings.Fields(p)
	if len(fields) > n {
		fields = fields[:n]
	}
	return strings.Join(fields, " ")
}

// contentSections lists the part's level-2 headings except the route and the
// mini-quiz: the standard allows two content sections, because a part is one
// idea, and the mini-quiz is the quiz the same standard requires, not a third
// idea. `tools/explain-check.mjs` counts them the same way.
func contentSections(text string) []string {
	var out []string
	for _, m := range h2Heading.FindAllStringSubmatch(text, -1) {
		title := strings.TrimSpace(m[1])
		if strings.EqualFold(title, "Ruta") || strings.Contains(strings.ToLower(title), "mini-quiz") {
			continue
		}
		out = append(out, title)
	}
	return out
}

// routeLines reports whether the part opens a `## Ruta` section and how many
// numbered lines it lists.
func routeLines(text string) (bool, int) {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	for i, line := range lines {
		if !rutaHeading.MatchString(line) {
			continue
		}
		n := 0
		for _, rest := range lines[i+1:] {
			if h2Start.MatchString(rest) {
				break
			}
			if rutaLine.MatchString(rest) {
				n++
			}
		}
		return true, n
	}
	return false, 0
}

// drawnLines counts the lines that draw with box characters. Fenced blocks are
// code, not a drawing, so they are not judged.
func drawnLines(text string) int {
	n := 0
	for _, line := range strings.Split(withoutCodeFences(text), "\n") {
		if strings.ContainsAny(line, asciiBoxChars) || asciiArrow.MatchString(line) {
			n++
		}
	}
	return n
}

// formulaBodies returns the formulas a part writes, in order, and whether any of
// them is plain LaTeX (`$$…$$` or `$…$`) instead of the kit's `<lk-math>`
// element. A formula is a formula wherever it is written, so the legend reads
// both; the plain form is what the refusal tells the tutor to replace.
func formulaBodies(text string) (bodies []string, plain bool) {
	for _, block := range mathBlock.FindAllStringSubmatch(text, -1) {
		bodies = append(bodies, block[1])
	}
	for _, block := range mathDisplay.FindAllStringSubmatch(text, -1) {
		bodies = append(bodies, block[1])
		plain = true
	}
	// The display math is removed first: `$$x$$` also matches the inline form.
	rest := mathDisplay.ReplaceAllString(text, " ")
	for _, block := range mathInline.FindAllStringSubmatch(rest, -1) {
		body := block[1]
		if !mathInlineLooksLikeMath.MatchString(body) && strings.ContainsAny(body, " \t") {
			continue
		}
		bodies = append(bodies, body)
		plain = true
	}
	return bodies, plain
}

// formulaSymbols returns the symbols a part's formulas use: every Greek-letter
// macro (`\gamma`), every single-letter name that is not part of a macro or a
// group, and every Greek letter, whichever way the part writes it. The formulas
// are the `<lk-math>` blocks, the plain LaTeX a part writes instead, and the
// formulas a scene draws symbol by symbol. It mirrors `explain-check.mjs` rule 7b.
//
// A macro that is not a Greek letter is a command: it lays the formula out
// (`\frac`, `\left`, `\right`), operates (`\cdot`, `\sum`, `\int`) or names a
// function (`\exp`, `\log`, `\mathrm`, `\text`), and a command is never a symbol
// the legend defines. `\pi`, `\Pi` and `\varpi` are constants, and so is `e` as
// Euler's number (`e^{…}`): a constant is not a symbol either.
func formulaSymbols(text string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(s string) {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	bodies, _ := formulaBodies(text)
	bodies = append(bodies, sceneFormulaBodies(text)...)
	for _, body := range bodies {
		for _, macro := range mathMacro.FindAllString(body, -1) {
			name := strings.TrimPrefix(macro, `\`)
			if mathGreekMacros[name] && !mathConstants[name] {
				add(macro)
			}
		}
		clean := mathMacro.ReplaceAllString(body, " ")
		clean = mathGroup.ReplaceAllString(clean, " ")
		clean = mathEuler.ReplaceAllString(clean, " ")
		for _, word := range mathWord.FindAllString(clean, -1) {
			if len(word) == 1 {
				add(word)
			}
		}
		for _, letter := range mathGreek.FindAllString(clean, -1) {
			if !mathConstantLetters[letter] {
				add(letter)
			}
		}
	}
	return out
}

// sceneFormulaDoc is the part of a scene payload the legend reads: the formulas
// a scene draws, one atom per symbol. A walkthrough carries one scene per step,
// so the steps are read like the scene of a still figure.
type sceneFormulaDoc struct {
	Scene *sceneFormulaNode  `json:"scene"`
	Steps []sceneFormulaStep `json:"steps"`
}

type sceneFormulaStep struct {
	Scene *sceneFormulaNode `json:"scene"`
}

type sceneFormulaNode struct {
	Formulas []sceneFormulaAtoms `json:"formulas"`
	Formula  *sceneFormulaAtoms  `json:"formula"`
}

type sceneFormulaAtoms struct {
	Atoms []struct {
		T string `json:"t"`
	} `json:"atoms"`
}

// collect appends every formula the node draws, in the order it draws them.
func (n *sceneFormulaNode) collect(bodies *[]string) {
	if n == nil {
		return
	}
	for _, f := range append([]sceneFormulaAtoms{}, n.Formulas...) {
		*bodies = append(*bodies, f.body())
	}
	if n.Formula != nil {
		*bodies = append(*bodies, n.Formula.body())
	}
}

// body is the formula as the reader sees it: the atoms, joined.
func (f sceneFormulaAtoms) body() string {
	var b strings.Builder
	for _, atom := range f.Atoms {
		b.WriteString(atom.T)
	}
	return b.String()
}

// sceneFormulaBodies returns the formulas a part draws inside its scenes. An
// annotated formula is drawn symbol by symbol, one atom per symbol, so the atoms
// are the formula and the scene's callouts are its legend. A formula drawn in a
// scene is a formula the reader has to read, exactly like an `<lk-math>` block.
func sceneFormulaBodies(text string) []string {
	var bodies []string
	for _, block := range sceneFormulaBlocks(text) {
		payload, ok := jsonPayload(block)
		if !ok {
			continue
		}
		var doc sceneFormulaDoc
		if json.Unmarshal([]byte(payload), &doc) != nil {
			continue
		}
		doc.Scene.collect(&bodies)
		for _, step := range doc.Steps {
			step.Scene.collect(&bodies)
		}
	}
	return bodies
}

// sceneFormulaBlocks returns the closed scene and walkthrough blocks outside
// fenced code: a scene inside a fence is an example of markup, not a drawing.
func sceneFormulaBlocks(text string) []string {
	plain := withoutCodeFences(text)
	return append(sceneBlock.FindAllString(plain, -1), walkthroughBlock.FindAllString(plain, -1)...)
}

// sceneBlocks returns the closed `<lk-scene>` blocks outside fenced code, in the
// order they appear.
func sceneBlocks(text string) []string {
	return sceneBlock.FindAllString(withoutCodeFences(text), -1)
}

// drawnScenes counts the `<lk-scene>` blocks whose payload draws something. A
// scene that renders an empty stage is not a drawn example, and a walkthrough
// is a different element: it does not substitute for the scene.
func drawnScenes(text string) int {
	n := 0
	for _, block := range sceneBlocks(text) {
		if draws, _ := scenePayload(block); draws {
			n++
		}
	}
	return n
}

// symbolNamed reports whether the text names a formula symbol, either quoted
// (`x`, «x», "x") or followed by =, →, ->, : or "es". A symbol the part never
// names is a formula the learner cannot read. The boundary is a Unicode one: `\b`
// is ASCII, so `\bγ` never matched and a Greek symbol could not be named in the
// callout form the annotated formula uses («① γ: …»). The letter is the same one:
// `Q` and `q` are different symbols, so a `q` elsewhere in the part names nothing.
func symbolNamed(text, symbol string) bool {
	name := strings.TrimPrefix(symbol, `\`)
	quoted := "(`|«|\")\\s*\\\\?" + regexp.QuoteMeta(name) + "\\s*(`|»|\")"
	defined := `(^|[^\p{L}\p{N}_])` + regexp.QuoteMeta(name) + `\s*(=|→|->|:|es\b)`
	pattern, err := regexp.Compile(quoted + "|" + defined)
	if err != nil {
		return true
	}
	return pattern.MatchString(text)
}

// unnamedSymbols lists the formula symbols the part never names.
func unnamedSymbols(text string) []string {
	var out []string
	for _, symbol := range formulaSymbols(text) {
		if !symbolNamed(text, symbol) {
			out = append(out, strings.TrimPrefix(symbol, `\`))
		}
	}
	return out
}

// standardFindings returns one finding per rule the part misses, each naming the
// rule, the measured value, the limit and the fix, so the tutor can correct the
// part from the message alone.
func standardFindings(text string, th rules.PartStandardThresholds) []string {
	var findings []string

	if words := proseWords(text); words > th.MaxProseWords {
		findings = append(findings, fmt.Sprintf(
			"%d prose words (limit %d; code, tables, scenes and walkthroughs are not counted) — split the part in two, never compress or summarise it to fit",
			words, th.MaxProseWords))
	}

	if sections := contentSections(text); len(sections) > th.MaxContentSections {
		findings = append(findings, fmt.Sprintf(
			"%d content sections (limit %d, besides ## Ruta) — split the part in two, one idea per part",
			len(sections), th.MaxContentSections))
	}

	found, lines := routeLines(text)
	switch {
	case !found:
		findings = append(findings, fmt.Sprintf(
			"no ## Ruta section — open the part with ## Ruta and %d to %d numbered lines, one step each",
			th.MinRutaLines, th.MaxRutaLines))
	case lines < th.MinRutaLines || lines > th.MaxRutaLines:
		findings = append(findings, fmt.Sprintf(
			"## Ruta lists %d numbered line(s) (the route is %d to %d) — name the steps the part actually teaches, one line each",
			lines, th.MinRutaLines, th.MaxRutaLines))
	}

	findings = append(findings, sceneFindings(text, th)...)

	if decks := len(walkthroughOpen.FindAllStringIndex(withoutCodeFences(text), -1)); decks > th.MaxWalkthroughs {
		findings = append(findings, fmt.Sprintf(
			"%d <lk-walkthrough> decks (limit %d) — one walkthrough per part; a second change is a step of the same deck or belongs to another part",
			decks, th.MaxWalkthroughs))
	}

	if th.MaxSentencesPerParagraph > 0 {
		if walls := wallParagraphs(text, th.MaxSentencesPerParagraph); len(walls) > 0 {
			findings = append(findings, fmt.Sprintf(
				"%d paragraph(s) with more than %d sentences — the first opens «%s»; split it: one idea per sentence and one beat per paragraph",
				len(walls), th.MaxSentencesPerParagraph, openingWords(walls[0], 8)))
		}
	}

	if drawn := drawnLines(text); drawn > 0 {
		findings = append(findings, fmt.Sprintf(
			"%d line(s) drawn with ASCII box characters — draw it as an <lk-scene> or a mermaid block, never with characters",
			drawn))
	}

	findings = append(findings, legendFindings(text, th)...)

	if m := closingSummary.FindStringSubmatch(text); m != nil {
		findings = append(findings, fmt.Sprintf(
			"closes with a %q summary, which the standard forbids — end the part on its last content section",
			m[1]))
	}

	return findings
}

// sceneFindings measures the part's scenes: at most `maxScenes`, and, when the
// standard declares it, at least `minScenes` that actually draw. The walkthrough
// is a different element and never substitutes for the drawn example.
func sceneFindings(text string, th rules.PartStandardThresholds) []string {
	var findings []string
	if scenes := len(sceneOpen.FindAllStringIndex(withoutCodeFences(text), -1)); scenes > th.MaxScenes {
		findings = append(findings, fmt.Sprintf(
			"%d <lk-scene> scenes (limit %d) — keep one scene and move the other to its own part",
			scenes, th.MaxScenes))
	}
	if th.MinScenes > 0 {
		if drawn := drawnScenes(text); drawn < th.MinScenes {
			findings = append(findings, fmt.Sprintf(
				"%d drawn <lk-scene> scene(s) (the part needs %d) — dibuja el ejemplo con <lk-scene>: a JSON payload with boxes, arrows, nodes, bars or formulas the reader draws; a <lk-walkthrough> does not substitute for it, and the scene vocabulary is in skills/explicacion-interactiva/references/visuales.md",
				drawn, th.MinScenes))
		}
	}
	return findings
}

// legendFindings measures the formula legend: every symbol a formula uses has to
// be named, and the fix is the annotated formula scene — the formula drawn symbol
// by symbol with one numbered callout per symbol, each named in its labels line.
// `<lk-math>` draws a clean equation with no arrows, so it is the fix for a
// calculation, never for explaining a formula (#200).
func legendFindings(text string, th rules.PartStandardThresholds) []string {
	unnamed := unnamedSymbols(text)
	if len(unnamed) == 0 {
		return nil
	}
	fix := fmt.Sprintf("draw the formula as an annotated formula scene: one numbered callout per symbol, each named in its labels line («① %s: …»)", unnamed[0])
	if _, plain := formulaBodies(text); plain && th.FormulaElement != "" {
		fix += fmt.Sprintf("; <%s> is for a calculation, never for explaining a formula", th.FormulaElement)
	}
	return []string{fmt.Sprintf("formula symbol(s) %s never named — %s", strings.Join(unnamed, ", "), fix)}
}

// evalPartStandard refuses a part that misses the measured explanation standard.
// It is a separate check so the refusal names the standard and not the visual or
// the walkthrough promise, and so a rules snapshot without the thresholds keeps
// the part checks it started with.
func evalPartStandard(c *evalCtx, decl rules.CheckDecl) Check {
	th := c.r.Thresholds.PartStandard
	if th == nil {
		return skipCheck(decl.ID, "the rules do not declare the explanation standard")
	}
	rel, err := c.partFile()
	if err != nil {
		return failCheck(decl.ID, err.Error())
	}
	data, err := os.ReadFile(absPath(c.ws, rel))
	if err != nil {
		return failCheck(decl.ID, "missing artifact: "+rel)
	}
	text := string(data)
	if findings := standardFindings(text, *th); len(findings) > 0 {
		return failCheck(decl.ID, fmt.Sprintf(
			"part %s misses the explanation standard in %s: %s",
			c.part, rel, strings.Join(findings, "; ")))
	}
	found, lines := routeLines(text)
	route := "no route"
	if found {
		route = itoa(lines) + " route line(s)"
	}
	shape := fmt.Sprintf("%d prose words (limit %d), %d content section(s) (limit %d), %s, %d scene(s) (limit %d), %d walkthrough(s) (limit %d)",
		proseWords(text), th.MaxProseWords, len(contentSections(text)), th.MaxContentSections,
		route, len(sceneOpen.FindAllStringIndex(withoutCodeFences(text), -1)), th.MaxScenes,
		len(walkthroughOpen.FindAllStringIndex(withoutCodeFences(text), -1)), th.MaxWalkthroughs)
	if th.MinScenes > 0 {
		shape += fmt.Sprintf(", %d drawn scene(s) (at least %d)", drawnScenes(text), th.MinScenes)
	}
	if th.MaxSentencesPerParagraph > 0 {
		shape += fmt.Sprintf(", %d paragraph(s) over %d sentences", len(wallParagraphs(text, th.MaxSentencesPerParagraph)), th.MaxSentencesPerParagraph)
	}
	return passCheck(decl.ID, fmt.Sprintf("%s meets the explanation standard: %s", rel, shape))
}

// jsonPayload returns the JSON a kit block carries inside its
// `<script type="application/json">`, and whether it found one.
func jsonPayload(block string) (string, bool) {
	lower := asciiLower(block)
	start := strings.Index(lower, "<script")
	if start < 0 {
		return "", false
	}
	open := strings.IndexByte(lower[start:], '>')
	if open < 0 || !strings.Contains(lower[start:start+open+1], "application/json") {
		return "", false
	}
	from := start + open + 1
	end := strings.Index(lower[from:], "</script")
	if end < 0 {
		return "", false
	}
	return block[from : from+end], true
}

// scenePayload parses an <lk-scene> block: it reports whether the payload draws
// something and whether it carries its own caption. The reader draws the caption
// under the scene (`kit.js`), so a captioned scene is its own reading guide.
func scenePayload(block string) (draws, captioned bool) {
	payload, ok := jsonPayload(block)
	if !ok {
		return false, false
	}
	var spec map[string]json.RawMessage
	if err := json.Unmarshal([]byte(payload), &spec); err != nil {
		return false, false
	}
	var caption string
	if raw, ok := spec["caption"]; ok {
		_ = json.Unmarshal(raw, &caption)
	}
	guided := strings.TrimSpace(caption) != ""
	// The reader draws `spec.scene` (`kit.js` walkScene(spec.scene || {})): a
	// payload without that object renders an empty stage, so it is not a visual.
	raw, ok := spec["scene"]
	if !ok {
		return false, guided
	}
	var scene map[string]json.RawMessage
	if json.Unmarshal(raw, &scene) != nil {
		return false, guided
	}
	return walkSceneDraws(scene), guided
}

// walkSceneDraws reports whether a scene carries at least one entry the kit's
// walkthrough renderer draws (`kit.js` walkScene). It is a presence test, not a
// geometry test: the engine never measures a drawing, `tools/scene-gate.mjs`
// does that in a browser.
func walkSceneDraws(scene map[string]json.RawMessage) bool {
	for _, key := range []string{"sheets", "grids", "gears", "boxes", "nodes", "icons",
		"callouts", "formulas", "formula", "bars", "stats", "policy", "arrows", "badges",
		"dashed", "curves", "paths", "labels"} {
		raw, found := scene[key]
		if !found {
			continue
		}
		var list []json.RawMessage
		if json.Unmarshal(raw, &list) == nil {
			if len(list) > 0 {
				return true
			}
			continue
		}
		var object map[string]json.RawMessage
		if json.Unmarshal(raw, &object) == nil && len(object) > 0 {
			return true
		}
	}
	return false
}
