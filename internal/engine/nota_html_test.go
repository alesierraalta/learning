package engine

import (
	"os"
	"path/filepath"
	"testing"
)

// The translation of a page into its note is one contract with tools/register/nota-html.mjs (#265): both must
// reproduce the same golden files, so the studio and the engine measure a page the same way.
const bench265Golden = "../../tools/register/fixtures/bench265/golden"

func TestNotaDeHTMLMatchesTheGolden(t *testing.T) {
	cases := map[string]string{
		"bench-tcp-handshake": "../../tools/register/fixtures/bench265/paginas/tcp-handshake.html",
		"clean-tcp-handshake": "../../tools/register/fixtures/bench265/clean/tcp-handshake.html",
	}
	for name, page := range cases {
		raw, err := os.ReadFile(page)
		if err != nil {
			t.Fatal(err)
		}
		want, err := os.ReadFile(filepath.Join(bench265Golden, name+".nota.md"))
		if err != nil {
			t.Fatal(err)
		}
		if got := notaDeHTML(string(raw)); got != string(want) {
			t.Fatalf("%s: the Go translation differs from the golden the JS translation writes; got:\n%s", name, got)
		}
	}
}
