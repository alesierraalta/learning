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

	// asciiArrow matches a line that draws an arrow with box characters.
	asciiArrow = regexp.MustCompile(`─+[►▶▸]`)

	mathBlock = regexp.MustCompile(`(?s)<lk-math[^>]*>(.*?)</lk-math>`)
	mathMacro = regexp.MustCompile(`\\[A-Za-z]+`)
	mathGroup = regexp.MustCompile(`\{[^}]*\}`)
	mathWord  = regexp.MustCompile(`[A-Za-z]+`)

	closingSummary = regexp.MustCompile(`(?im)^#{1,6}\s*(Resumen para guardar|Apuntes comprimidos|En resumen)`)
)

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

// formulaSymbols returns the symbols a part's formulas use: every LaTeX macro
// (`\gamma`) and every single-letter name that is not part of a macro or a
// group. It mirrors `explain-check.mjs` rule 7b.
func formulaSymbols(text string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(s string) {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	for _, block := range mathBlock.FindAllStringSubmatch(text, -1) {
		body := block[1]
		for _, macro := range mathMacro.FindAllString(body, -1) {
			add(macro)
		}
		clean := mathMacro.ReplaceAllString(body, " ")
		clean = mathGroup.ReplaceAllString(clean, " ")
		for _, word := range mathWord.FindAllString(clean, -1) {
			if len(word) == 1 {
				add(word)
			}
		}
	}
	return out
}

// symbolNamed reports whether the text names a formula symbol, either quoted
// (`x`, «x», "x") or followed by =, →, ->, : or "es". A symbol the part never
// names is a formula the learner cannot read.
func symbolNamed(text, symbol string) bool {
	name := strings.TrimPrefix(symbol, `\`)
	quoted := "(`|«|\")\\s*\\\\?" + regexp.QuoteMeta(name) + "\\s*(`|»|\")"
	defined := `\b` + regexp.QuoteMeta(name) + `\s*(=|→|->|:|es\b)`
	pattern, err := regexp.Compile("(?i)" + quoted + "|" + defined)
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

	body := withoutCodeFences(text)
	if scenes := len(sceneOpen.FindAllStringIndex(body, -1)); scenes > th.MaxScenes {
		findings = append(findings, fmt.Sprintf(
			"%d <lk-scene> scenes (limit %d) — keep one scene and move the other to its own part",
			scenes, th.MaxScenes))
	}
	if decks := len(walkthroughOpen.FindAllStringIndex(body, -1)); decks > th.MaxWalkthroughs {
		findings = append(findings, fmt.Sprintf(
			"%d <lk-walkthrough> decks (limit %d) — one walkthrough per part; a second change is a step of the same deck or belongs to another part",
			decks, th.MaxWalkthroughs))
	}

	if drawn := drawnLines(text); drawn > 0 {
		findings = append(findings, fmt.Sprintf(
			"%d line(s) drawn with ASCII box characters — draw it as an <lk-scene> or a mermaid block, never with characters",
			drawn))
	}

	if unnamed := unnamedSymbols(text); len(unnamed) > 0 {
		findings = append(findings, fmt.Sprintf(
			"formula symbol(s) %s never named — add one legend line per symbol right after the formula («`%s` es …»)",
			strings.Join(unnamed, ", "), unnamed[0]))
	}

	if m := closingSummary.FindStringSubmatch(text); m != nil {
		findings = append(findings, fmt.Sprintf(
			"closes with a %q summary, which the standard forbids — end the part on its last content section",
			m[1]))
	}

	return findings
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
	return passCheck(decl.ID, fmt.Sprintf(
		"%s meets the explanation standard: %d prose words (limit %d), %d content section(s) (limit %d), %s, %d scene(s) (limit %d), %d walkthrough(s) (limit %d)",
		rel, proseWords(text), th.MaxProseWords, len(contentSections(text)), th.MaxContentSections,
		route, len(sceneOpen.FindAllStringIndex(withoutCodeFences(text), -1)), th.MaxScenes,
		len(walkthroughOpen.FindAllStringIndex(withoutCodeFences(text), -1)), th.MaxWalkthroughs))
}

// scenePayload parses an <lk-scene> block: it reports whether the payload draws
// something and whether it carries its own caption. The reader draws the caption
// under the scene (`kit.js`), so a captioned scene is its own reading guide.
func scenePayload(block string) (draws, captioned bool) {
	lower := asciiLower(block)
	start := strings.Index(lower, "<script")
	if start < 0 {
		return false, false
	}
	open := strings.IndexByte(lower[start:], '>')
	if open < 0 || !strings.Contains(lower[start:start+open+1], "application/json") {
		return false, false
	}
	from := start + open + 1
	end := strings.Index(lower[from:], "</script")
	if end < 0 {
		return false, false
	}
	var spec map[string]json.RawMessage
	if err := json.Unmarshal([]byte(block[from:from+end]), &spec); err != nil {
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
		"dashed", "labels"} {
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
