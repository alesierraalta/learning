package engine

import (
	"fmt"
	"strings"

	"learning/internal/rules"
)

// accessorySenseFindings measures the accessory-sense rule (#261): a card that draws a
// read or write icon says so in its own words (title, reason, pill, the drawing's
// target or its code). An icon the words never name is an accessory. A rules snapshot
// that does not declare `accessorySense` keeps accepting the parts it accepted.
func accessorySenseFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.AccessorySense {
		return nil
	}
	for _, card := range verdictCards(text) {
		icon := ""
		words := []string{card.Title, card.Reason, card.Pill, card.Draw.Target.Text}
		for _, ref := range card.Draw.Refs {
			if icon == "" && (ref.Icon == "read" || ref.Icon == "write") {
				icon = ref.Icon
			}
			words = append(words, ref.Text)
		}
		if icon == "" || readOrWrite.MatchString(foldWords(strings.Join(words, " "))) {
			continue
		}
		noun, verb, does := "lectura", "leer", "lee"
		if icon == "write" {
			noun, verb, does = "escritura", "escribir", "escribe"
		}
		return []string{fmt.Sprintf(
			"la tarjeta «%s» lleva el icono de %s, y ni su título, ni su razón, ni su código hablan de %s — quita el icono o di en la razón qué se %s",
			cardName(card), noun, verb, does)}
	}
	return nil
}
