package engine

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"learning/internal/rules"
)

// calculoEnTextoFindings is the calculation rule (#324): a calculation written as text, or as formulas, is refused. A
// calculation is a fenced block, or consecutive lines, with two or more lines of `<expr> = <expr>` that substitute
// numbers and carry an operation; or two or more calculation lines inside one display (`\\`, aligned, align, array,
// gathered); or two or more consecutive formulas (display formulas, and bare <lk-math> elements alone on their own
// lines) that do the same (decision 4). It must be a derivation story (`<lk-story kind="derivation">`) with one step per
// line or per formula, the changed token in `focus` and a `summary` card with the result. A programming-language fence
// is code, a kit figure is not text, and a single formula is one formula. A rules snapshot that does not declare
// `calculoEnTexto` keeps the parts it accepted. It mirrors tools/explain-check/rules/calculo-en-texto.mjs, and a test
// crosses the two verdicts.
func calculoEnTextoFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.CalculoEnTexto {
		return nil
	}
	nota := calculoEspacios.ReplaceAllString(text, " ")
	found := append(calculosEnTexto(nota), calculosEnFormulas(nota)...)
	if len(found) == 0 {
		return nil
	}
	sort.SliceStable(found, func(i, j int) bool { return found[i].desde < found[j].desde })
	lines := make([]string, 0, len(found))
	for _, h := range found {
		lines = append(lines, fmt.Sprintf("líneas %d–%d · cuenta de %d renglones", h.desde, h.hasta, h.n))
	}
	return []string{fmt.Sprintf("%d cálculo(s) escrito(s) como texto o como fórmulas (%s) · dibuja cada uno como <lk-story kind=\"derivation\">: un paso por renglón o por fórmula, el término que cambia en focus y un summary con el resultado",
		len(found), strings.Join(lines, "; "))}
}

// calculoVisual is the visual formats the kit draws from a fence: a drawing, not a text calculation.
var calculoVisual = map[string]bool{"mermaid": true, "desmos-graph": true, "geogebra": true, "ggb": true, "datachart": true, "markmap": true}

// calculoGriegas maps the Greek letters a formula writes as commands to the letter itself: a variable, not a number.
var calculoGriegas = map[string]string{
	"alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε", "theta": "θ", "lambda": "λ",
	"mu": "μ", "pi": "π", "rho": "ρ", "sigma": "σ", "tau": "τ", "phi": "φ", "omega": "ω",
	"Delta": "Δ", "Sigma": "Σ", "Omega": "Ω",
}

var (
	// The blanks the tool reads as blanks, other than the ones RE2's `\s` already has: each one becomes a space before the
	// rule reads the note, so `\s` means the same on both sides (the tool's JavaScript `\s` includes them).
	calculoEspacios = regexp.MustCompile(`[\x0b\x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]`)
	// The list or quote mark that opens a line (`- `, `1. `, `> `): a calculation may sit in a bullet.
	calculoMarca = regexp.MustCompile(`^\s*(?:>\s*)*(?:[-*+]\s+|\d{1,3}[.)]\s+)?`)
	// One side of `<expr> = <expr>`: letters, figures, spaces, operators, brackets and the signs of an expression.
	calculoLado = regexp.MustCompile(`^[\p{L}\p{N} +\-−–—×·*/÷^()\[\]{}.,_%√]+$`)
	// A function call (`foo(1)`) is not arithmetic. A word of two letters or more is a unit or a label (`184 ms`,
	// `512 bits`): it does not change that the side holds numbers. A single letter is a variable.
	calculoLlamada = regexp.MustCompile(`\p{L}\s*\(`)
	calculoPalabra = regexp.MustCompile(`\p{L}{2,}`)
	// A side that holds numbers and operators only: a letter is a variable the substitution did not replace.
	calculoNumeros = regexp.MustCompile(`^[\d.,+\-−–—×·*/÷^()%\s]+$`)
	// An operation between two operands: `64 / 32`, `3 − 2`, `(184 - 120) / 32`. A lone sign (`+10`) is not one.
	calculoOperacion = regexp.MustCompile(`[\d)]\s*[+\-−–—×·*/÷^]\s*[\d(]`)
	// The formulas: `$$…$$`, `\[…\]` and every `<lk-math>`, display or bare. One group per form.
	calculoFormula = regexp.MustCompile(`(?s)\$\$(.+?)\$\$|\\\[(.*?)\\\]|<lk-math\b([^>]*)>(.*?)</lk-math>`)
	// A `<lk-math>` with the display attribute is a display; the attributes are the third group.
	calculoDisplay = regexp.MustCompile(`\bdisplay\b`)
	// A kit figure opens with its tag.
	calculoAbreFigura = regexp.MustCompile(`<(lk-[a-z-]+)\b[^>]*>`)
	// A bare <lk-math> is a formula only alone on its line: at most a list or quote mark before it.
	calculoSuelto = regexp.MustCompile(`^\s*(?:>\s*)*(?:[-*+]\s+|\d{1,3}[.)]\s+)?$`)
	// A line break of a formula: `\\`, with an optional spacing argument (`\\[2pt]`).
	calculoSalto = regexp.MustCompile(`\\\\(?:\[[^\]]*\])?`)
	// The HTML entities a page writes inside a formula, read as the character they stand for.
	calculoEntidades = strings.NewReplacer("&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`, "&apos;", "'", "&nbsp;", " ", "&#39;", "'")
	// A code span of one line: it is quoted text, not a formula.
	calculoCodigo  = regexp.MustCompile("`[^`\n]*`")
	calculoBlancos = regexp.MustCompile(`\s+`)
	// The LaTeX of a formula, written in the plain form a text line has (see calculoNormaliza).
	calculoArray     = regexp.MustCompile(`\\begin\{array\}\{[^{}]*\}`)
	calculoEntorno   = regexp.MustCompile(`\\(?:begin|end)\{[^{}]*\}`)
	calculoEtiqueta  = regexp.MustCompile(`\\(?:label|tag)\{[^{}]*\}`)
	calculoMaqueta   = regexp.MustCompile(`\\(?:hline|nonumber|notag)\b`)
	calculoAjuste    = regexp.MustCompile(`\\(?:left|right|displaystyle|textstyle|quad|qquad)\b`)
	calculoEspaciado = regexp.MustCompile(`\\[,;:! ]`)
	calculoCdots     = regexp.MustCompile(`\\cdots`)
	calculoCdot      = regexp.MustCompile(`\\cdot`)
	calculoTimes     = regexp.MustCompile(`\\times`)
	calculoDiv       = regexp.MustCompile(`\\div`)
	calculoTexto     = regexp.MustCompile(`\\(?:text|textrm|textbf|mathrm|mathbf|mathit|mathsf|operatorname)\s*\{([^{}]*)\}`)
	calculoComando   = regexp.MustCompile(`\\([a-zA-Z]+)`)
	calculoFraccion  = regexp.MustCompile(`\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}`)
	calculoFraccionC = regexp.MustCompile(`\\[dt]?frac([0-9])([0-9])`)
	calculoRaiz      = regexp.MustCompile(`\\sqrt\{([^{}]*)\}`)
	calculoIndice    = regexp.MustCompile(`([\^_])\{([^{}]*)\}`)
	calculoDoble     = regexp.MustCompile(`\\\\`)
	calculoEscapado  = regexp.MustCompile(`\\(.)`)
	calculoLlaves    = regexp.MustCompile(`[{}]`)
)

// calculoRenglon is one line the rule reads as a calculation line: where it sits in the note, and its shape.
type calculoRenglon struct {
	desde, hasta int
	texto        string
}

// calculoBloque is one formula the rule reads: where it sits in the note, the lines it covers, and its calculation lines
// (how many, and whether one of them carries an operation).
type calculoBloque struct {
	inicio, fin  int
	desde, hasta int
	n            int
	operacion    bool
}

// calculoHallazgo is one calculation: its first and last line, and how many of its lines are calculation lines.
type calculoHallazgo struct {
	desde, hasta, n int
}

// calculoRecorta trims the blanks the tool trims. The blanks are normalized first, so the set is ASCII.
func calculoRecorta(s string) string {
	return strings.Trim(s, " \t\n\f\r")
}

// calculosEnTexto finds the calculations written as text. A fenced block that is not code is one block; the lines around
// it form runs (a blank line does not end a run, any other line that is not an equation does). The figures of the kit and
// the display formulas are not text lines: each one leaves a mark that breaks its run.
func calculosEnTexto(nota string) []calculoHallazgo {
	lineas := strings.Split(calculoSinFiguras(nota), "\n")
	var found []calculoHallazgo
	var tramo []calculoRenglon
	cierra := func() {
		if h, ok := calculoDeRenglones(tramo); ok {
			found = append(found, h)
		}
		tramo = nil
	}
	for i := 0; i < len(lineas); i++ {
		t := calculoRecorta(lineas[i])
		if strings.HasPrefix(t, "```") {
			cierra()
			lang := strings.ToLower(calculoRecorta(t[3:]))
			var cuerpo []calculoRenglon
			j := i + 1
			for ; j < len(lineas) && !strings.HasPrefix(calculoRecorta(lineas[j]), "```"); j++ {
				cuerpo = append(cuerpo, calculoRenglon{desde: j + 1, hasta: j + 1, texto: calculoRenglonDe(lineas[j])})
			}
			if !registerCodeLangs[lang] && !calculoVisual[lang] {
				if h, ok := calculoDeRenglones(cuerpo); ok {
					found = append(found, h)
				}
			}
			i = j
			continue
		}
		// A blank line does not end a run; any other line that is not an equation does.
		if t == "" {
			continue
		}
		renglon := calculoRenglonDe(lineas[i])
		if calculoEcuacion(renglon) {
			tramo = append(tramo, calculoRenglon{desde: i + 1, hasta: i + 1, texto: renglon})
		} else {
			cierra()
		}
	}
	cierra()
	return found
}

// calculoDeRenglones measures one run of text lines: two or more calculation lines, one of them with an operation.
func calculoDeRenglones(renglones []calculoRenglon) (calculoHallazgo, bool) {
	var cuentas []calculoRenglon
	operacion := false
	for _, r := range renglones {
		if ok, op := calculoCuenta(r.texto); ok {
			cuentas = append(cuentas, r)
			operacion = operacion || op
		}
	}
	if len(cuentas) < 2 || !operacion {
		return calculoHallazgo{}, false
	}
	return calculoHallazgo{desde: cuentas[0].desde, hasta: cuentas[len(cuentas)-1].hasta, n: len(cuentas)}, true
}

// calculosEnFormulas finds the series of formulas: each one follows the last with only blanks between them. A line of
// prose, a label or a kit figure between two formulas cuts the series, so it is not a series.
func calculosEnFormulas(nota string) []calculoHallazgo {
	vis := calculoVisible(nota)
	var found []calculoHallazgo
	var serie []calculoBloque
	cierra := func() {
		if h, ok := calculoDeSerie(serie); ok {
			found = append(found, h)
		}
		serie = nil
	}
	for _, b := range calculoBloques(vis) {
		if len(serie) > 0 && calculoRecorta(vis[serie[len(serie)-1].fin:b.inicio]) == "" {
			serie = append(serie, b)
		} else {
			cierra()
			serie = append(serie, b)
		}
	}
	cierra()
	return found
}

// calculoDeSerie measures one series of formulas: two or more calculation lines in all, one of them with an operation. It
// reports the first and the last formula that carries a calculation line.
func calculoDeSerie(serie []calculoBloque) (calculoHallazgo, bool) {
	n, operacion, primero := 0, false, true
	var desde, hasta int
	for _, b := range serie {
		if b.n == 0 {
			continue
		}
		if primero {
			desde, primero = b.desde, false
		}
		hasta = b.hasta
		n += b.n
		operacion = operacion || b.operacion
	}
	if n < 2 || !operacion {
		return calculoHallazgo{}, false
	}
	return calculoHallazgo{desde: desde, hasta: hasta, n: n}, true
}

// calculoBloques reads the formulas of the visible note, in reading order. A bare <lk-math> is a formula only alone on its
// lines; a display is always one.
func calculoBloques(vis string) []calculoBloque {
	var out []calculoBloque
	for _, m := range calculoFormula.FindAllStringSubmatchIndex(vis, -1) {
		inicio := m[0]
		var contenido string
		switch {
		case m[2] >= 0:
			contenido = vis[m[2]:m[3]]
		case m[4] >= 0:
			contenido = vis[m[4]:m[5]]
		default:
			if !calculoDisplay.MatchString(vis[m[6]:m[7]]) && !calculoSueltoEnSuLinea(vis, m[0], m[1]) {
				continue
			}
			contenido = vis[m[8]:m[9]]
			// A bare element starts at the start of its line: its list mark belongs to the line, not to the gap between formulas.
			inicio = strings.LastIndex(vis[:m[0]], "\n") + 1
		}
		n, operacion := 0, false
		for _, r := range calculoRenglonesDeFormula(contenido) {
			if ok, op := calculoCuenta(r); ok {
				n++
				operacion = operacion || op
			}
		}
		out = append(out, calculoBloque{
			inicio: inicio, fin: m[1],
			desde: calculoLineaDe(vis, m[0]), hasta: calculoLineaDe(vis, m[1]-1),
			n: n, operacion: operacion,
		})
	}
	return out
}

// calculoRenglonesDeFormula splits a formula into its lines: each `\\` is a line. A line that starts with `=` (the
// continuation of an aligned, align or array, with its `&` already removed) takes the left side of the last line that
// has one.
func calculoRenglonesDeFormula(contenido string) []string {
	var renglones []string
	ladoPrevio, hayLado := "", false
	for _, parte := range calculoSalto.Split(contenido, -1) {
		texto := calculoNormaliza(parte)
		if texto == "" {
			continue
		}
		if strings.HasPrefix(texto, "=") && hayLado {
			texto = ladoPrevio + texto
		}
		if i := strings.Index(texto, "="); i > 0 {
			ladoPrevio, hayLado = calculoRecorta(texto[:i]), true
		}
		renglones = append(renglones, texto)
	}
	return renglones
}

// calculoSueltoEnSuLinea reports whether a bare <lk-math> sits alone on its lines: at most a list or quote mark before it,
// and nothing after it on its last line.
func calculoSueltoEnSuLinea(nota string, inicio, fin int) bool {
	antes := nota[strings.LastIndex(nota[:inicio], "\n")+1 : inicio]
	despues := nota[fin:]
	if i := strings.Index(despues, "\n"); i >= 0 {
		despues = despues[:i]
	}
	return calculoSuelto.MatchString(antes) && calculoRecorta(despues) == ""
}

// calculoBlanqueaFiguras blanks every kit figure (`<lk-…>` up to its own closing tag) and keeps its newlines, so a line
// number is the one in the note, and the figure leaves a mark. A `<lk-math>` stays when conMath: it is a formula.
func calculoBlanqueaFiguras(nota string, conMath bool) string {
	var out strings.Builder
	at := 0
	for _, open := range calculoAbreFigura.FindAllStringSubmatchIndex(nota, -1) {
		if open[0] < at {
			continue
		}
		nombre := nota[open[2]:open[3]]
		if conMath && nombre == "lk-math" {
			continue
		}
		cierre := "</" + nombre + ">"
		i := strings.Index(nota[open[1]:], cierre)
		if i < 0 {
			continue
		}
		fin := open[1] + i + len(cierre)
		out.WriteString(nota[at:open[0]])
		out.WriteString("\x01" + strings.Repeat("\n", strings.Count(nota[open[0]:fin], "\n")))
		at = fin
	}
	out.WriteString(nota[at:])
	return out.String()
}

// calculoSinFiguras is the text the text calculations are read from: the kit figures and the display formulas are not
// text lines. Each one becomes a mark with its newlines, so the run of text lines is cut where it stood.
func calculoSinFiguras(nota string) string {
	nota = calculoBlanqueaFiguras(nota, false)
	return calculoFormula.ReplaceAllStringFunc(nota, func(bloque string) string {
		return "\x01" + strings.Repeat("\n", strings.Count(bloque, "\n"))
	})
}

// calculoVisible is the text the formulas are read from: a fenced block is code or text, not a formula; a kit figure is
// not a formula either, except `<lk-math>`; and a code span of one line is quoted text. Each block it removes keeps its
// newlines and leaves a mark, so a line number is the note's, and a block between two formulas breaks their series.
func calculoVisible(nota string) string {
	var lineas []string
	cerca := false
	for _, linea := range strings.Split(nota, "\n") {
		t := calculoRecorta(linea)
		switch {
		case !cerca && strings.HasPrefix(t, "```"):
			cerca = true
			lineas = append(lineas, "\x01")
		case cerca:
			if strings.HasPrefix(t, "```") {
				cerca = false
			}
			lineas = append(lineas, "")
		default:
			lineas = append(lineas, linea)
		}
	}
	vis := calculoBlanqueaFiguras(strings.Join(lineas, "\n"), true)
	return calculoCodigo.ReplaceAllString(vis, "\x01")
}

// calculoNormaliza writes a formula in the plain form a text line has, so one predicate reads both. The HTML entities are
// read as their signs; the environments (`\begin{…}`, `\end{…}`, the column of an array) and the layout marks (`\nonumber`,
// `\label{…}`) are not part of the calculation; a fraction is a quotient, a root a power, the scripts go in parentheses,
// and the Greek letters are letters. What is left is read like a text line.
func calculoNormaliza(contenido string) string {
	s := calculoEntidades.Replace(contenido)
	s = calculoBlancos.ReplaceAllString(s, " ")
	s = calculoArray.ReplaceAllString(s, " ")
	s = calculoEntorno.ReplaceAllString(s, " ")
	s = calculoEtiqueta.ReplaceAllString(s, " ")
	s = calculoMaqueta.ReplaceAllString(s, " ")
	s = calculoAjuste.ReplaceAllString(s, " ")
	s = calculoEspaciado.ReplaceAllString(s, " ")
	// `\cdots` before `\cdot`: the dot of an ellipsis is not a product.
	s = calculoCdots.ReplaceAllString(s, " ")
	s = calculoCdot.ReplaceAllString(s, "·")
	s = calculoTimes.ReplaceAllString(s, "×")
	s = calculoDiv.ReplaceAllString(s, "÷")
	s = calculoTexto.ReplaceAllString(s, " $1 ")
	s = calculoComando.ReplaceAllStringFunc(s, func(m string) string {
		if letra, ok := calculoGriegas[m[1:]]; ok {
			return letra
		}
		return m
	})
	for previo := ""; previo != s; {
		previo = s
		s = calculoFraccion.ReplaceAllString(s, "($1)/($2)")
		s = calculoFraccionC.ReplaceAllString(s, "($1)/($2)")
		s = calculoRaiz.ReplaceAllString(s, "($1)^(1/2)")
	}
	s = calculoIndice.ReplaceAllString(s, "$1($2)")
	s = calculoDoble.ReplaceAllString(s, " ")
	s = strings.ReplaceAll(s, "&", "")
	s = calculoComando.ReplaceAllString(s, " $1 ")
	s = calculoEscapado.ReplaceAllString(s, "$1")
	s = calculoLlaves.ReplaceAllString(s, "")
	return calculoRecorta(calculoBlancos.ReplaceAllString(s, " "))
}

// calculoRenglonDe is a text line as the reader reads a calculation: without its list or quote mark, and without the
// code marks a page's preformatted block wraps around it.
func calculoRenglonDe(raw string) string {
	t := calculoRecorta(calculoMarca.ReplaceAllString(raw, ""))
	t = strings.TrimPrefix(t, "`")
	t = strings.TrimSuffix(t, "`")
	return calculoRecorta(t)
}

// calculoEcuacion reports a line of the form `<expr> = <expr>`: exactly one `=`, and an expression on each side.
func calculoEcuacion(texto string) bool {
	partes := strings.Split(texto, "=")
	if len(partes) != 2 {
		return false
	}
	for _, p := range partes {
		p = calculoRecorta(p)
		if p == "" || !calculoLado.MatchString(p) {
			return false
		}
	}
	return true
}

// calculoNumerico is the side of an equation that holds numbers and operators only, its words aside. It is "" for a side
// with a function call or a variable, and for a side with no figure.
func calculoNumerico(lado string) string {
	if calculoLlamada.MatchString(lado) {
		return ""
	}
	s := calculoRecorta(calculoPalabra.ReplaceAllString(lado, " "))
	if !strings.ContainsAny(s, "0123456789") || !calculoNumeros.MatchString(s) {
		return ""
	}
	return s
}

// calculoCuenta reads one calculation line: an equation with a side that holds numbers, and the length and shape of a
// step line (`registerIsStep`). It reports too whether the substitution carries an operation, so that a list of values
// without one is data, not a calculation.
func calculoCuenta(texto string) (cuenta bool, operacion bool) {
	if !calculoEcuacion(texto) || !registerIsStep(texto) {
		return false, false
	}
	for _, lado := range strings.Split(texto, "=") {
		if s := calculoNumerico(lado); s != "" {
			cuenta = true
			operacion = operacion || calculoOperacion.MatchString(s)
		}
	}
	return cuenta, operacion
}

// calculoLineaDe is the number of the line a byte offset of the note falls on.
func calculoLineaDe(nota string, indice int) int {
	return strings.Count(nota[:indice], "\n") + 1
}
