package engine

import (
	"fmt"
	"strings"

	"learning/internal/rules"
)

// asciiBoxChars are the characters a drawn diagram leaves behind: the standard
// draws with an <lk-scene> or a mermaid block, never with characters.
const asciiBoxChars = "┌┐└┘├┤┬┴┼│╔╗╚╝║█▓▒░"

// drawnLines counts the lines that draw with box characters. Fenced blocks are
// code, not a drawing, so they are not judged.
func drawnLines(text string, th rules.PartStandardThresholds) int {
	n := 0
	// Las flechas de texto (`--->`, `---[`, `==>`) son la misma falta que las cajas
	// ASCII (#246), y la regla es aditiva: un snapshot que no declara `arrowFlows`
	// sigue aceptando la prosa que las lleva.
	arrows := th.ArrowFlows
	for _, line := range strings.Split(withoutCodeFences(text), "\n") {
		if strings.ContainsAny(line, asciiBoxChars) || (arrows && textArrow.MatchString(line)) {
			n++
		}
	}
	return n
}

// asciiFindings measures the drawn lines: a drawing is an <lk-scene> or a mermaid block,
// never box characters or text arrows.
func asciiFindings(text string, th rules.PartStandardThresholds) []string {
	if drawn := drawnLines(text, th); drawn > 0 {
		return []string{fmt.Sprintf(
			"%d line(s) drawn with ASCII box characters — draw it as an <lk-scene> or a mermaid block, never with characters",
			drawn)}
	}
	return nil
}
