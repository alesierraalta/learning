package engine

import (
	"encoding/json"
	"fmt"
	"strconv"

	"learning/internal/rules"
)

// storyMove is one movement a step declares. Two shapes mean the same thing
// (#286): the canonical `from`/`to` names the two pieces, and the one the tutor
// writes names an actor and a target point (`actor`/`toX`/`toY`). The drawing
// accepts both; this rule reads both.
type storyMove struct {
	From  string   `json:"from"`
	To    string   `json:"to"`
	Actor string   `json:"actor"`
	ToX   *float64 `json:"toX"`
	ToY   *float64 `json:"toY"`
}

// storyMoveScene is the scene of a step as the structural half of the rule reads
// it: the pieces a move may name and the moves themselves.
type storyMoveScene struct {
	Actors   []storyMovePiece `json:"actors"`
	Props    []storyMovePiece `json:"props"`
	Boxes    []storyMovePiece `json:"boxes"`
	Labels   []storyMovePiece `json:"labels"`
	Icons    []storyMovePiece `json:"icons"`
	Callouts []struct {
		N int `json:"n"`
	} `json:"callouts"`
	Moves []storyMove `json:"moves"`
}

// storyMovePiece is the part of a drawn piece the rule reads: the id a move names.
type storyMovePiece struct {
	ID string `json:"id"`
}

// origin returns the piece the move leaves from, whichever shape it declares.
func (m storyMove) origin() string {
	if m.From != "" {
		return m.From
	}
	return m.Actor
}

// hasPoint reports whether the move names a target point. A move that names a
// piece (`to`) may also carry one; the piece wins, as it does in the drawing.
func (m storyMove) hasPoint() bool { return m.ToX != nil && m.ToY != nil }

// moveUndrawnFindings measures the structural half of `movimiento-no-dibujado`
// (#286): a step that declares a move whose shape the drawing cannot resolve — no
// origin, an origin or a destination the step does not have, or no destination at
// all. The geometric half (a target where the actor already is, a stroke of 0
// units) needs the boxes the browser drew, so `scene-lint` measures it; both
// refuse the same step. A rules snapshot that does not declare
// `storyMoveDrawable` keeps accepting the parts it accepted.
func moveUndrawnFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.StoryMoveDrawable {
		return nil
	}
	var out []string
	for _, doc := range storyRawDocs(text) {
		for i, step := range doc.Steps {
			_, scene, _ := storyStageOf(step)
			var s storyMoveScene
			if raw, err := json.Marshal(scene); err != nil || json.Unmarshal(raw, &s) != nil {
				continue
			}
			if len(s.Moves) == 0 {
				continue
			}
			ids := s.pieceIDs()
			where := fmt.Sprintf("el paso %d", i+1)
			for _, mv := range s.Moves {
				out = append(out, mv.undrawn(where, ids)...)
			}
		}
	}
	return out
}

// pieceIDs returns the ids a move may name. The list is the one the drawing
// resolves an id against: actors, boxes, labels, icons, props and callouts.
func (s storyMoveScene) pieceIDs() map[string]bool {
	ids := map[string]bool{}
	note := func(pieces []storyMovePiece) {
		for _, p := range pieces {
			if p.ID != "" {
				ids[p.ID] = true
			}
		}
	}
	note(s.Actors)
	note(s.Props)
	note(s.Boxes)
	note(s.Labels)
	note(s.Icons)
	for _, c := range s.Callouts {
		ids[strconv.Itoa(c.N)] = true
	}
	return ids
}

// undrawn returns the structural findings of one move, or nil when the drawing
// can resolve it.
func (m storyMove) undrawn(where string, ids map[string]bool) []string {
	const fix = "nombra un actor, una caja o una pieza que el paso dibuje"
	from := m.origin()
	if from == "" {
		return []string{fmt.Sprintf("un movimiento del %s no nombra de dónde sale: escribe `{\"from\":\"a\",\"to\":\"b\"}` o `{\"actor\":\"a\",\"toX\":…,\"toY\":…}`", where)}
	}
	if !ids[from] {
		return []string{fmt.Sprintf("un movimiento del %s sale de «%s», que el paso no tiene: %s", where, from, fix)}
	}
	if m.To == "" && !m.hasPoint() {
		return []string{fmt.Sprintf("un movimiento del %s no nombra a dónde llega: escribe `to` (una pieza) o `toX`/`toY` (un punto)", where)}
	}
	if m.To != "" && !ids[m.To] {
		return []string{fmt.Sprintf("un movimiento del %s llega a «%s», que el paso no tiene: %s", where, m.To, fix)}
	}
	return nil
}
