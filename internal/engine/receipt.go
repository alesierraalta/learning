package engine

import (
	"fmt"
	"os"
	"strings"

	"learning/internal/rules"
)

// A shared learner note has independently mutable areas. Bind planning to
// its skeleton and each submission to its own area, not to other responses.
func receiptHash(r *rules.Rules, ws, rel, stage, part string) (string, error) {
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
