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
	// proseStory removes the formula and derivation walkthroughs: their JSON is
	// looked at, not read, exactly like a scene or a scene deck.
	proseStory = regexp.MustCompile(`(?s)<lk-story.*?</lk-story>`)
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
	// storyOpen is the formula/derivation walkthrough: the same step deck with a
	// header, a stage and a narrator. It counts as a walkthrough for the part's
	// one-deck rule, and its `kind` decides whether it teaches a formula.
	storyOpen = regexp.MustCompile(`<lk-story[\s>]`)
	// sceneBlock is a closed scene: the standard asks whether its payload draws,
	// so it reads the whole block and not only its opening tag.
	sceneBlock = regexp.MustCompile(`(?s)<lk-scene[\s>].*?</lk-scene>`)
	// walkthroughBlock is a closed walkthrough: its steps carry the scenes, and a
	// scene's formula is a formula the reader has to be able to read.
	walkthroughBlock = regexp.MustCompile(`(?s)<lk-walkthrough[\s>].*?</lk-walkthrough>`)
	// storyBlock is a closed formula/derivation walkthrough.
	storyBlock = regexp.MustCompile(`(?s)<lk-story[\s>].*?</lk-story>`)

	// proseVisualBlocks are the closed visual blocks the rhythm rule removes:
	// a scene, a walkthrough or a quiz is looked at, not read. The tool names
	// them one by one because a regular expression cannot back-reference the
	// tag it opened.
	proseVisualBlocks = []*regexp.Regexp{
		regexp.MustCompile(`(?s)<lk-scene[\s\S]*?</lk-scene>`),
		regexp.MustCompile(`(?s)<lk-walkthrough[\s\S]*?</lk-walkthrough>`),
		regexp.MustCompile(`(?s)<lk-story[\s\S]*?</lk-story>`),
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
	// Un flujo escrito con guiones es geometría escrita, no dibujada (#246).
	asciiArrow = regexp.MustCompile(`─+[►▶▸]|-{2,}>|={2,}>|-{2,}\[`)

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
	findings := standardFindings(text, *th)
	levelsNote := ""
	if th.Register != nil {
		// The register is measured at the learner's own levels, read from the Learnings root of this note.
		sencillez, tecnicidad := learnerLevels(absPath(c.ws, rel))
		findings = append(findings, registerFindings(text, th.Register.Limits(sencillez, tecnicidad))...)
		levelsNote = fmt.Sprintf(", register sencillez=%s tecnicidad=%s", sencillez, tecnicidad)
	}
	// #265: the glossary block and the interactive quiz of the note, and the page the turn wrote beside it.
	findings = append(findings, glosarioFindings(text, *th)...)
	findings = append(findings, quizFindings(text, *th, false)...)
	findings = append(findings, richPageFindings(c, rel, text, *th)...)
	if len(findings) > 0 {
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
		route, len(sceneOpen.FindAllStringIndex(withoutCodeFences(text), -1))+pieceOpenCount(text), th.MaxScenes,
		len(walkthroughOpen.FindAllStringIndex(withoutCodeFences(text), -1))+len(storyOpen.FindAllStringIndex(withoutCodeFences(text), -1)), th.MaxWalkthroughs)
	if th.MinScenes > 0 {
		shape += fmt.Sprintf(", %d drawn scene(s) (at least %d)", drawnScenes(text), th.MinScenes)
	}
	if th.MaxSentencesPerParagraph > 0 {
		shape += fmt.Sprintf(", %d paragraph(s) over %d sentences", len(wallParagraphs(text, th.MaxSentencesPerParagraph)), th.MaxSentencesPerParagraph)
	}
	if th.StoryLanguage {
		shape += fmt.Sprintf(", %d story or piece block(s) (at least 1)", len(storyOpen.FindAllStringIndex(withoutCodeFences(text), -1))+pieceOpenCount(text))
	}
	return passCheck(decl.ID, fmt.Sprintf("%s meets the explanation standard: %s%s", rel, shape, levelsNote))
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
