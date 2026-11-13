package engine

import (
	"fmt"
	"strings"

	"learning/internal/rules"
)

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
	out = withoutPieces(out, "\n\n")
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

// parrafosFindings measures the rhythm: no paragraph carries more sentences than the
// rules allow, and the refusal quotes the first wall so the tutor can find it.
func parrafosFindings(text string, th rules.PartStandardThresholds) []string {
	if th.MaxSentencesPerParagraph > 0 {
		if walls := wallParagraphs(text, th.MaxSentencesPerParagraph); len(walls) > 0 {
			return []string{fmt.Sprintf(
				"%d paragraph(s) with more than %d sentences — the first opens «%s»; split it: one idea per sentence and one beat per paragraph",
				len(walls), th.MaxSentencesPerParagraph, openingWords(walls[0], 8))}
		}
	}
	return nil
}
