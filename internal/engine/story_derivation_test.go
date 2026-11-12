package engine

import (
	"os"
	"strings"
	"testing"
)

// A derivation step shows what changes with a move or a mark. The kit draws them
// from `stage.scene` (that is where every example puts them), so the rule has to
// read them there: reading only the step's own `moves` refused a story that draws
// its move and its marks, and the gated examples failed the engine's own check.
func TestDerivationStoryCountsTheMovesAndMarksOfItsStage(t *testing.T) {
	story := `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Mover","viewBox":"0 0 360 250","steps":[
 {"title":"Uno","narrator":"Uno.","equation":{"atoms":[{"t":"a","id":"a"}]},"stage":{"scene":{"actors":[{"id":"a","x":40,"y":120,"w":44,"h":40,"label":"a","tone":"blue"}]}}},
 {"title":"Dos","narrator":"Dos.","equation":{"atoms":[{"t":"b","id":"b"}]},"stage":{"scene":{"actors":[{"id":"a","x":40,"y":120,"w":44,"h":40,"label":"a","tone":"blue"},{"id":"b","x":200,"y":120,"w":44,"h":40,"label":"b","tone":"green"}],"moves":[{"from":"a","to":"b","verb":"pasa"}]}}},
 {"title":"Tres","narrator":"Tres.","equation":{"atoms":[{"t":"c","id":"c"}]},"stage":{"scene":{"actors":[{"id":"b","x":200,"y":120,"w":44,"h":40,"label":"b","tone":"green"}],"marks":[{"kind":"ok","actor":"b"}]}}}
]}
</script>
</lk-story>`
	_, problems := storyProgressiveProblems(story)
	for _, p := range problems {
		if strings.Contains(p, "draws no move") {
			t.Fatalf("a derivation step that draws a move and a mark in its stage was refused: %s", p)
		}
	}
}

// The ownership example the kit ships is a derivation story: the engine must
// accept it as it is, or the example would teach a shape the engine refuses.
func TestShippedStoryExamplesPassTheProgressiveRule(t *testing.T) {
	for _, name := range []string{"propiedad-rust.md", "derivacion-x.md", "formula-gaussiana.md", "prestamos-rust.md", "sql-join-videojuegos.md", "sql-venn-joins.md"} {
		raw, err := os.ReadFile("../../integrations/pi/kit/examples/" + name)
		if err != nil {
			t.Fatal(err)
		}
		_, problems := storyProgressiveProblems(string(raw))
		if len(problems) > 0 {
			t.Errorf("%s: %s", name, strings.Join(problems, "; "))
		}
	}
}
