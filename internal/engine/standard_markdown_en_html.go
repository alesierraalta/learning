package engine

import (
	"fmt"
	"regexp"
	"strings"
)

// A page the tutor wrote is read as HTML (#323): Markdown syntax outside <script>, <style>, <pre> and <code> is
// printed as it is, so the page is refused. explain-check's `markdown-en-html` rule reads the same lines
// (tools/explain-check/rules/markdown-en-html.mjs), and TestMarkdownEnHTMLAgreesWithExplainCheck holds the two together.
var (
	htmlScriptBlock  = regexp.MustCompile(`(?is)<script\b[^>]*>.*?</script\s*>`)
	htmlStyleBlock   = regexp.MustCompile(`(?is)<style\b[^>]*>.*?</style\s*>`)
	htmlPreBlock     = regexp.MustCompile(`(?is)<pre\b[^>]*>.*?</pre\s*>`)
	htmlCodeBlock    = regexp.MustCompile(`(?is)<code\b[^>]*>.*?</code\s*>`)
	markdownHeading  = regexp.MustCompile(`^[ \t]*#{1,6}[ \t]+\S`)
	markdownListItem = regexp.MustCompile(`^[ \t]*(?:[-*+]|\d{1,3}[.)])[ \t]+\S`)
)

// visibleHTML keeps the line structure of a page while it removes the blocks that are code, script or style: each
// removed block leaves its newlines behind, so a line number is the line number in the file.
func visibleHTML(page string) string {
	for _, block := range []*regexp.Regexp{htmlScriptBlock, htmlStyleBlock, htmlPreBlock, htmlCodeBlock} {
		page = block.ReplaceAllStringFunc(page, func(removed string) string {
			return strings.Repeat("\n", strings.Count(removed, "\n"))
		})
	}
	return page
}

// markdownMark is one Markdown syntax a visible line can carry, and the HTML that the page needs in its place.
type markdownMark struct {
	name  string
	found func(line string) bool
	fix   string
}

var markdownMarks = []markdownMark{
	{"fenced code (```)", func(line string) bool { return strings.Contains(line, "```") }, "write the block as <pre><code>…</code></pre>"},
	{"display math ($$)", func(line string) bool { return strings.Contains(line, "$$") }, "write the formula as <lk-math display>…</lk-math>"},
	{"Markdown heading", markdownHeading.MatchString, "write the title as <h2>…</h2> (or the level it needs)"},
	{"Markdown list marker", markdownListItem.MatchString, "write the list as <ul><li>…</li></ul> or <ol><li>…</li></ol>"},
}

// markdownEnHTMLFindings refuses a page the tutor wrote with Markdown outside its code (#323): each visible line that
// carries Markdown is one finding, and names the HTML the page needs there.
func markdownEnHTMLFindings(page string) []string {
	var out []string
	for i, line := range strings.Split(visibleHTML(page), "\n") {
		for _, mark := range markdownMarks {
			if mark.found(line) {
				out = append(out, fmt.Sprintf("line %d: %s outside <pre>/<code>; %s", i+1, mark.name, mark.fix))
				break
			}
		}
	}
	return out
}
