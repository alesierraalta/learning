package engine

import (
	"fmt"
	"regexp"
	"strings"

	"learning/internal/rules"
)

// The new figures carry their whole lesson in one JSON child. It is a
// declaration, not prose the reader reads, like a scene or a walkthrough.
var proseStepFigurePatterns = func() []*regexp.Regexp {
	patterns := make([]*regexp.Regexp, 0, len(stepFigureElements))
	for _, el := range stepFigureElements {
		patterns = append(patterns, regexp.MustCompile(`(?s)<`+el+`[^>]*>.*?</`+el+`>`))
	}
	return patterns
}()

// proseWords counts the words a part asks the reader to read, exactly as
// `tools/part-lint.mjs` counts them: code fences, scene and walkthrough blocks,
// table rows, headings and loose tags are removed first, so a visual never
// spends the prose budget.
func proseWords(text string) int {
	out := strings.ReplaceAll(text, "\r\n", "\n")
	out = proseFence.ReplaceAllString(out, " ")
	out = proseScene.ReplaceAllString(out, " ")
	out = proseWalkthrough.ReplaceAllString(out, " ")
	out = proseStory.ReplaceAllString(out, " ")
	for _, pattern := range proseStepFigurePatterns {
		out = pattern.ReplaceAllString(out, " ")
	}
	out = withoutPieces(out, " ")
	out = proseTableLine.ReplaceAllString(out, " ")
	out = proseHeading.ReplaceAllString(out, " ")
	out = proseTag.ReplaceAllString(out, " ")
	return len(strings.Fields(out))
}

// tamanoFindings measures the prose budget: the words the reader reads, against the
// limit the rules declare. The refusal asks to split the part, never to compress it.
func tamanoFindings(text string, th rules.PartStandardThresholds) []string {
	if words := proseWords(text); words > th.MaxProseWords {
		return []string{fmt.Sprintf(
			"%d prose words (limit %d; code, tables, scenes and walkthroughs are not counted) — split the part in two, never compress or summarise it to fit",
			words, th.MaxProseWords)}
	}
	return nil
}
