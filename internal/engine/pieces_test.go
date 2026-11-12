package engine

import (
	"os"
	"strings"
	"testing"

	"learning/internal/rules"
)

// The visual pieces (#218–#221) are visuals the reader draws from a note's JSON:
// the engine counts them like a scene, and refuses an empty payload.

func piece(el, payload string) string {
	return "<" + el + ">\n<script type=\"application/json\">\n" + payload + "\n</script>\n</" + el + ">"
}

const memoryPayload = `{"columns":[{"id":"stack","label":"STACK"},{"id":"heap","label":"HEAP"}],"steps":[{"code":"let s1 = String::from(\"hola\");","rows":[{"stack":{"id":"s1","name":"s1","cells":["ptr","len 4","cap 4"],"points":"h1"},"heap":{"id":"h1","cells":["h","o","l","a"]}}]}]}`

const tablesPayload = `{"tables":[{"id":"g","name":"games","columns":["title","dev"],"rows":[["Zelda","1"]]},{"id":"d","name":"devs","columns":["id","name"],"rows":[["1","Nintendo"]]}],"join":{"from":"g.dev","to":"d.id","on":"dev = id"}}`

const cardsPayload = `{"cards":[{"verdict":"ok","pill":"COMPILA","title":"Muchas","reason":"Todos leen"},{"verdict":"no","pill":"NO COMPILA","title":"Mezcla","reason":"Uno escribe"}]}`

func TestVisualCounterCountsPieces(t *testing.T) {
	cases := []struct {
		name   string
		text   string
		want   int
		guides int
	}{
		{"verdict cards that draw", piece("lk-cards", cardsPayload), 1, 1},
		{"a captioned piece guides itself", piece("lk-cards", `{"caption":"Cada caso, con su veredicto.",`+cardsPayload[1:]), 1, 0},
		{"one card is not a comparison", piece("lk-cards", `{"cards":[{"verdict":"ok","title":"Sola"}]}`), 0, 0},
		{"a piece without a payload", "<lk-cards><div>vacío</div></lk-cards>", 0, 0},
		{"a piece inside a fence is code", "```html\n" + piece("lk-cards", cardsPayload) + "\n```", 0, 0},
		{"a memory diagram with steps", piece("lk-memory", memoryPayload), 1, 1},
		{"a memory diagram without steps", piece("lk-memory", `{"columns":[{"id":"stack","label":"STACK"}],"steps":[]}`), 0, 0},
		{"joined tables", piece("lk-tables", tablesPayload), 1, 1},
		{"a group by", piece("lk-tables", `{"group":{"by":"d","columns":["a","d"],"rows":[["x","y"]]}}`), 1, 1},
		{"tables without rows", piece("lk-tables", `{"tables":[]}`), 0, 0},
		{"a venn with two sets", piece("lk-venn", `{"sets":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"fill":["a+b"],"op":"INNER JOIN"}`), 1, 1},
		{"a venn with one set", piece("lk-venn", `{"sets":[{"id":"a","label":"A"}]}`), 0, 0},
		{"a piece and a scene", piece("lk-cards", cardsPayload) + "\n" + figureScene, 2, 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, missing := countVisualsAndGuides(tc.text, []string{"mermaid"}, []string{"svg"}, "Cómo leerlo")
			if got != tc.want {
				t.Fatalf("countVisuals = %d, want %d", got, tc.want)
			}
			if missing != tc.guides {
				t.Fatalf("visuals without a reading guide = %d, want %d", missing, tc.guides)
			}
		})
	}
}

// A piece is the part's drawn example: it satisfies the one-drawn-scene minimum,
// and it counts against the one-scene budget with the scenes.
func TestPartStandardCountsAPieceAsTheDrawnExample(t *testing.T) {
	th := rules.PartStandardThresholds{MaxScenes: 1, MinScenes: 1}
	if got := sceneFindings(piece("lk-cards", cardsPayload), th); len(got) != 0 {
		t.Fatalf("a part drawn with verdict cards was refused: %v", got)
	}
	if got := sceneFindings(piece("lk-cards", `{"cards":[]}`), th); len(got) != 1 || !strings.Contains(got[0], "0 drawn") {
		t.Fatalf("an empty piece drew the example: %v", got)
	}
	both := piece("lk-cards", cardsPayload) + "\n" + standardScene
	got := sceneFindings(both, th)
	if len(got) != 1 || !strings.Contains(got[0], "<lk-cards>") || !strings.Contains(got[0], "limit 1") {
		t.Fatalf("a scene and a piece pass the one-scene budget: %v", got)
	}
}

// A piece is looked at, not read: its JSON never spends the prose budget or
// becomes a paragraph.
func TestPieceJSONIsNotProse(t *testing.T) {
	base := "# Parte\n\nUna frase corta.\n"
	with := base + "\n" + piece("lk-cards", cardsPayload) + "\n"
	if proseWords(with) != proseWords(base) {
		t.Fatalf("piece JSON counted as prose: %d words vs %d", proseWords(with), proseWords(base))
	}
	if got, want := len(proseParagraphs(with)), len(proseParagraphs(base)); got != want {
		t.Fatalf("piece JSON became %d paragraph(s), want %d", got, want)
	}
}

// A memory diagram is also a story step: the story header carries the code line,
// the stage carries the rows.
func TestStoryStepDrawingMemoryIsAccepted(t *testing.T) {
	story := `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Mover","memory":{"columns":[{"id":"stack","label":"STACK"}]},"steps":[
 {"title":"Uno","narrator":"Uno.","equation":{"atoms":[{"t":"a","id":"a"}]},"stage":{"memory":{"rows":[{"stack":{"id":"s","name":"s","cells":["ptr"]}}]}}},
 {"title":"Dos","narrator":"Dos.","equation":{"atoms":[{"t":"b","id":"b"}]},"stage":{"memory":{"rows":[{"stack":{"id":"s","name":"s","cells":["ptr"]}}]}}},
 {"title":"Tres","narrator":"Tres.","equation":{"atoms":[{"t":"c","id":"c"}]},"stage":{"memory":{"rows":[{"stack":{"id":"s","name":"s","cells":["ptr"]}}]}}}
]}
</script>
</lk-story>`
	_, problems := storyProgressiveProblems(story)
	for _, p := range problems {
		t.Errorf("a story step drawing memory was refused: %s", p)
	}
}

// A story step may draw a piece instead of a scene: it draws something, and it is
// what changes in that step.
func TestStoryStepDrawingAPieceIsAcceptedAsADerivation(t *testing.T) {
	story := `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Préstamos","steps":[
 {"title":"Uno","narrator":"Uno.","equation":{"atoms":[{"t":"a","id":"a"}]},"stage":{"scene":{"actors":[{"id":"a","x":40,"y":120,"w":44,"h":40,"label":"a","tone":"blue"}]}}},
 {"title":"Dos","narrator":"Dos.","equation":{"atoms":[{"t":"b","id":"b"}]},"stage":{"cards":` + cardsPayload + `}},
 {"title":"Tres","narrator":"Tres.","equation":{"atoms":[{"t":"c","id":"c"}]},"stage":{"cards":` + cardsPayload + `}}
]}
</script>
</lk-story>`
	_, problems := storyProgressiveProblems(story)
	for _, p := range problems {
		t.Errorf("a story step drawing a piece was refused: %s", p)
	}
}

func TestStoryStepDrawingTablesIsAccepted(t *testing.T) {
	story := `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"JOIN","tables":` + tablesPayload + `,"steps":[
 {"title":"Uno","narrator":"Uno.","equation":{"atoms":[{"t":"a","id":"a"}]},"stage":{"tables":{"show":["tables"]}}},
 {"title":"Dos","narrator":"Dos.","equation":{"atoms":[{"t":"b","id":"b"}]},"stage":{"tables":{"show":["tables","links"]}}},
 {"title":"Tres","narrator":"Tres.","equation":{"atoms":[{"t":"c","id":"c"}]},"stage":{"tables":{"show":["tables","links","result"]}}}
]}
</script>
</lk-story>`
	_, problems := storyProgressiveProblems(story)
	for _, p := range problems {
		t.Errorf("a story step drawing tables was refused: %s", p)
	}
}

func TestStoryStepDrawingAVennIsAccepted(t *testing.T) {
	story := `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"JOIN","venn":{"sets":[{"id":"a","label":"A"},{"id":"b","label":"B"}]},"steps":[
 {"title":"Uno","narrator":"Uno.","equation":{"atoms":[{"t":"a","id":"a"}]},"stage":{"venn":{"fill":["a+b"]}}},
 {"title":"Dos","narrator":"Dos.","equation":{"atoms":[{"t":"b","id":"b"}]},"stage":{"venn":{"fill":["a","a+b"]}}},
 {"title":"Tres","narrator":"Tres.","equation":{"atoms":[{"t":"c","id":"c"}]},"stage":{"venn":{"fill":["a","a+b","b"]}}}
]}
</script>
</lk-story>`
	_, problems := storyProgressiveProblems(story)
	for _, p := range problems {
		t.Errorf("a story step drawing a venn was refused: %s", p)
	}
}

// The notes the kit ships as worked examples of each piece are what the engine
// must accept: a standalone piece is a drawn figure, a story passes the rule.
func TestShippedPieceExamplesAreDrawnByTheEngine(t *testing.T) {
	standalone := map[string]int{"prestamos-rust.md": 1, "memoria-string-rust.md": 1, "sql-group-by.md": 1}
	for name, want := range standalone {
		raw, err := os.ReadFile("../../integrations/pi/kit/examples/" + name)
		if err != nil {
			t.Fatal(err)
		}
		if got := drawnPieces(string(raw)); got != want {
			t.Errorf("%s: the engine counts %d drawn piece(s), want %d", name, got, want)
		}
		if got := pieceOpenCount(string(raw)); got != want {
			t.Errorf("%s: the engine counts %d piece(s) opened, want %d", name, got, want)
		}
	}
}
