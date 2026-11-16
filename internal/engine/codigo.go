package engine

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"learning/internal/rules"
)

// sqlWords are the SQL and PL/SQL words a question's prose does not use on its own. Three of them run into one line
// of a stem or an option only when code was flattened there (#332). Words that Spanish prose also uses (cursor, as, is,
// on, in) stay out, so a sentence about a clause is not mistaken for a statement.
var sqlWords = map[string]bool{
	"select": true, "from": true, "where": true, "insert": true, "into": true, "values": true, "update": true,
	"delete": true, "create": true, "replace": true, "drop": true, "alter": true, "join": true, "having": true,
	"commit": true, "rollback": true, "package": true, "procedure": true, "function": true, "body": true,
	"begin": true, "declare": true, "exception": true, "loop": true, "elsif": true, "return": true, "end": true,
}

// wordPattern reads the words of a line; byClausePattern reads GROUP BY and ORDER BY, which are two words.
var (
	wordPattern     = regexp.MustCompile(`[A-Za-z_]+`)
	byClausePattern = regexp.MustCompile(`(?i)\b(?:group|order)\s+by\b`)
	// codeSignal is what a statement looks like written without a fence: a call with no space before its
	// parenthesis, an assignment, an arrow or a comparison that prose does not write.
	codeSignal = regexp.MustCompile(`[A-Za-z_]\(|:=|=>|==|!=|<=|>=`)
)

// codeInProse names the code a question text carries flattened into prose, outside a fence, or "" when it carries none.
// A fence is the sanctioned carrier: its lines are never read. Two signals name flattened code: two or more statements
// on one line (a statement that uses a keyword or writes a call, an assignment or an operator, followed by another
// one), or three SQL and PL/SQL keywords in one run of prose.
func codeInProse(text string) string {
	prose := proseOutsideFences(text)
	for _, line := range strings.Split(prose, "\n") {
		if n := codeStatements(line); n >= 2 {
			return fmt.Sprintf("%d statements run into one line", n)
		}
	}
	if hits := sqlHits(prose); len(hits) >= 3 {
		return "the SQL and PL/SQL keywords " + strings.Join(hits, ", ") + " run into the prose"
	}
	return ""
}

// checkCodeInProse refuses a question whose stem or option carries code flattened into prose. The rule applies only
// where the rules declare it: a frozen snapshot never declared it, so the questions it accepted stay accepted.
func checkCodeInProse(id string, th rules.Thresholds, texts ...string) error {
	if !th.CodigoEnLinea {
		return nil
	}
	for _, text := range texts {
		if reason := codeInProse(text); reason != "" {
			return fmt.Errorf("codigo-en-linea: question %s carries code flattened into prose (%s); write the code as a fenced block with its language or as pieza codigo", id, reason)
		}
	}
	return nil
}

// finalCodeInProse applies the code-in-prose rule to the final questionnaire's stems.
func finalCodeInProse(qs []finalQuestion, th rules.Thresholds) error {
	for _, q := range qs {
		if err := checkCodeInProse(q.ID, th, q.Enunciado); err != nil {
			return err
		}
	}
	return nil
}

// questionTexts is the stem and then the options of a question, in the order the learner reads them.
func questionTexts(stem string, options map[string]string) []string {
	keys := make([]string, 0, len(options))
	for key := range options {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	texts := []string{stem}
	for _, key := range keys {
		texts = append(texts, options[key])
	}
	return texts
}

// proseOutsideFences keeps the lines a fence does not hold. A fence opens on a line that starts with three backticks or
// tildes and closes on a line of the same marker, at least as long; a fence left open runs to the end of the text.
func proseOutsideFences(text string) string {
	var kept []string
	var open string
	for _, line := range strings.Split(text, "\n") {
		trimmed := strings.TrimSpace(line)
		if open == "" {
			if marker := fenceOpening(trimmed); marker != "" {
				open = marker
				continue
			}
			kept = append(kept, line)
			continue
		}
		if closesFence(trimmed, open) {
			open = ""
		}
	}
	return strings.Join(kept, "\n")
}

// fenceOpening returns the marker of a line that opens a fence, or "" when the line opens none.
func fenceOpening(trimmed string) string {
	for _, char := range []string{"`", "~"} {
		run := strings.Repeat(char, 3)
		if strings.HasPrefix(trimmed, run) {
			return strings.Repeat(char, len(trimmed)-len(strings.TrimLeft(trimmed, char)))
		}
	}
	return ""
}

// closesFence reports whether a trimmed line closes the fence opened with marker.
func closesFence(trimmed, marker string) bool {
	return len(trimmed) >= len(marker) && strings.Trim(trimmed, marker[:1]) == ""
}

// codeStatements counts the `;`-separated statements of a line that read as code.
func codeStatements(line string) int {
	count := 0
	for _, part := range strings.Split(line, ";") {
		statement := strings.TrimSpace(part)
		if statement == "" {
			continue
		}
		if codeSignal.MatchString(statement) || len(sqlHits(statement)) > 0 {
			count++
		}
	}
	return count
}

// sqlHits lists the SQL and PL/SQL keywords of a text, in order, whatever their case.
func sqlHits(text string) []string {
	var hits []string
	for _, word := range wordPattern.FindAllString(text, -1) {
		if lower := strings.ToLower(word); sqlWords[lower] {
			hits = append(hits, strings.ToUpper(lower))
		}
	}
	for _, clause := range byClausePattern.FindAllString(text, -1) {
		hits = append(hits, strings.ToUpper(strings.Join(strings.Fields(clause), " ")))
	}
	return hits
}
