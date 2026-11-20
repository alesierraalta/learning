package engine

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"learning/internal/rules"
)

// S29: una figura de paso enseña el ejemplo con al menos cuatro pasos, y cada
// sección de contenido lleva una figura. Las dos reglas se miden solo en las
// partes escritas con el contrato nuevo; una parte antigua conserva su veredicto
// (S10), porque su figura no es de pasos y sus secciones ya se publicaron.
const minStepFigureSteps = 4

// mermaidFence reconoce el bloque que el lector dibuja como diagrama estándar.
var mermaidFence = regexp.MustCompile("(?m)^[ \\t]*```mermaid\\b")

// figurasFindings mide las reglas de figuras del contrato nuevo: los pasos (S29),
// los pasos de solo tarjetas (#399) y una figura por sección (S29).
func figurasFindings(text string, _ rules.PartStandardThresholds) []string {
	if !usesStepFigures(text) {
		return nil
	}
	findings := stepFigureStepFindings(text)
	findings = append(findings, textCardsExampleFindings(text)...)
	return append(findings, contentSectionFigureFindings(text)...)
}

// stepFigureStepFindings exige cuatro pasos en cada figura de paso y nombra el
// elemento, su índice entre los de su clase y el número de pasos que trae.
func stepFigureStepFindings(text string) []string {
	var findings []string
	index := map[string]int{}
	for _, block := range figureBlocks(withoutCodeFences(text)) {
		if !isStepFigureElement(block.tag) {
			continue
		}
		index[block.tag]++
		steps, ok := stepFigureStepCount(block.text)
		if !ok {
			continue
		}
		if steps < minStepFigureSteps {
			findings = append(findings, fmt.Sprintf(
				"%s %d has %d steps (minimum %d) — split the idea into one step per idea so the figure carries the explanation",
				block.tag, index[block.tag], steps, minStepFigureSteps))
		}
	}
	return findings
}

func isStepFigureElement(tag string) bool {
	for _, el := range stepFigureElements {
		if el == tag {
			return true
		}
	}
	return false
}

// stepFigureStepCount reads the `steps` list of the element's JSON child.
func stepFigureStepCount(block string) (int, bool) {
	payload, ok := jsonPayload(block)
	if !ok {
		return 0, false
	}
	var spec struct {
		Steps []json.RawMessage `json:"steps"`
	}
	if json.Unmarshal([]byte(payload), &spec) != nil {
		return 0, false
	}
	return len(spec.Steps), true
}

// textCardsExampleFindings mide, paso a paso, un ejemplo resuelto (#399): cada paso
// con `cards` lleva en ese mismo paso un bloque rows, numbers o formula con el estado
// o los datos que cambian. Un paso de solo tarjetas falla aunque otro paso traiga
// datos, y el aviso nombra sus pasos. Solo mira que el bloque exista; no juzga los datos.
func textCardsExampleFindings(text string) []string {
	var findings []string
	index := 0
	for _, block := range figureBlocks(withoutCodeFences(text)) {
		if block.tag != "lk-guided" {
			continue
		}
		index++
		steps := cardsOnlySteps(block.text)
		if len(steps) == 0 {
			continue
		}
		names := make([]string, len(steps))
		for i, step := range steps {
			names[i] = fmt.Sprint(step)
		}
		word := "paso"
		if len(steps) > 1 {
			word = "pasos"
		}
		findings = append(findings, fmt.Sprintf(
			"lk-guided %d: %s %s solo con tarjetas de texto (sin rows, numbers ni formula en ese paso); añade en ese mismo paso el estado o los datos que cambian",
			index, word, strings.Join(names, ", ")))
	}
	return findings
}

// cardsOnlySteps devuelve los pasos (desde 1) de un `example` cuyo bloque de paso
// trae tarjetas y ningún rows, numbers ni formula. Una nota (`note`) es texto, no dato.
// Otras formas no entran en esta regla, y un payload que no se parsea no se mide.
func cardsOnlySteps(block string) []int {
	payload, ok := jsonPayload(block)
	if !ok {
		return nil
	}
	var spec struct {
		Form  string            `json:"form"`
		Steps []json.RawMessage `json:"steps"`
	}
	if json.Unmarshal([]byte(payload), &spec) != nil || spec.Form != "example" {
		return nil
	}
	var offending []int
	for i, raw := range spec.Steps {
		var step struct {
			Blocks []json.RawMessage `json:"blocks"`
		}
		if json.Unmarshal(raw, &step) != nil {
			continue
		}
		cards, data := false, false
		for _, rawBlock := range step.Blocks {
			var b struct {
				Kind string `json:"kind"`
			}
			if json.Unmarshal(rawBlock, &b) != nil {
				continue
			}
			switch b.Kind {
			case "cards":
				cards = true
			case "rows", "numbers", "formula":
				data = true
			}
		}
		if cards && !data {
			offending = append(offending, i+1)
		}
	}
	return offending
}

// contentSectionFigureFindings exige al menos una figura (Mermaid o de pasos)
// en cada sección de contenido y nombra la sección que no la trae.
func contentSectionFigureFindings(text string) []string {
	headings := h2Heading.FindAllStringSubmatchIndex(text, -1)
	var findings []string
	for i, heading := range headings {
		title := strings.TrimSpace(text[heading[2]:heading[3]])
		if strings.EqualFold(title, "Ruta") || strings.Contains(strings.ToLower(title), "mini-quiz") {
			continue
		}
		end := len(text)
		if i+1 < len(headings) {
			end = headings[i+1][0]
		}
		if !sectionHasFigure(text[heading[1]:end]) {
			findings = append(findings, fmt.Sprintf(
				"la sección «%s» no trae ninguna figura — añade un bloque mermaid o una figura de pasos", title))
		}
	}
	return findings
}

func sectionHasFigure(body string) bool {
	if mermaidFence.MatchString(body) {
		return true
	}
	plain := asciiLower(withoutCodeFences(body))
	for _, el := range stepFigureElements {
		if hasElement(plain, el) {
			return true
		}
	}
	return false
}

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
