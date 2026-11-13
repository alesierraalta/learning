package engine

import (
	"fmt"
	"strings"

	"learning/internal/rules"
)

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

// rutaFindings measures the route: the part opens with ## Ruta and lists as many
// numbered lines as the rules declare, one step each.
func rutaFindings(text string, th rules.PartStandardThresholds) []string {
	found, lines := routeLines(text)
	switch {
	case !found:
		return []string{fmt.Sprintf(
			"no ## Ruta section — open the part with ## Ruta and %d to %d numbered lines, one step each",
			th.MinRutaLines, th.MaxRutaLines)}
	case lines < th.MinRutaLines || lines > th.MaxRutaLines:
		return []string{fmt.Sprintf(
			"## Ruta lists %d numbered line(s) (the route is %d to %d) — name the steps the part actually teaches, one line each",
			lines, th.MinRutaLines, th.MaxRutaLines)}
	}
	return nil
}
