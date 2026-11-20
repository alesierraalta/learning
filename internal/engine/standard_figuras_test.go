package engine

import (
	"strings"
	"testing"

	"learning/internal/rules"
)

// S29: una parte del contrato nuevo enseña su ejemplo con pasos de verdad. Una
// figura de paso lleva al menos cuatro pasos; una parte antigua no se mide.
func TestStepFigureNeedsFourSteps(t *testing.T) {
	note := func(steps int) string {
		return "# Parte 1\n\n## 1. El robot\n\n" + stepFigureBlock("lk-stage", `{"steps":[`+strings.Repeat(`{},`, steps-1)+`{}]}`) + "\n"
	}
	got := figurasFindings(note(2), rules.PartStandardThresholds{})
	if len(got) != 1 {
		t.Fatalf("figura de 2 pasos: %v, want one finding", got)
	}
	if !strings.Contains(got[0], "lk-stage 1") || !strings.Contains(got[0], "2 steps") {
		t.Fatalf("el hallazgo no nombra el elemento, su índice y el número de pasos: %v", got[0])
	}
	if got := figurasFindings(note(4), rules.PartStandardThresholds{}); len(got) != 0 {
		t.Fatalf("figura de 4 pasos: %v, want none", got)
	}
}

// S29: cada sección de contenido lleva al menos una figura, Mermaid o de pasos.
func TestEveryContentSectionNeedsAFigure(t *testing.T) {
	figure := stepFigureBlock("lk-guided", `{"steps":[{},{},{},{}]}`)
	note := "# Parte 1\n\n## 1. El robot\n\n" + figure + "\n\n## 2. La acción\n\nSólo hay prosa en esta sección.\n"
	got := figurasFindings(note, rules.PartStandardThresholds{})
	if len(got) != 1 {
		t.Fatalf("sección sin figura: %v, want one finding", got)
	}
	if !strings.Contains(got[0], "La acción") {
		t.Fatalf("el hallazgo no nombra la sección: %v", got[0])
	}
	covered := "# Parte 1\n\n## 1. El robot\n\n" + figure +
		"\n\n## 2. La acción\n\n```mermaid\nflowchart LR; A --> B;\n```\n"
	if got := figurasFindings(covered, rules.PartStandardThresholds{}); len(got) != 0 {
		t.Fatalf("todas las secciones con figura: %v, want none", got)
	}
}

// S10: una parte antigua, sin figuras de paso, sigue pasando sin cambios.
func TestLegacyNoteKeepsPassingFigureRules(t *testing.T) {
	legacy := "# Parte 1\n\n## 1. El robot\n\n<lk-figure><script type=\"application/json\">{\"boxes\":[{\"label\":\"robot\"}]}</script></lk-figure>\n\n## 2. La acción\n\nSólo prosa, como en las partes publicadas.\n"
	if got := figurasFindings(legacy, rules.PartStandardThresholds{}); len(got) != 0 {
		t.Fatalf("nota antigua: %v, want none", got)
	}
}

// #399: el ejemplo de Gestión (parte 2) enseña cuatro pasos de solo tarjetas de
// texto. Cuatro pasos cumplen S29, pero una tarjeta sola no es un ejemplo trabajado.
func TestTextCardsOnlyWorkedExampleIsRefused(t *testing.T) {
	note := "# Parte 1\n\n## 1. La gestión\n\n" + stepFigureBlock("lk-guided", ejemploConBloques("example", 4, tarjetasSolas)) + "\n"
	got := figurasFindings(note, rules.PartStandardThresholds{})
	if len(got) != 1 {
		t.Fatalf("ejemplo de solo tarjetas: %v, want one finding", got)
	}
	if !strings.Contains(got[0], "lk-guided 1: pasos 1, 2, 3, 4 solo con tarjetas de texto") {
		t.Fatalf("el hallazgo no nombra el elemento: %v", got[0])
	}
}

// #399: las tarjetas útiles se quedan junto al estado o los datos que cambian.
func TestWorkedExampleKeepsCardsBesideItsState(t *testing.T) {
	note := "# Parte 1\n\n## 1. La gestión\n\n" + stepFigureBlock("lk-guided", ejemploConBloques("example", 4, tarjetasSolas+","+numerosDelEjemplo)) + "\n"
	if got := figurasFindings(note, rules.PartStandardThresholds{}); len(got) != 0 {
		t.Fatalf("tarjetas junto a sus números: %v, want none", got)
	}
}

// #399: la regla es la forma observada, no un clasificador de calidad visual: las
// mismas tarjetas en otra forma de lk-guided no la activan.
func TestCardsOutsideWorkedExampleAreNotRefused(t *testing.T) {
	note := "# Parte 1\n\n## 1. La gestión\n\n" + stepFigureBlock("lk-guided", ejemploConBloques("numbers", 4, tarjetasSolas)) + "\n"
	if got := figurasFindings(note, rules.PartStandardThresholds{}); len(got) != 0 {
		t.Fatalf("tarjetas en form numbers: %v, want none", got)
	}
}

// #399 (L8): cada paso de solo tarjetas falla aunque otro paso traiga datos, y el
// aviso nombra sus pasos. Caso observado: tres pasos de tarjetas y el cuarto con números.
func TestCardsOnlyStepFailsEvenBesideADataStep(t *testing.T) {
	payload := ejemploPorPasos("example", tarjetasSolas, tarjetasSolas, tarjetasSolas, tarjetasSolas+","+numerosDelEjemplo)
	note := "# Parte 1\n\n## 1. La gestión\n\n" + stepFigureBlock("lk-guided", payload) + "\n"
	got := figurasFindings(note, rules.PartStandardThresholds{})
	if len(got) != 1 {
		t.Fatalf("tres pasos de solo tarjetas junto a un paso con datos: %v, want one finding", got)
	}
	if !strings.Contains(got[0], "lk-guided 1: pasos 1, 2, 3 solo con tarjetas de texto") {
		t.Fatalf("el hallazgo no nombra los pasos de solo tarjetas: %v", got[0])
	}
}

// #399 diferencial (L8): la regla cambia solo la forma observada. Cada fila conserva
// los hallazgos de S29 tal cual, en su orden, y solo añade el de #399 donde la fila
// nombra sus pasos. Mira que el bloque de datos exista en el mismo paso; no juzga
// si los datos son correctos.
func TestTextCardsRuleChangesOnlyTheObservedShape(t *testing.T) {
	nota := func(body string) string { return "# Parte 1\n\n## 1. La gestión\n\n" + body + "\n" }
	guia := func(form string, pasos ...string) string {
		return stepFigureBlock("lk-guided", ejemploPorPasos(form, pasos...))
	}
	cuatro := func(bloques string) []string { return []string{bloques, bloques, bloques, bloques} }
	conDatos := tarjetasSolas + "," + numerosDelEjemplo
	observado := []string{tarjetasSolas, tarjetasSolas, tarjetasSolas, conDatos}
	filas := []struct {
		nombre string
		nota   string
		nombra string // los pasos que el hallazgo de #399 debe nombrar; vacío si la fila debe quedar limpia
	}{
		{"observada: tres pasos de solo tarjetas junto a un paso con datos", nota(guia("example", observado...)), "pasos 1, 2, 3"},
		{"datos primero: los pasos de solo tarjetas son 2, 3 y 4", nota(guia("example", conDatos, tarjetasSolas, tarjetasSolas, tarjetasSolas)), "pasos 2, 3, 4"},
		{"cada paso con tarjetas y datos", nota(guia("example", cuatro(conDatos)...)), ""},
		{"una fórmula en el mismo paso cuenta como datos", nota(guia("example", cuatro(tarjetasSolas+","+formulaDelEjemplo)...)), ""},
		{"una nota es texto: tarjetas con nota son de solo tarjetas", nota(guia("example", cuatro(tarjetasSolas+","+notaDelEjemplo)...)), "pasos 1, 2, 3, 4"},
		{"forma numbers: las tarjetas solas son otra forma", nota(guia("numbers", cuatro(tarjetasSolas)...)), ""},
		{"sin tarjetas: pasos solo con nota", nota(guia("example", cuatro(notaDelEjemplo)...)), ""},
		{"pieza legada junto al ejemplo observado", nota(guia("example", observado...)) + "\n<lk-cards>\n<script type=\"application/json\">{\"cards\":[]}</script>\n</lk-cards>\n", ""},
		{"Mermaid junto al ejemplo observado", nota(guia("example", observado...)) + "\n## 2. La acción\n\n```mermaid\nflowchart LR; A --> B;\n```\n", "pasos 1, 2, 3"},
		{"ejemplo publicado del kit: lk-stage", nota(stepFigureBlock("lk-stage", exampleSpec(t, "lk-stage-robot.html"))), ""},
		{"ejemplo publicado del kit: lk-guided con form formula", nota(stepFigureBlock("lk-guided", exampleSpec(t, "lk-guided.html"))), ""},
	}
	for _, fila := range filas {
		t.Run(fila.nombre, func(t *testing.T) {
			var s29, regla []string
			for _, f := range figurasFindings(fila.nota, rules.PartStandardThresholds{}) {
				if strings.Contains(f, "tarjetas de texto") {
					regla = append(regla, f)
				} else {
					s29 = append(s29, f)
				}
			}
			if want := s29Findings(fila.nota); strings.Join(s29, "\n") != strings.Join(want, "\n") {
				t.Fatalf("los hallazgos de S29 cambian: got %v, want %v", s29, want)
			}
			if fila.nombra == "" {
				if len(regla) != 0 {
					t.Fatalf("#399 marca una fila que debe quedar limpia: %v", regla)
				}
				return
			}
			if len(regla) != 1 || !strings.Contains(regla[0], fila.nombra+" solo con tarjetas de texto") {
				t.Fatalf("hallazgos de #399 = %v, want uno que nombre %q", regla, fila.nombra)
			}
		})
	}
}

// s29Findings es lo que las reglas de figuras daban antes de #399: el mismo gate sin la regla de tarjetas.
func s29Findings(text string) []string {
	if !usesStepFigures(text) {
		return nil
	}
	return append(stepFigureStepFindings(text), contentSectionFigureFindings(text)...)
}

// ejemploPorPasos arma el payload de un lk-guided con los bloques de cada paso: un argumento por paso.
func ejemploPorPasos(form string, bloquesPorPaso ...string) string {
	pasos := make([]string, len(bloquesPorPaso))
	for i, bloques := range bloquesPorPaso {
		pasos[i] = `{"title":"Paso","blocks":[` + bloques + `]}`
	}
	return `{"form":"` + form + `","kicker":"K","question":"¿Cuánto gana?","steps":[` + strings.Join(pasos, ",") + `]}`
}

// formulaDelEjemplo cuenta como dato del paso; notaDelEjemplo es texto y no cuenta.
const formulaDelEjemplo = `{"kind":"formula","tokens":[{"text":"C"},{"text":" = 100"}],"focus":0,"tone":"blue"}`
const notaDelEjemplo = `{"kind":"note","text":"Cómo se lee."}`

// tarjetasSolas es el bloque de Gestión (#399): tarjetas de texto y nada más.
// numerosDelEjemplo son los valores que cambian, junto a esas mismas tarjetas.
const tarjetasSolas = `{"kind":"cards","cards":[{"label":"Ventas","value":"120"},{"label":"Coste","value":"80"}],"focus":0,"tone":"blue"}`
const numerosDelEjemplo = `{"kind":"numbers","values":[{"label":"Ventas","value":"120"}],"focusList":[0],"tone":"green"}`

// ejemploConBloques arma el payload de un lk-guided de n pasos con los bloques dados en cada paso.
func ejemploConBloques(form string, n int, bloques string) string {
	pasos := make([]string, n)
	for i := range pasos {
		pasos[i] = `{"title":"Paso","blocks":[` + bloques + `]}`
	}
	return `{"form":"` + form + `","kicker":"K","question":"¿Cuánto gana?","steps":[` + strings.Join(pasos, ",") + `]}`
}
