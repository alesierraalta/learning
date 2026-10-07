package engine

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

// A command interrupted while it holds the workspace lock (the Pi adapter's
// execFile timeout sends SIGTERM; Ctrl-C sends SIGINT) must release the lock
// and leave state.json intact, so the next command is not blocked for
// lockStaleAfter.
func TestSignalReleasesWorkspaceLock(t *testing.T) {
	cases := []struct {
		name string
		sig  syscall.Signal
		code int
	}{
		{"SIGTERM", syscall.SIGTERM, 143},
		{"SIGINT", syscall.SIGINT, 130},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := readyForExplanation(t)
			f.reviewPending(t, "explanation")
			before := f.tryReadState(t)

			cmd := exec.Command(os.Args[0], "-test.run=^TestSignalHelperProcess$")
			cmd.Env = append(os.Environ(),
				"LEARNING_SIGNAL_HELPER=1",
				"LEARNING_HELPER_ROOT="+f.root,
				"LEARNING_HELPER_WS="+f.ws)
			stdout, err := cmd.StdoutPipe()
			if err != nil {
				t.Fatal(err)
			}
			if err := cmd.Start(); err != nil {
				t.Fatal(err)
			}
			locked := make(chan bool, 1)
			go func() {
				sc := bufio.NewScanner(stdout)
				for sc.Scan() {
					if strings.TrimSpace(sc.Text()) == "locked" {
						locked <- true
						return
					}
				}
				if err := sc.Err(); err != nil {
					t.Errorf("read helper stdout: %v", err)
				}
				locked <- false
			}()
			select {
			case ok := <-locked:
				if !ok {
					t.Fatal("helper exited before acquiring the lock")
				}
			case <-time.After(20 * time.Second):
				_ = cmd.Process.Kill()
				t.Fatal("helper never acquired the lock")
			}
			if err := cmd.Process.Signal(tc.sig); err != nil {
				t.Fatal(err)
			}
			err = cmd.Wait()
			var exit *exec.ExitError
			if !errors.As(err, &exit) || exit.ExitCode() != tc.code {
				t.Fatalf("interrupted command: wait err = %v, want exit code %d", err, tc.code)
			}
			if _, err := os.Stat(filepath.Join(f.ws, ".learning", "lock")); !os.IsNotExist(err) {
				t.Fatalf("lock must be released after %s, stat err = %v", tc.name, err)
			}
			if string(f.tryReadState(t)) != string(before) {
				t.Fatal("interrupted command changed state")
			}
			f.advanceOK(t, "explanation")
		})
	}
}

// Every lock the process holds is released on a signal, not only the one
// whose guard happens to run first.
func TestSignalReleasesEveryHeldLock(t *testing.T) {
	a, b := newFixture(t), newFixture(t)
	cmd := exec.Command(os.Args[0], "-test.run=^TestSignalTwoLocksHelper$")
	cmd.Env = append(os.Environ(), "LEARNING_SIGNAL_HELPER=1",
		"LEARNING_HELPER_WS_A="+a.ws, "LEARNING_HELPER_WS_B="+b.ws)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	sc := bufio.NewScanner(stdout)
	for sc.Scan() && strings.TrimSpace(sc.Text()) != "locked" {
	}
	if err := sc.Err(); err != nil {
		t.Fatalf("read helper stdout: %v", err)
	}
	if err := cmd.Process.Signal(syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	err = cmd.Wait()
	var exit *exec.ExitError
	if !errors.As(err, &exit) || exit.ExitCode() != 143 {
		t.Fatalf("wait err = %v, want exit code 143", err)
	}
	for _, ws := range []string{a.ws, b.ws} {
		if _, err := os.Stat(filepath.Join(ws, ".learning", "lock")); !os.IsNotExist(err) {
			t.Fatalf("lock in %s must be released, stat err = %v", ws, err)
		}
	}
}

// TestSignalTwoLocksHelper holds locks in two workspaces until signaled.
func TestSignalTwoLocksHelper(t *testing.T) {
	if os.Getenv("LEARNING_SIGNAL_HELPER") != "1" || os.Getenv("LEARNING_HELPER_WS_A") == "" {
		t.Skip("helper process only")
	}
	for _, ws := range []string{os.Getenv("LEARNING_HELPER_WS_A"), os.Getenv("LEARNING_HELPER_WS_B")} {
		if _, err := acquireLock(ws); err != nil {
			t.Fatal(err)
		}
	}
	fmt.Println("locked")
	time.Sleep(time.Minute)
}

// TestSignalHelperProcess is the child process of TestSignalReleasesWorkspaceLock:
// it runs advance and parks while holding the lock until it is signaled.
func TestSignalHelperProcess(t *testing.T) {
	if os.Getenv("LEARNING_SIGNAL_HELPER") != "1" || os.Getenv("LEARNING_HELPER_WS") == "" {
		t.Skip("helper process only")
	}
	lockAcquiredHook = func() {
		fmt.Println("locked")
		time.Sleep(time.Minute)
	}
	Run(Options{
		Command:   "advance",
		Root:      os.Getenv("LEARNING_HELPER_ROOT"),
		Workspace: os.Getenv("LEARNING_HELPER_WS"),
		RulesPath: repoRulesPath,
		Mode:      "deep",
		Stage:     "explanation",
	})
}
