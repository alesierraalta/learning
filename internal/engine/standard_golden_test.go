package engine

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"learning/internal/rules"
)

// TestStandardGoldenRecord prints one digest per note of the golden corpus: the
// engine's report over the note, in evalPartStandard's order (the standard
// findings, then the register, the glossary and the quiz). It runs only when
// STANDARD_GOLDEN_FILES lists the notes, one absolute path per line, so the suite
// skips it. A refactor of the standard rules is byte-identical when the lines
// printed before and after it are the same:
//
//	STANDARD_GOLDEN_FILES="$files" go test -count=1 -run TestStandardGoldenRecord -v ./internal/engine | grep ^GOLDEN
func TestStandardGoldenRecord(t *testing.T) {
	list := os.Getenv("STANDARD_GOLDEN_FILES")
	if list == "" {
		t.Skip("STANDARD_GOLDEN_FILES lists the corpus notes to record")
	}
	r, err := rules.Load(productionRulesPath)
	if err != nil {
		t.Fatal(err)
	}
	th := r.Thresholds.PartStandard
	if th == nil {
		t.Fatal("the production rules declare no explanation standard")
	}
	for _, path := range strings.Split(strings.TrimSpace(list), "\n") {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		text := string(data)
		if ext := strings.ToLower(filepath.Ext(path)); ext == ".html" || ext == ".htm" {
			text = notaDeHTML(text)
		}
		findings := standardFindings(text, *th)
		if th.Register != nil {
			sencillez, tecnicidad := learnerLevels(path)
			findings = append(findings, registerFindings(text, th.Register.Limits(sencillez, tecnicidad))...)
		}
		findings = append(findings, glosarioFindings(text, *th)...)
		findings = append(findings, quizFindings(text, *th, false)...)
		h := sha256.New()
		for _, f := range findings {
			h.Write([]byte(f))
			h.Write([]byte{0})
		}
		fmt.Printf("GOLDEN %x %d %s\n", h.Sum(nil), len(findings), path)
	}
}
