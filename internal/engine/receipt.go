package engine

import (
	"fmt"
	"os"
	"regexp"
	"strings"

	"learning/internal/rules"
)

// A shared learner note has independently mutable areas. Bind planning to
// its skeleton and each submission to its own area, not to other responses.
func receiptHash(r *rules.Rules, ws, rel, stage, part string) (string, error) {
	if stage == "planning" && rel == declPathByKind(r, "planning", "index_note") {
		raw, err := os.ReadFile(absPath(ws, rel))
		if err != nil {
			return "", err
		}
		return hashBytes([]byte(indexSkeleton(string(raw)))), nil
	}
	if rel != "mis-palabras.md" || (stage != "planning" && stage != "own_words") {
		return hashFile(absPath(ws, rel))
	}
	raw, err := os.ReadFile(absPath(ws, rel))
	if err != nil {
		return "", err
	}
	text := string(raw)
	header := r.Thresholds.MisPalabrasHdr
	if stage == "planning" {
		var skeleton strings.Builder
		inArea := false
		for _, line := range strings.Split(text, "\n") {
			if strings.HasPrefix(strings.TrimSpace(line), "## Parte ") {
				inArea = false
			}
			if !inArea {
				skeleton.WriteString(line)
				skeleton.WriteByte('\n')
			}
			if strings.Contains(line, header) {
				inArea = true
			}
		}
		return hashBytes([]byte(skeleton.String())), nil
	}
	submission, err := ownWordsSubmission(r, ws, part)
	if err != nil {
		return "", err
	}
	return hashBytes([]byte(submission)), nil
}

func ownWordsSubmission(r *rules.Rules, ws, part string) (string, error) {
	raw, err := os.ReadFile(absPath(ws, "mis-palabras.md"))
	if err != nil {
		return "", err
	}
	plan, err := loadPlan(ws, declPathByKind(r, "preparation", "file_exists"))
	if err != nil {
		return "", err
	}
	areas := misPalabrasAreas(string(raw), r.Thresholds.MisPalabrasHdr)
	for i, p := range plan.Parts {
		if p.ID == part {
			if i >= len(areas) {
				return "", fmt.Errorf("own-words area missing for part %s", part)
			}
			return strings.TrimSpace(areas[i]), nil
		}
	}
	return "", fmt.Errorf("own-words part %s is absent from plan", part)
}

var (
	indexLink    = regexp.MustCompile(`\[\[[^\]|]*\|([^\]]*)\]\]|\[\[([^\]]*)\]\]`)
	indexMarkers = strings.NewReplacer("✅", "", "🔓", "", "⬜", "")
)

// indexSkeleton binds planning to the index content, not to its progress:
// linking a part once it is written, its status icon and the progreso line
// change as the topic advances.
func indexSkeleton(text string) string {
	var b strings.Builder
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "progreso:") {
			continue
		}
		line = indexLink.ReplaceAllString(line, "$1$2")
		line = strings.Join(strings.Fields(indexMarkers.Replace(line)), " ")
		for _, w := range []string{"pendiente", "abierta", "cerrada"} {
			line = strings.TrimSuffix(line, " — "+w)
		}
		b.WriteString(line)
		b.WriteByte('\n')
	}
	return b.String()
}
