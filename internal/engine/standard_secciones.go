package engine

import (
	"fmt"
	"strings"

	"learning/internal/rules"
)

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

// seccionesFindings measures the content sections: at most two, besides the route and
// the mini-quiz, because a part is one idea.
func seccionesFindings(text string, th rules.PartStandardThresholds) []string {
	if sections := contentSections(text); len(sections) > th.MaxContentSections {
		return []string{fmt.Sprintf(
			"%d content sections (limit %d, besides ## Ruta) — split the part in two, one idea per part",
			len(sections), th.MaxContentSections)}
	}
	return nil
}
