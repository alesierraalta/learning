package engine

import (
	"fmt"

	"learning/internal/rules"
)

// sinResumenFindings refuses a closing summary: the standard ends a part on its last
// content section.
func sinResumenFindings(text string, _ rules.PartStandardThresholds) []string {
	if m := closingSummary.FindStringSubmatch(text); m != nil {
		return []string{fmt.Sprintf(
			"closes with a %q summary, which the standard forbids — end the part on its last content section",
			m[1])}
	}
	return nil
}
