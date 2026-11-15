package engine

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// markdownEnHTMLPage wraps a body in the page the tutor writes beside a part's note.
func markdownEnHTMLPage(body string) string {
	return "<!doctype html>\n<html lang=\"es\">\n<head><title>Parte</title></head>\n<body>\n" + body + "\n</body>\n</html>\n"
}

// The pages the rule measures and the verdict each one gets: true when the page is refused (#323).
var markdownEnHTMLCases = []struct {
	name string
	body string
	want bool
}{
	{"fence outside code", "<p>Para x = 184 ms, la distancia al centro:</p>\n\n```text\nz = (x - μ) / σ\nz = 2\n```", true},
	{"fence inside pre and code", "<pre><code>```text\nz = 2\n```</code></pre>\n<p>Usa <code>```</code> para abrir un bloque.</p>", false},
	{"fence inside a script", "<script>const cerca = \"```\";</script>", false},
	{"display math outside code", "<p>$$f(x) = x^2$$</p>", true},
	{"heading and list markers at line start", "## Ruta\n- primera idea\n1. segunda idea", true},
	{"hash without a space and list tags", "<p>#1 en la lista</p>\n<ul>\n<li>uno</li>\n</ul>\n<p>Precio: 3 - 2 = 1</p>", false},
	{"star selector inside a style", "<style>\n* { box-sizing: border-box; }\n</style>\n<p>Texto.</p>", false},
}

func TestMarkdownEnHTMLRefusesRawMarkdownOutsideCode(t *testing.T) {
	for _, c := range markdownEnHTMLCases {
		t.Run(c.name, func(t *testing.T) {
			refused := len(markdownEnHTMLFindings(markdownEnHTMLPage(c.body))) > 0
			if refused != c.want {
				t.Fatalf("refused = %v, want %v, for %q", refused, c.want, c.body)
			}
		})
	}
}

// The engine and the tutor's tool give the same verdict on the same page: explain-check's `markdown-en-html` row
// and the engine's findings must agree on every case above.
func TestMarkdownEnHTMLAgreesWithExplainCheck(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed: the tool cannot be run here")
	}
	tool, err := filepath.Abs("../../tools/explain-check.mjs")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(tool); err != nil {
		t.Skipf("explain-check.mjs is not here: %v", err)
	}
	for _, c := range markdownEnHTMLCases {
		path := filepath.Join(t.TempDir(), "pagina.html")
		if err := os.WriteFile(path, []byte(markdownEnHTMLPage(c.body)), 0o644); err != nil {
			t.Fatal(err)
		}
		// The tool exits 1 when a rule fails; the JSON it prints is what is compared.
		out, _ := exec.Command(node, tool, path, "--json").Output()
		var report struct {
			Rows []struct {
				Rule string `json:"rule"`
				Ok   bool   `json:"ok"`
			} `json:"rows"`
		}
		if err := json.Unmarshal(out, &report); err != nil {
			t.Fatalf("explain-check printed no JSON for %q: %v\n%s", c.name, err, out)
		}
		toolRefused, found := false, false
		for _, row := range report.Rows {
			if row.Rule == "markdown-en-html" {
				toolRefused, found = !row.Ok, true
			}
		}
		if !found {
			t.Fatalf("%s: explain-check has no markdown-en-html row", c.name)
		}
		if engineRefused := len(markdownEnHTMLFindings(markdownEnHTMLPage(c.body))) > 0; toolRefused != engineRefused {
			t.Fatalf("%s: explain-check refused=%v and the engine refused=%v", c.name, toolRefused, engineRefused)
		}
	}
}
