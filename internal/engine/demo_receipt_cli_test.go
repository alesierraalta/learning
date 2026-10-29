package engine

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestDemoPageReceiptAndJavaScriptMIME(t *testing.T) {
	bin := buildCLI(t)
	setup := func(t *testing.T) (*fixture, cliRunner) {
		t.Helper()
		f := newFixture(t)
		c := cliRunner{t: t, bin: bin, f: f}
		p := partCfg{id: "p1", ex: true, vis: false, title: "Replicación"}
		c.ok("init", "", "accepted")
		f.writePlan(t, p)
		f.setDemosPlanned(t, "p1", true)
		c.ok("advance", "preparation", "accepted")
		f.writeDiagQuestions(t, buildDiagQuestions(6, 6, defaultParts()...))
		f.writeDiagAnswersFor(t, defaultParts(), 2, 6)
		c.ok("advance", "diagnosis", "accepted")
		f.writePlanWith(t, "Dificultades detectadas en consenso y en quórums.", []string{"d3"}, p)
		f.setDemosPlanned(t, "p1", true)
		c.ok("advance", "planning", "accepted")
		f.writeExplanationWithDemo(t, "p1", "Texto sin demo.")
		return f, c
	}
	run := func(t *testing.T, c cliRunner, command, stage, status string, exit int, check string) Report {
		t.Helper()
		args := []string{command, "--root", c.f.root, "--workspace", c.f.ws, "--rules", repoRulesPath, "--mode", "deep", "--json"}
		if stage != "" {
			args = append(args, "--stage", stage)
		}
		cmd := exec.Command(c.bin, args...)
		var out, errout bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &errout
		err := cmd.Run()
		got := 0
		if err != nil {
			e, ok := err.(*exec.ExitError)
			if !ok {
				t.Fatal(err)
			}
			got = e.ExitCode()
		}
		if got != exit || errout.String() != "" {
			t.Fatalf("%s exit=%d stderr=%q stdout=%s", command, got, errout.String(), out.String())
		}
		var rep Report
		dec := json.NewDecoder(&out)
		if err := dec.Decode(&rep); err != nil {
			t.Fatal(err)
		}
		var extra any
		if err := dec.Decode(&extra); err != io.EOF {
			t.Fatalf("extra stdout: %v", err)
		}
		if rep.Status != status {
			t.Fatalf("%s status=%q want %q checks=%+v", command, rep.Status, status, rep.Checks)
		}
		if check != "" {
			ch, ok := hasCheck(rep, check)
			if !ok || ch.Status != "FAIL" {
				t.Fatalf("%s: missing FAIL %s: %+v", command, check, rep.Checks)
			}
		}
		return rep
	}
	t.Run("mime", func(t *testing.T) {
		f, c := setup(t)
		path := "explicaciones/apps/p1.html"
		for _, tc := range []struct {
			name, script string
			valid        bool
		}{
			{"ld-json", `<script type="application/ld+json">{}</script>`, false},
			{"json", `<script type="application/json">{}</script>`, false},
			{"plain", `<script>let x = 1</script>`, true},
			{"javascript", `<script type="text/javascript">let x = 1</script>`, true},
			{"module", `<script type="module">let x = 1</script>`, true},
			{"src", `<script src="app.js"></script>`, true},
		} {
			t.Run(tc.name, func(t *testing.T) {
				f.write(t, path, "<button>Next</button>"+tc.script)
				before := f.tryReadState(t)
				if tc.valid {
					run(t, c, "validate", "explanation", "accepted", 0, "")
				} else {
					run(t, c, "validate", "explanation", "blocked", 1, "demo-part")
					run(t, c, "advance", "explanation", "blocked", 1, "demo-part")
				}
				if !bytes.Equal(before, f.tryReadState(t)) {
					t.Fatal("validation or rejected advance changed state")
				}
			})
		}
	})
	for _, path := range []string{"explicaciones/apps/p1.html", "explicaciones/demos/p1-z-interactive.html"} {
		for _, mutation := range []string{"replace", "delete"} {
			t.Run(path+"/"+mutation, func(t *testing.T) {
				f, c := setup(t)
				f.write(t, path, `<button>Next</button><script>let x = 1</script>`)
				run(t, c, "validate", "explanation", "accepted", 0, "")
				c.ok("advance", "explanation", "accepted")
				before := f.tryReadState(t)
				if !strings.Contains(string(before), path) {
					t.Errorf("receipt does not contain selected page %s", path)
				}
				if mutation == "delete" {
					if err := os.Remove(filepath.Join(f.ws, path)); err != nil {
						t.Fatal(err)
					}
				} else {
					f.write(t, path, "<svg><rect/></svg>")
				}
				for _, cmd := range []string{"status", "validate", "advance"} {
					stage := ""
					if cmd != "status" {
						stage = "own_words"
					}
					run(t, c, cmd, stage, "blocked", 1, "receipts-fresh")
					if !bytes.Equal(before, f.tryReadState(t)) {
						t.Fatal("rejected operation changed state")
					}
				}
			})
		}
	}
}
