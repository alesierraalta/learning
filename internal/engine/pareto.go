package engine

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"unicode/utf8"

	"learning/internal/rules"
)

// The pareto scope teaches only the vital slice of a topic: the ~20% of the
// content that yields ~80% of the result. The engine cannot judge what is
// vital, but it can refuse a run that never declared the trim, and it can hold
// every part to the declared heading and budget. Measurement never trims:
// quizzes, receipts and reviews stay exactly as strict as a complete run.

// evalParetoPlan proves the pareto run declared its trim before applying it:
// a stated criterion, the content left out, a bounded number of parts, and the
// vital value of every planned part.
func evalParetoPlan(c *evalCtx, decl rules.CheckDecl) Check {
	if stateScope(c.st) != scopePareto {
		return skipCheck(decl.ID, "complete scope: the plan teaches the whole topic")
	}
	p := c.r.Thresholds.Pareto
	if p == nil {
		return failCheck(decl.ID, "rules declare pareto checks without the pareto thresholds")
	}
	if c.planErr != nil {
		return failCheck(decl.ID, c.planErr.Error())
	}
	if c.plan.Pareto == nil {
		return failCheck(decl.ID,
			"pareto scope needs a pareto selection in the plan: state the criterio and what is descartado")
	}
	criterion := strings.TrimSpace(c.plan.Pareto.Criterio)
	if utf8.RuneCountInString(criterion) < p.MinCriterioLen {
		return failCheck(decl.ID, fmt.Sprintf(
			"pareto.criterio must state, in at least %d characters, how the vital 20%% was chosen (got %q)",
			p.MinCriterioLen, criterion))
	}
	var discarded []string
	for _, item := range c.plan.Pareto.Descartado {
		if strings.TrimSpace(item) != "" {
			discarded = append(discarded, strings.TrimSpace(item))
		}
	}
	if len(discarded) == 0 {
		return failCheck(decl.ID,
			"pareto.descartado must name the content left out; a trim that hides what it dropped is not a trim")
	}
	var ids []string
	for _, part := range c.plan.Parts {
		ids = append(ids, part.ID)
	}
	if len(ids) > p.MaxParts {
		return failCheck(decl.ID, fmt.Sprintf(
			"pareto scope allows at most %d parts, the plan declares %d: %s",
			p.MaxParts, len(ids), strings.Join(ids, ",")))
	}
	var missing []string
	for _, part := range c.plan.Parts {
		if strings.TrimSpace(part.Pareto) == "" {
			missing = append(missing, part.ID)
		}
	}
	if len(missing) > 0 {
		return failCheck(decl.ID, fmt.Sprintf(
			"every part needs its pareto value (what it contributes to the 80%%): missing for %s",
			strings.Join(missing, ",")))
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"pareto trim declared: %d part(s) %s, excluding %d item(s) from the discarded list",
		len(ids), strings.Join(ids, ","), len(discarded)))
}

// evalParetoPart proves one part was written as its vital slice: it carries the
// declared vital heading and stays inside the word budget.
func evalParetoPart(c *evalCtx, decl rules.CheckDecl) Check {
	if stateScope(c.st) != scopePareto {
		return skipCheck(decl.ID, "complete scope: parts are not trimmed")
	}
	p := c.r.Thresholds.Pareto
	if p == nil {
		return failCheck(decl.ID, "rules declare pareto checks without the pareto thresholds")
	}
	rel, err := partRel(c.plan, decl.Path, c.part)
	if err != nil {
		return failCheck(decl.ID, err.Error())
	}
	raw, err := os.ReadFile(absPath(c.ws, rel))
	if err != nil {
		return failCheck(decl.ID, "missing artifact: "+rel)
	}
	body := string(raw)
	if !hasVitalHeading(body, p.Heading) {
		return failCheck(decl.ID, fmt.Sprintf(
			"%s must open its vital slice with the heading %q", rel, "## "+p.Heading))
	}
	words := len(strings.Fields(body))
	if words > p.MaxWords {
		return failCheck(decl.ID, fmt.Sprintf(
			"%s exceeds the pareto word budget: %d words > %d allowed", rel, words, p.MaxWords))
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"%s carries the vital heading and stays within the budget (%d/%d words)", rel, words, p.MaxWords))
}

// hasVitalHeading accepts the declared heading, optionally extended with a
// qualifier after it, so the writer can name the slice without a new shape.
func hasVitalHeading(body, heading string) bool {
	want := "## " + strings.TrimSpace(heading)
	for _, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), want) {
			return true
		}
	}
	return false
}

var pageComment = regexp.MustCompile(`(?s)<!--.*?-->`)
var pageScript = regexp.MustCompile(`(?is)<script\b([^>]*)>(.*?)</script\s*>`)
var pageControl = regexp.MustCompile(`(?i)<(?:button|input|select|textarea)\b[^>]*>`)
var pageAttr = regexp.MustCompile(`(?is)([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`)

// jsScriptTypes are the script types a browser executes. Any other declared
// type carries data (application/json, application/ld+json) or a template the
// page never runs, so it cannot drive the learner's interaction.
var jsScriptTypes = map[string]bool{
	"module":                   true,
	"text/javascript":          true,
	"application/javascript":   true,
	"application/x-javascript": true,
	"text/ecmascript":          true,
	"application/ecmascript":   true,
	"text/x-javascript":        true,
	"text/jscript":             true,
}

// scriptAttr reads one attribute of a script tag, honoring quoted values.
func scriptAttr(attrs, name string) (string, bool) {
	for _, m := range pageAttr.FindAllStringSubmatch(attrs, -1) {
		if !strings.EqualFold(m[1], name) {
			continue
		}
		for _, v := range m[2:] {
			if v != "" {
				return v, true
			}
		}
		return "", true
	}
	return "", false
}

// scriptExecutable reports whether a script tag runs code: it loads a source
// file, or it carries inline code and declares no type or a JavaScript type.
func scriptExecutable(attrs, body string) bool {
	if _, ok := scriptAttr(attrs, "src"); ok {
		return true
	}
	if strings.TrimSpace(body) == "" {
		return false
	}
	typ, ok := scriptAttr(attrs, "type")
	if !ok {
		return true
	}
	return jsScriptTypes[strings.ToLower(strings.TrimSpace(strings.Split(typ, ";")[0]))]
}

// demoPageExists checks for executable script and a control, or a kit walkthrough.
// This is structural evidence, not proof that the page works in a browser.
func demoPageExists(ws, rel string) bool {
	info, err := os.Stat(absPath(ws, rel))
	if err != nil || !info.Mode().IsRegular() {
		return false
	}
	raw, err := os.ReadFile(absPath(ws, rel))
	if err != nil {
		return false
	}
	page := pageComment.ReplaceAllString(string(raw), "")
	executable := false
	for _, script := range pageScript.FindAllStringSubmatch(page, -1) {
		if scriptExecutable(script[1], script[2]) {
			executable = true
		}
	}
	markup := pageScript.ReplaceAllString(page, "")
	walkthrough := countDemos(page, []string{"lk-walkthrough"}) > 0 && len(walkthroughProblems(page)) == 0
	return executable && (pageControl.MatchString(markup) || walkthrough)
}

// demoPageExistsPrefixed reports the first demo page whose name starts with
// the prefix (explicaciones/demos/<part>-<name>.html), in directory order.
func demoPageExistsPrefixed(ws, dir, prefix string) (string, bool) {
	entries, err := os.ReadDir(absPath(ws, dir))
	if err != nil {
		return "", false
	}
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, prefix) && strings.HasSuffix(name, ".html") && demoPageExists(ws, dir+name) {
			return name, true
		}
	}
	return "", false
}

// demoPartPage resolves the page-level demo that proves a part's hands-on work:
// explicaciones/apps/<part>.html, else the first interactive page under
// explicaciones/demos/<part>-*.html. evalDemoPart counts that page as the
// part's demo and buildReceipts receipts it, so the page that proves the demo
// is the page whose replacement or deletion invalidates that proof. A part
// that plans no demo, or whose note already carries the minimum inline demos,
// has no page-level demo to bind.
func demoPartPage(r *rules.Rules, ws string, plan *planDoc, part string) string {
	if part == "" || plan == nil || r.Thresholds.MinDemos <= 0 {
		return ""
	}
	planned := false
	for i := range plan.Parts {
		if plan.Parts[i].ID == part {
			planned = plan.Parts[i].DemosPlanned != nil && *plan.Parts[i].DemosPlanned
			break
		}
	}
	if !planned {
		return ""
	}
	if rel, err := partRel(plan, declPathByKind(r, "explanation", "part_file"), part); err == nil {
		if countDemos(readArtifact(ws, rel), r.Thresholds.DemoElements) >= r.Thresholds.MinDemos {
			return ""
		}
	}
	appRel := "explicaciones/apps/" + part + ".html"
	if demoPageExists(ws, appRel) {
		return appRel
	}
	demoRel := "explicaciones/demos/"
	if name, ok := demoPageExistsPrefixed(ws, demoRel, part+"-"); ok {
		return demoRel + name
	}
	return ""
}

// evalDemoPart proves a part that planned hands-on work delivers it: the note
// carries an interactive component (an lk-widget deck or a walkthrough) and
// each one is introduced by the reading-guide line, so the demo is not
// decoration the learner never touches.
func evalDemoPart(c *evalCtx, decl rules.CheckDecl) Check {
	var part *planPartDoc
	for i := range c.plan.Parts {
		if c.plan.Parts[i].ID == c.part {
			part = &c.plan.Parts[i]
		}
	}
	if part == nil || part.DemosPlanned == nil || !*part.DemosPlanned {
		return skipCheck(decl.ID, "part does not plan a demo")
	}
	if c.r.Thresholds.MinDemos <= 0 {
		return skipCheck(decl.ID, "the rules do not set a demo minimum")
	}
	rel, err := partRel(c.plan, decl.Path, c.part)
	if err != nil {
		return failCheck(decl.ID, err.Error())
	}
	raw, readErr := os.ReadFile(absPath(c.ws, rel))
	demoElements := c.r.Thresholds.DemoElements
	count, missing := 0, 0
	var guideRel string
	if readErr == nil {
		count = countDemos(string(raw), demoElements)
		missing = countDemosWithoutGuide(string(raw), demoElements, c.r.Thresholds.HowToReadLine)
		guideRel = rel
	}
	if count < c.r.Thresholds.MinDemos {
		// The vault's established demo form is a page-level file the reader
		// embeds: explicaciones/apps/<part>.html or
		// explicaciones/demos/<part>-<name>.html. Those pages hand the part its
		// demo too, so they satisfy the same promise without inline elements.
		if page := demoPartPage(c.r, c.ws, c.plan, c.part); page != "" {
			count, missing, guideRel = c.r.Thresholds.MinDemos, 0, page
		}
	}
	if count < c.r.Thresholds.MinDemos {
		return failCheck(decl.ID, fmt.Sprintf(
			"part %s planned a demo but %s has only %d demo(s), below the minimum of %d (a closed %s element or an interactive-structure %s page)",
			c.part, guideRel, count, c.r.Thresholds.MinDemos, strings.Join(demoElements, ", "), "explicaciones/apps/<part>.html"))
	}
	if missing > 0 {
		return failCheck(decl.ID, fmt.Sprintf(
			"%d of %d demo(s) in %s lack the %q line introducing them (M1)", missing, count, guideRel, c.r.Thresholds.HowToReadLine))
	}
	if problems := walkthroughProblems(readArtifact(c.ws, guideRel)); len(problems) > 0 {
		return failCheck(decl.ID, fmt.Sprintf(
			"%s hands on a deck that cannot render: %s — a walkthrough needs a valid payload with at least one step",
			guideRel, strings.Join(problems, "; ")))
	}
	if gaps := guideArrowGaps(readArtifact(c.ws, guideRel)); len(gaps) > 0 {
		return failCheck(decl.ID, fmt.Sprintf(
			"%s does not guide: %s — every deck draws arrows, and a step with two or more figures draws at least one",
			guideRel, strings.Join(gaps, "; ")))
	}
	return passCheck(decl.ID, fmt.Sprintf(
		"%s has demo structure (%d checked; inline demos require a how-to note)", guideRel, count))
}
