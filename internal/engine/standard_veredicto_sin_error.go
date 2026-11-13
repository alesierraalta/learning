package engine

import (
	"encoding/json"
	"fmt"

	"learning/internal/rules"
)

// verdictCard is the part of a verdict card the two card rules read.
type verdictCard struct {
	ID      string `json:"id"`
	Verdict string `json:"verdict"`
	Pill    string `json:"pill"`
	Title   string `json:"title"`
	Reason  string `json:"reason"`
	Draw    struct {
		Refs []struct {
			Text string `json:"text"`
			Icon string `json:"icon"`
		} `json:"refs"`
		Target struct {
			Text string `json:"text"`
		} `json:"target"`
	} `json:"draw"`
}

// verdictCards returns the cards of every verdict piece outside fenced code. A card
// with a field the schema does not read still counts: the reader draws it.
func verdictCards(text string) []verdictCard {
	var cards []verdictCard
	for _, block := range cardsBlock.FindAllString(withoutCodeFences(text), -1) {
		payload, ok := jsonPayload(block)
		if !ok {
			continue
		}
		var doc struct {
			Cards []verdictCard `json:"cards"`
		}
		_ = json.Unmarshal([]byte(payload), &doc)
		cards = append(cards, doc.Cards...)
	}
	return cards
}

// cardName is the name a finding gives a card: its title, or its id without one.
func cardName(card verdictCard) string {
	if card.Title != "" {
		return card.Title
	}
	return card.ID
}

// verdictErrorFindings measures the verdict-error rule (#261): the failing tint is for
// an error. A card whose verdict is `no` names one in its pill (NO COMPILA, ERROR,
// INCORRECTO, RECHAZADO); a valid state is a neutral card. A rules snapshot that does
// not declare `verdictError` keeps accepting the parts it accepted.
func verdictErrorFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.VerdictError {
		return nil
	}
	for _, card := range verdictCards(text) {
		if card.Verdict != "no" {
			continue
		}
		pill := card.Pill
		if pill == "" {
			pill = "ERROR"
		}
		if errorVerdict.MatchString(foldWords(pill)) {
			continue
		}
		return []string{fmt.Sprintf(
			"la tarjeta «%s» se tiñe de rojo con su veredicto «%s», que no es un error — si los dos estados son válidos, márcala neutra con \"verdict\": \"neutral\"; el rojo es para un error: NO COMPILA, ERROR, INCORRECTO, RECHAZADO",
			cardName(card), card.Pill)}
	}
	return nil
}
