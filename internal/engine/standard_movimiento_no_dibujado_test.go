package engine

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"learning/internal/rules"
)

// bench286 returns one of the notes the fifth bench run left behind (#286), the
// part as the tutor wrote it: four of the five write the move as
// `{"actor":"cli","toX":80,"toY":150}`.
func bench286(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "integrations", "pi", "kit", "test", "fixtures", "bench286", name))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// storyWithMove builds a one-step derivation whose scene is the one given.
func storyWithMove(scene string) string {
	return "<lk-story>\n<script type=\"application/json\">\n" +
		`{"kind":"derivation","title":"Un movimiento","steps":[{"title":"Uno","narrator":"Algo viaja.","stage":{"scene":` + scene + `}}]}` +
		"\n</script>\n</lk-story>\n"
}

const moveActors = `"actors":[{"id":"cli","kind":"packet","x":80,"y":150,"size":56},{"id":"srv","kind":"server","x":250,"y":150,"size":56}]`

// The move the tutor writes is drawn: the engine reads the same two shapes the
// drawing reads, so a move that names its pieces — or an actor and a point — is
// not a finding.
func TestMoveUndrawnAcceptsBothShapes(t *testing.T) {
	th := rules.PartStandardThresholds{StoryMoveDrawable: true}
	if findings := moveUndrawnFindings(bench286(t, "bayes-theorem.md"), th); len(findings) != 0 {
		t.Fatalf("the engine refuses the canonical from/to move the kit draws: %v", findings)
	}
	point := storyWithMove(`{` + moveActors + `,"moves":[{"actor":"cli","toX":222,"toY":150,"verb":"SYN"}]}`)
	if findings := moveUndrawnFindings(point, th); len(findings) != 0 {
		t.Fatalf("the engine refuses an actor-to-point move the kit draws: %v", findings)
	}
	canonical := storyWithMove(`{` + moveActors + `,"moves":[{"from":"cli","to":"srv","verb":"SYN"}]}`)
	if findings := moveUndrawnFindings(canonical, th); len(findings) != 0 {
		t.Fatalf("the engine refuses a canonical move: %v", findings)
	}
}

// The structural half: the four defects the engine can read from the note are the
// four that leave the drawing without an origin or a destination. The geometric
// half —a target where the actor already is, a stroke of 0 units— needs the boxes
// the browser drew, so `scene-lint` measures it and the engine does not guess.
func TestMoveUndrawnRefusesEachStructuralDefect(t *testing.T) {
	th := rules.PartStandardThresholds{StoryMoveDrawable: true}
	for _, tc := range []struct {
		name  string
		move  string
		wants string
	}{
		{"no origin", `{"toX":222,"toY":150}`, "no nombra de dónde sale"},
		{"unknown origin", `{"actor":"nadie","toX":222,"toY":150}`, "que el paso no tiene"},
		{"no destination", `{"actor":"cli"}`, "no nombra a dónde llega"},
		{"unknown destination", `{"from":"cli","to":"nadie"}`, "llega a «nadie»"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			findings := moveUndrawnFindings(storyWithMove(`{`+moveActors+`,"moves":[`+tc.move+`]}`), th)
			if len(findings) == 0 {
				t.Fatalf("the engine accepts a move with %s", tc.name)
			}
			if !strings.Contains(findings[0], tc.wants) {
				t.Fatalf("the refusal %q does not name %q", findings[0], tc.wants)
			}
			if !strings.Contains(findings[0], "el paso 1") {
				t.Fatalf("the refusal %q does not name the step", findings[0])
			}
		})
	}
}

// The notes of the fifth bench run declare their move with the actor's own
// coordinates: the geometry is undrawable, but the shape and its pieces resolve,
// so the engine — the structural half — accepts them and `scene-lint` refuses the
// drawing. This is the division the issue asks for, stated where it can be read.
func TestMoveUndrawnLeavesTheGeometryToTheDrawing(t *testing.T) {
	th := rules.PartStandardThresholds{StoryMoveDrawable: true}
	for _, name := range []string{"git-branching.md", "tcp-handshake.md", "rust-borrowing.md", "css-flexbox.md"} {
		if findings := moveUndrawnFindings(bench286(t, name), th); len(findings) != 0 {
			t.Fatalf("%s: the engine claims a geometry finding it cannot measure: %v", name, findings)
		}
	}
}

// A frozen snapshot that does not declare the key keeps accepting the parts it
// accepted: the key is additive, like every rule before it.
func TestMoveUndrawnIsAdditive(t *testing.T) {
	note := storyWithMove(`{` + moveActors + `,"moves":[{"actor":"nadie","toX":222,"toY":150}]}`)
	if findings := moveUndrawnFindings(note, rules.PartStandardThresholds{}); len(findings) != 0 {
		t.Fatalf("a snapshot without the key applied the rule: %v", findings)
	}
	raw, err := os.ReadFile(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"storyMoveDrawable": true`) {
		t.Fatal("the production rules do not declare storyMoveDrawable")
	}
}
