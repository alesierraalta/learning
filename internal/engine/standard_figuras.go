package engine

import (
	"fmt"
	"strings"

	"learning/internal/rules"
)

// figureFindings measures that the page carries every figure of the note, as the same block (whitespace aside).
func figureFindings(note, page string, th rules.PartStandardThresholds) []string {
	if !th.RichPage {
		return nil
	}
	kept := espacios.ReplaceAllString(page, "")
	for _, block := range figureBlocks(note) {
		if !strings.Contains(kept, espacios.ReplaceAllString(block.text, "")) {
			return []string{fmt.Sprintf("la página no trae la figura <%s> de la nota: cada figura de la nota va en la página tal cual", block.tag)}
		}
	}
	return nil
}

type figureBlock struct{ tag, text string }

// figureBlocks returns every `<lk-…>` block of a note, up to its own closing tag.
func figureBlocks(note string) []figureBlock {
	var out []figureBlock
	for _, open := range figuraAbre.FindAllStringSubmatchIndex(note, -1) {
		name := note[open[2]:open[3]]
		closing := "</" + name + ">"
		end := strings.Index(note[open[1]:], closing)
		if end < 0 {
			continue
		}
		stop := open[1] + end + len(closing)
		out = append(out, figureBlock{tag: name, text: note[open[0]:stop]})
	}
	return out
}
