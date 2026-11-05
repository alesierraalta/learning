package engine

import "testing"

// writeExplanationWithVisual writes a valid explanation whose visual is the
// given snippet (an embed or a plugin code block).
func (f *fixture) writeExplanationWithVisual(t *testing.T, part, visual string) {
	t.Helper()
	body := "---\ntipo: explicacion\nnodo: T." + part + "\nnivel: medio\n---\n# " + part +
		"\n\nExplicación con ejemplos concretos.\n\n## Ejemplo\n\nCaso numérico paso a paso.\n\n" + fixtureWalkthrough + "\n\n" +
		"**Fuente**: Sutton & Barto, verificación de fixture.\n\n" + visual + "\n\n## Mini-quiz\n"
	for _, q := range buildQuizQuestions(part) {
		body += "\n" + q.Enunciado + "\n"
	}
	rel := f.canonicalPartFile(t, part)
	f.write(t, rel, body)
	f.linkPartInIndex(t, rel)
}

// figureScene is the note-side figure: a JSON scene the reader draws with the
// visual engine, so the note names meaning and never coordinates.
const figureScene = `<lk-figure>
<script type="application/json">
{"title":"El almacén","aria":"Una rejilla con el robot y la salida","viewBox":"0 0 360 290","grids":[{"x":16,"y":40,"cols":4,"rows":3,"w":82,"h":82,"cells":[{"c":0,"r":0,"kind":"robot"},{"c":3,"r":0,"kind":"exit","label":"+1"}]}]}
</script>
</lk-figure>`

// A note figure is a visual only when its scene draws something, whichever
// line the script opens on, and it must not hide an element beside it on the
// same line. A value of the wrong type is not a scene the engine can draw.
func TestVisualCounterCountsFiguresAndInlineElements(t *testing.T) {
	const valid = `{"grids":[{"x":0,"y":0,"cols":2,"rows":1,"w":50,"h":50,"cells":[{"c":0,"r":0}]}]}`
	const circle = `<svg><circle cx="1" cy="1" r="1"/></svg>`
	figure := func(payload string) string {
		return `<lk-figure><script type="application/json">` + payload + `</script></lk-figure>`
	}
	cases := []struct {
		name string
		text string
		want int
	}{
		{"compact figure on one line", figure(valid), 1},
		{"compact opening line, closed below", `<lk-figure><script type="application/json">` + valid + `</script>` + "\n</lk-figure>", 1},
		{"script spans lines", "<lk-figure>\n<script type=\"application/json\">\n" + valid + "\n</script>\n</lk-figure>", 1},
		{"figure then svg on one line", figure(valid) + circle, 2},
		{"svg then figure on one line", circle + figure(valid), 2},
		{"unicode before the figure", "İİ " + figure(valid), 1},
		{"unicode inside the figure", figure(`{"title":"İ","grids":[{"x":0,"y":0,"cols":1,"rows":1,"w":9,"h":9,"cells":[{"c":0,"r":0}]}]}`), 1},
		{"a scene key holding a string", figure(`{"grids":"4"}`), 0},
		{"a scene key holding a number", figure(`{"boxes":5}`), 0},
		{"an empty list", figure(`{"arrows":[]}`), 0},
		{"bars without a list", figure(`{"bars":{"baseline":100}}`), 0},
		{"bars with one bar", figure(`{"bars":{"baseline":100,"bars":[{"x":1,"w":9,"h":20}]}}`), 1},
		// A declared element beside a figure that spans lines still draws.
		{"svg then a multiline figure", circle + "<lk-figure>\n<script type=\"application/json\">\n" + valid + "\n</script>\n</lk-figure>", 2},
		{"figure close then svg", "<lk-figure>\n<script type=\"application/json\">\n" + valid + "\n</script>\n</lk-figure>" + circle, 2},
		{"svg then a compact opening line", circle + "<lk-figure><script type=\"application/json\">" + valid + "</script>\n</lk-figure>", 2},
		// An entry the renderer cannot draw makes the whole scene undrawable.
		{"a grid without its shape", figure(`{"grids":[{}]}`), 0},
		{"an arrow without its ends", figure(`{"arrows":[{}]}`), 0},
		{"a path without a d", figure(`{"paths":[{}]}`), 0},
		{"a box without its place", figure(`{"boxes":[{}]}`), 0},
		{"a label without a place", figure(`{"labels":[{}]}`), 0},
		{"a bar without its place", figure(`{"bars":{"bars":[{}]}}`), 0},
		{"a grid without cells", figure(`{"grids":[{"cols":1,"rows":1,"w":9,"h":9,"cells":[]}]}`), 0},
		{"bars without bars", figure(`{"bars":{}}`), 0},
		{"a grid with its cell", figure(`{"grids":[{"cols":1,"rows":1,"w":9,"h":9,"cells":[{"c":0,"r":0}]}]}`), 1},
		// A semantic field the renderer refuses fails the count too.
		{"an unknown tone", figure(`{"labels":[{"x":1,"y":1,"text":"a","tone":"purple"}]}`), 0},
		{"an unknown anchor", figure(`{"labels":[{"x":1,"y":1,"text":"a","anchor":"middle-ish"}]}`), 0},
		{"a non-numeric width", figure(`{"arrows":[{"x1":1,"y1":1,"x2":9,"y2":1,"width":"wide"}]}`), 0},
		{"a viewBox without four numbers", figure(`{"viewBox":"0 0 360","arrows":[{"x1":1,"y1":1,"x2":9,"y2":1}]}`), 0},
		// The shapes that worked before still count.
		{"a named tone and a known anchor", figure(`{"labels":[{"x":1,"y":1,"text":"a","tone":"blue","anchor":"middle"}]}`), 1},
		{"a numeric width", figure(`{"arrows":[{"x1":1,"y1":1,"x2":9,"y2":1,"width":2}]}`), 1},
		{"a value cell with its own text", figure(`{"grids":[{"cols":1,"rows":1,"w":9,"h":9,"cells":[{"c":0,"r":0,"kind":"value","text":"V(s)"}]}]}`), 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := countVisuals(tc.text, []string{"mermaid"}, []string{"svg"}); got != tc.want {
				t.Fatalf("countVisuals(%q) = %d, want %d", tc.text, got, tc.want)
			}
		})
	}
}

// A planned visual is satisfied by an embed, by a code block of a visual
// format declared in the rules (installed Obsidian plugins and native mermaid),
// by a declared inline element such as <svg> that Obsidian renders, or by an
// <lk-figure> that carries a JSON scene the reader can draw; empty blocks or
// elements, an empty or unparsable figure, inline elements inside code, and
// undeclared formats are not visuals.
func TestPlannedVisualAcceptsDeclaredFormats(t *testing.T) {
	cases := []struct {
		name   string
		visual string
		ok     bool
	}{
		// the marker is per-visual: one line right after the visual
		{"embed with reading guide", "![diagrama](diagrama.png)\nCómo leerlo: entra por la caja de arriba y baja.\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", true},
		{"image embed", "![diagrama](diagrama.png)\nCómo leerlo: entra por la caja de arriba y baja.\n\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", true},
		{"excalidraw embed", "![[consenso.excalidraw]]\nCómo leerlo: entra por la caja de arriba y baja.\n\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", true},
		{"mermaid block", "```mermaid\nflowchart LR\n  A --> B\n```\nCómo leerlo: entra por la caja de arriba y baja.\n\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", true},
		{"desmos block", "```desmos-graph\ny = x^2\n```\nCómo leerlo: entra por la caja de arriba y baja.\n\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", true},
		{"geogebra block", "```geogebra\nA = (1, 2)\n```\nCómo leerlo: entra por la caja de arriba y baja.\n\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", true},
		{"ggb block", "```ggb\nf(x) = 2x\n```\nCómo leerlo: entra por la caja de arriba y baja.\n\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", true},
		{"datachart block", "```datachart\ntype: bar\n```\nCómo leerlo: entra por la caja de arriba y baja.\n\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", true},
		{"inline svg", `<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>` + "\nCómo leerlo: entra por la caja de arriba y baja.\n\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", true},
		{"multiline inline svg", "<svg viewBox=\"0 0 10 10\">\n  <rect width=\"4\" height=\"4\"/>\n</svg>\nCómo leerlo: entra por la caja de arriba y baja.\n\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", true},
		{"lk-figure scene", figureScene + "\nCómo leerlo: entra por la casilla del robot y mira la salida.\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", true},
		{"empty lk-figure scene", `<lk-figure><script type="application/json">{}</script></lk-figure>` + "\nCómo leerlo: entra por la caja de arriba y baja.\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", false},
		{"unparsable lk-figure scene", `<lk-figure><script type="application/json">{"grids": [</script></lk-figure>` + "\nCómo leerlo: entra por la caja de arriba y baja.\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", false},
		{"lk-figure without a JSON scene", "<lk-figure><div>vacío</div></lk-figure>\nCómo leerlo: entra por la caja de arriba y baja.\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", false},
		{"lk-figure inside a code block is code", "```html\n" + figureScene + "\n```\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", false},
		{"lk-figure without the reading guide", figureScene + "\n\n![detalle](detalle.png)\nCómo leerlo: compara las dos barras.\n", false},
		{"empty svg", "<svg viewBox=\"0 0 10 10\"></svg>", false},
		{"unclosed svg", "<svg viewBox=\"0 0 10 10\"><rect/>", false},
		{"svg inside a code block is code", "```html\n<svg><rect/></svg>\n```", false},
		{"empty mermaid block", "```mermaid\n```", false},
		{"undeclared format", "```markmap\n# Tema\n```", false},
		{"plain code is not a visual", "```go\nfmt.Println(1)\n```", false},
		{"no visual", "Texto sin visual.", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			f.readyThroughPlanning(t, 2, 6)
			f.writeExplanationWithVisual(t, "p1", tc.visual)
			rep, code := f.run(t, f.opts("validate", "explanation"))
			check, found := hasCheck(rep, "explanation-content")
			if !found {
				t.Fatalf("explanation-content check missing: %+v", rep.Checks)
			}
			if tc.ok && (check.Status != "PASS" || code != 0) {
				t.Fatalf("visual %q rejected: %s (exit %d)", tc.visual, check.Reason, code)
			}
			if !tc.ok && (check.Status != "FAIL" || code != 1) {
				t.Fatalf("visual %q accepted: %s (exit %d)", tc.visual, check.Reason, code)
			}
		})
	}
}
