package engine

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"learning/internal/rules"
)

// The character rule (#261): an actor's character contradicts its tag. The lexicon is
// the tool's (`tools/explain-check.mjs`, rule `personaje-sin-sentido`), folded the same
// way, so the two read the same parts the same way.
var (
	personaPalabras    = wordSet("persona", "personas", "paciente", "pacientes", "enfermo", "enfermos", "sano", "sanos", "usuario", "usuarios", "alumno", "alumnos", "cliente", "clientes", "gente", "poblacion", "estudiante", "estudiantes", "ciudadano", "ciudadanos", "vecino", "vecinos", "individuo", "individuos", "habitante", "habitantes")
	resultadoPalabras  = wordSet("positivo", "positivos", "negativo", "negativos", "resultado", "resultados", "diagnostico", "diagnosticos", "falso", "falsos", "verdadero", "verdaderos", "prueba", "pruebas", "test", "tests")
	maquinaPalabras    = wordSet("servidor", "servidores", "host", "archivo", "archivos", "documento", "documentos", "bd")
	personajeDeMaquina = wordSet("server", "file", "doc", "database")
	treeBlock          = regexp.MustCompile(`(?s)<lk-tree[\s>].*?</lk-tree>`)
)

func wordSet(words ...string) map[string]bool {
	out := make(map[string]bool, len(words))
	for _, w := range words {
		out[w] = true
	}
	return out
}

// characterContradicts names the way a character and its tag contradict each other,
// or reports false when they agree.
func characterContradicts(kind, tag string) (string, bool) {
	words := map[string]bool{}
	for _, w := range wordsOf(tag) {
		words[w] = true
	}
	has := func(lexicon map[string]bool) bool {
		for w := range words {
			if lexicon[w] {
				return true
			}
		}
		return false
	}
	machine := has(maquinaPalabras) || (words["base"] && words["datos"])
	if personajeDeMaquina[kind] && (has(personaPalabras) || has(resultadoPalabras)) {
		return "persona o resultado", true
	}
	if kind == "user" && machine {
		return "máquina", true
	}
	return "", false
}

// characterSenseFindings measures the character rule (#261): every actor of a story, and
// every group of a frequency tree, draws a character its tag does not fit. A rules
// snapshot that does not declare `characterSense` keeps accepting the parts it accepted.
func characterSenseFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.CharacterSense {
		return nil
	}
	var out []string
	note := func(kind, tag, where string) {
		if why, bad := characterContradicts(kind, tag); bad {
			fix := "una persona o un resultado se dibuja con «user»; «server», «file» y «database» son máquinas o documentos"
			if why == "máquina" {
				fix = "un servidor, un archivo o una base se dibuja con su propio personaje («server», «file», «database»)"
			}
			out = append(out, fmt.Sprintf("el personaje «%s» de «%s» (%s) contradice su etiqueta — %s", kind, tag, where, fix))
		}
	}
	for _, doc := range storyRawDocs(text) {
		for i, step := range doc.Steps {
			stage, _, _ := storyStageOf(step)
			for _, actor := range storyStepActors(stage) {
				tag := actor.Tag
				if tag == "" {
					tag = actor.Label
				}
				note(actor.character(), tag, fmt.Sprintf("paso %d", i+1))
			}
		}
	}
	for _, block := range treeBlock.FindAllString(withoutCodeFences(text), -1) {
		payload, ok := jsonPayload(block)
		if !ok {
			continue
		}
		var spec struct {
			Nodes []struct {
				ID    string          `json:"id"`
				Kind  string          `json:"kind"`
				Label string          `json:"label"`
				Lines json.RawMessage `json:"lines"`
			} `json:"nodes"`
		}
		if json.Unmarshal([]byte(payload), &spec) != nil {
			continue
		}
		for _, n := range spec.Nodes {
			kind := n.Kind
			if kind == "" {
				kind = "user"
			}
			tag := n.Label
			if tag == "" {
				tag = n.ID
			}
			var lines []string
			if json.Unmarshal(n.Lines, &lines) == nil && len(lines) > 0 {
				tag = strings.Join(lines, " ")
			}
			note(kind, tag, "el árbol")
		}
	}
	return out
}
