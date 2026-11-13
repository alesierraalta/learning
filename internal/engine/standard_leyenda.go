package engine

import (
	"fmt"
	"regexp"
	"strings"

	"learning/internal/rules"
)

// mathGreekMacros are the LaTeX macros that name a Greek letter: the variables of
// a formula, which a part writes either as a macro (`\sigma`) or literally (`σ`).
// Every other macro is a command, and a command is never a symbol.
var mathGreekMacros = map[string]bool{
	"alpha": true, "beta": true, "gamma": true, "delta": true, "epsilon": true,
	"varepsilon": true, "zeta": true, "eta": true, "theta": true, "vartheta": true,
	"iota": true, "kappa": true, "lambda": true, "mu": true, "nu": true, "xi": true,
	"omicron": true, "pi": true, "varpi": true, "rho": true, "varrho": true,
	"sigma": true, "varsigma": true, "tau": true, "upsilon": true, "phi": true,
	"varphi": true, "chi": true, "psi": true, "omega": true, "digamma": true,
	"Gamma": true, "Delta": true, "Theta": true, "Lambda": true, "Xi": true,
	"Pi": true, "Sigma": true, "Upsilon": true, "Phi": true, "Psi": true, "Omega": true,
}

// mathConstants are the Greek macros that name a constant instead of a variable:
// π is the same number in every formula, so the legend never asks who it is.
var mathConstants = map[string]bool{"pi": true, "Pi": true, "varpi": true}

// mathConstantLetters is the same rule for a formula that writes the letter itself.
var mathConstantLetters = map[string]bool{"π": true, "Π": true, "ϖ": true}

// formulaBodies returns the formulas a part writes, in order, and whether any of
// them is plain LaTeX (`$$…$$` or `$…$`) instead of the kit's `<lk-math>`
// element. A formula is a formula wherever it is written, so the legend reads
// both; the plain form is what the refusal tells the tutor to replace.
func formulaBodies(text string) (bodies []string, plain bool) {
	for _, block := range mathBlock.FindAllStringSubmatch(text, -1) {
		bodies = append(bodies, block[1])
	}
	for _, block := range mathDisplay.FindAllStringSubmatch(text, -1) {
		bodies = append(bodies, block[1])
		plain = true
	}
	// The display math is removed first: `$$x$$` also matches the inline form.
	rest := mathDisplay.ReplaceAllString(text, " ")
	for _, block := range mathInline.FindAllStringSubmatch(rest, -1) {
		body := block[1]
		if !mathInlineLooksLikeMath.MatchString(body) && strings.ContainsAny(body, " \t") {
			continue
		}
		bodies = append(bodies, body)
		plain = true
	}
	return bodies, plain
}

// formulaSymbols returns the symbols a part's formulas use: every Greek-letter
// macro (`\gamma`), every single-letter name that is not part of a macro or a
// group, and every Greek letter, whichever way the part writes it. The formulas
// are the `<lk-math>` blocks, the plain LaTeX a part writes instead, and the
// formulas a scene draws symbol by symbol. It mirrors `explain-check.mjs` rule 7b.
//
// A macro that is not a Greek letter is a command: it lays the formula out
// (`\frac`, `\left`, `\right`), operates (`\cdot`, `\sum`, `\int`) or names a
// function (`\exp`, `\log`, `\mathrm`, `\text`), and a command is never a symbol
// the legend defines. `\pi`, `\Pi` and `\varpi` are constants, and so is `e` as
// Euler's number (`e^{…}`): a constant is not a symbol either.
func formulaSymbols(text string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(s string) {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	bodies, _ := formulaBodies(text)
	bodies = append(bodies, sceneFormulaBodies(text)...)
	for _, body := range bodies {
		for _, macro := range mathMacro.FindAllString(body, -1) {
			name := strings.TrimPrefix(macro, `\`)
			if mathGreekMacros[name] && !mathConstants[name] {
				add(macro)
			}
		}
		clean := mathMacro.ReplaceAllString(body, " ")
		clean = mathGroup.ReplaceAllString(clean, " ")
		clean = mathEuler.ReplaceAllString(clean, " ")
		for _, word := range mathWord.FindAllString(clean, -1) {
			if len(word) == 1 {
				add(word)
			}
		}
		for _, letter := range mathGreek.FindAllString(clean, -1) {
			if !mathConstantLetters[letter] {
				add(letter)
			}
		}
	}
	return out
}

// symbolNamed reports whether the text names a formula symbol, either quoted
// (`x`, «x», "x") or followed by =, →, ->, : or "es". A symbol the part never
// names is a formula the learner cannot read. The boundary is a Unicode one: `\b`
// is ASCII, so `\bγ` never matched and a Greek symbol could not be named in the
// callout form the annotated formula uses («① γ: …»). The letter is the same one:
// `Q` and `q` are different symbols, so a `q` elsewhere in the part names nothing.
func symbolNamed(text, symbol string) bool {
	name := strings.TrimPrefix(symbol, `\`)
	quoted := "(`|«|\")\\s*\\\\?" + regexp.QuoteMeta(name) + "\\s*(`|»|\")"
	defined := `(^|[^\p{L}\p{N}_])` + regexp.QuoteMeta(name) + `\s*(=|→|->|:|es\b)`
	pattern, err := regexp.Compile(quoted + "|" + defined)
	if err != nil {
		return true
	}
	return pattern.MatchString(text)
}

// unnamedSymbols lists the formula symbols the part never names.
func unnamedSymbols(text string) []string {
	var out []string
	for _, symbol := range formulaSymbols(text) {
		if !symbolNamed(text, symbol) {
			out = append(out, strings.TrimPrefix(symbol, `\`))
		}
	}
	return out
}

// legendFindings measures the formula legend: every symbol a formula uses has to
// be named, and the fix is the annotated formula scene — the formula drawn symbol
// by symbol with one numbered callout per symbol, each named in its labels line.
// `<lk-math>` draws a clean equation with no arrows, so it is the fix for a
// calculation, never for explaining a formula (#200).
func legendFindings(text string, th rules.PartStandardThresholds) []string {
	unnamed := unnamedSymbols(text)
	if len(unnamed) == 0 {
		return nil
	}
	fix := fmt.Sprintf("draw the formula as an annotated formula scene: one numbered callout per symbol, each named in its labels line («① %s: …»)", unnamed[0])
	if _, plain := formulaBodies(text); plain && th.FormulaElement != "" {
		fix += fmt.Sprintf("; <%s> is for a calculation, never for explaining a formula", th.FormulaElement)
	}
	return []string{fmt.Sprintf("formula symbol(s) %s never named — %s", strings.Join(unnamed, ", "), fix)}
}
