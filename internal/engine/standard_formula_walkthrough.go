package engine

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"

	"learning/internal/rules"
)

// sceneFormulaDoc is the part of a scene payload the legend reads: the formulas
// a scene draws, one atom per symbol. A walkthrough carries one scene per step,
// so the steps are read like the scene of a still figure. A formula walkthrough
// (`<lk-story kind="formula">`) carries the formula in its header and the
// equation in each step, so those atoms are read too.
type sceneFormulaDoc struct {
	Scene   *sceneFormulaNode  `json:"scene"`
	Formula *sceneFormulaAtoms `json:"formula"`
	Steps   []sceneFormulaStep `json:"steps"`
}

type sceneFormulaStep struct {
	Scene    *sceneFormulaNode  `json:"scene"`
	Stage    *storyStage        `json:"stage"`
	Equation *sceneFormulaAtoms `json:"equation"`
	Header   *sceneFormulaAtoms `json:"header"`
}

// storyStage is the stage a story step draws: the scene vocabulary under it.
type storyStage struct {
	Scene *sceneFormulaNode `json:"scene"`
}

// storyDoc is the payload of a formula or derivation walkthrough.
type storyDoc struct {
	Kind    string             `json:"kind"`
	Formula *sceneFormulaAtoms `json:"formula"`
	Steps   []sceneFormulaStep `json:"steps"`
}

type sceneFormulaNode struct {
	Formulas []sceneFormulaAtoms `json:"formulas"`
	Formula  *sceneFormulaAtoms  `json:"formula"`
}

type sceneFormulaAtoms struct {
	Atoms []struct {
		T string `json:"t"`
	} `json:"atoms"`
}

// collect appends every formula the node draws, in the order it draws them.
func (n *sceneFormulaNode) collect(bodies *[]string) {
	if n == nil {
		return
	}
	for _, f := range append([]sceneFormulaAtoms{}, n.Formulas...) {
		*bodies = append(*bodies, f.body())
	}
	if n.Formula != nil {
		*bodies = append(*bodies, n.Formula.body())
	}
}

// collectStep appends the formulas a step carries: the scene it draws, its
// stage, and the equation or header of a formula walkthrough.
func (s sceneFormulaStep) collectStep(bodies *[]string) {
	s.Scene.collect(bodies)
	if s.Stage != nil {
		s.Stage.Scene.collect(bodies)
	}
	if s.Equation != nil {
		*bodies = append(*bodies, s.Equation.body())
	}
	if s.Header != nil {
		*bodies = append(*bodies, s.Header.body())
	}
}

// body is the formula as the reader sees it: the atoms, joined.
func (f sceneFormulaAtoms) body() string {
	var b strings.Builder
	for _, atom := range f.Atoms {
		b.WriteString(atom.T)
	}
	return b.String()
}

// sceneFormulaBodies returns the formulas a part draws inside its scenes. An
// annotated formula is drawn symbol by symbol, one atom per symbol, so the atoms
// are the formula and the scene's callouts are its legend. A formula drawn in a
// scene is a formula the reader has to read, exactly like an `<lk-math>` block.
func sceneFormulaBodies(text string) []string {
	var bodies []string
	for _, block := range sceneFormulaBlocks(text) {
		payload, ok := jsonPayload(block)
		if !ok {
			continue
		}
		var doc sceneFormulaDoc
		if json.Unmarshal([]byte(payload), &doc) != nil {
			continue
		}
		doc.Scene.collect(&bodies)
		if doc.Formula != nil {
			bodies = append(bodies, doc.Formula.body())
		}
		for _, step := range doc.Steps {
			step.collectStep(&bodies)
		}
	}
	return bodies
}

// formulaWalkthroughFindings measures the formula rule: the first formula a part
// explains is taught by a formula walkthrough, not by a bare `<lk-math>` or a
// still scene. The first formula is the earliest one in reading order among the
// `<lk-math>` blocks, the plain LaTeX and the formulas a scene or a deck draws;
// the fix names the deck the tutor has to write. A rules snapshot that does not
// declare `formulaWalkthrough` keeps accepting the parts it accepted.
func formulaWalkthroughFindings(text string, th rules.PartStandardThresholds) []string {
	if !th.FormulaWalkthrough {
		return nil
	}
	plain := withoutCodeFences(text)
	type spot struct{ at int }
	var spots []spot
	for _, m := range mathBlock.FindAllStringIndex(plain, -1) {
		spots = append(spots, spot{m[0]})
	}
	for _, m := range mathDisplay.FindAllStringIndex(plain, -1) {
		spots = append(spots, spot{m[0]})
	}
	rest := mathDisplay.ReplaceAllString(plain, " ")
	for _, m := range mathInline.FindAllStringSubmatchIndex(rest, -1) {
		body := rest[m[2]:m[3]]
		if !mathInlineLooksLikeMath.MatchString(body) && strings.ContainsAny(body, " \t") {
			continue
		}
		spots = append(spots, spot{m[0]})
	}
	var taught [][2]int
	for _, re := range []*regexp.Regexp{sceneBlock, walkthroughBlock, storyBlock} {
		for _, m := range re.FindAllStringIndex(plain, -1) {
			block := plain[m[0]:m[1]]
			payload, ok := jsonPayload(block)
			if !ok {
				continue
			}
			var doc sceneFormulaDoc
			if json.Unmarshal([]byte(payload), &doc) != nil {
				continue
			}
			if len(sceneFormulaBodies(block)) == 0 {
				continue
			}
			spots = append(spots, spot{m[0]})
			var story storyDoc
			if json.Unmarshal([]byte(payload), &story) == nil && (story.Kind == "formula" || story.Kind == "derivation") {
				taught = append(taught, [2]int{m[0], m[1]})
			}
		}
	}
	if len(spots) == 0 {
		return nil
	}
	sort.Slice(spots, func(i, j int) bool { return spots[i].at < spots[j].at })
	first := spots[0].at
	for _, r := range taught {
		if first >= r[0] && first < r[1] {
			return nil
		}
	}
	return []string{"the first formula in the part is not taught by a formula walkthrough — draw it as <lk-story kind=\"formula\">: step 1 the whole formula, then one step per symbol with what it is, what it is used for and its value in the example, and the last step with the example's numbers substituted and its result"}
}
