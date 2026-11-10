package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// serveLines drives the stdio loop through an io.Reader/io.Writer seam and
// returns one decoded object per response line.
func serveLines(t *testing.T, lines ...string) []map[string]any {
	t.Helper()
	var out, errOut bytes.Buffer
	code := serveMCP(strings.NewReader(strings.Join(lines, "\n")+"\n"), &out, &errOut)
	if code != 0 {
		t.Fatalf("serveMCP exit = %d, stderr: %s", code, errOut.String())
	}
	var responses []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		if line == "" {
			continue
		}
		var doc map[string]any
		if err := json.Unmarshal([]byte(line), &doc); err != nil {
			t.Fatalf("stdout line is not one JSON object (%v): %q", err, line)
		}
		if doc["jsonrpc"] != "2.0" {
			t.Fatalf("response is not JSON-RPC 2.0: %q", line)
		}
		responses = append(responses, doc)
	}
	return responses
}

func callLine(id int, name string, args map[string]string) string {
	payload := map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"method":  "tools/call",
		"params":  map[string]any{"name": name, "arguments": args},
	}
	b, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return string(b)
}

func rpcErrorCode(t *testing.T, resp map[string]any) int {
	t.Helper()
	body, ok := resp["error"].(map[string]any)
	if !ok {
		t.Fatalf("response has no error object: %v", resp)
	}
	code, ok := body["code"].(float64)
	if !ok {
		t.Fatalf("error has no numeric code: %v", body)
	}
	return int(code)
}

func toolResult(t *testing.T, resp map[string]any) map[string]any {
	t.Helper()
	if _, ok := resp["error"]; ok {
		t.Fatalf("tool call failed at the protocol layer: %v", resp["error"])
	}
	result, ok := resp["result"].(map[string]any)
	if !ok {
		t.Fatalf("response has no result object: %v", resp)
	}
	return result
}

func resultText(t *testing.T, result map[string]any) string {
	t.Helper()
	content, ok := result["content"].([]any)
	if !ok || len(content) == 0 {
		t.Fatalf("result has no content: %v", result)
	}
	first, ok := content[0].(map[string]any)
	if !ok || first["type"] != "text" {
		t.Fatalf("first content block is not text: %v", content[0])
	}
	text, _ := first["text"].(string)
	return text
}

func structured(t *testing.T, result map[string]any) map[string]any {
	t.Helper()
	doc, ok := result["structuredContent"].(map[string]any)
	if !ok {
		t.Fatalf("result has no structuredContent object: %v", result)
	}
	return doc
}

func newMCPWorkspace(t *testing.T) (root, ws string) {
	t.Helper()
	root = filepath.Join(t.TempDir(), "Learnings")
	ws = filepath.Join(root, "topico")
	if err := os.MkdirAll(ws, 0o755); err != nil {
		t.Fatal(err)
	}
	return root, ws
}

func TestMCPInitializeReportsProtocolAndTools(t *testing.T) {
	responses := serveLines(t,
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
	)
	if len(responses) != 1 {
		t.Fatalf("notification must not answer: got %d responses", len(responses))
	}
	if responses[0]["id"].(float64) != 1 {
		t.Fatalf("initialize id not echoed: %v", responses[0])
	}
	result := responses[0]["result"].(map[string]any)
	if result["protocolVersion"] != mcpProtocolVersion {
		t.Fatalf("protocolVersion = %v, want %s", result["protocolVersion"], mcpProtocolVersion)
	}
	capabilities, ok := result["capabilities"].(map[string]any)
	if !ok {
		t.Fatalf("no capabilities object: %v", result)
	}
	if _, ok := capabilities["tools"]; !ok {
		t.Fatalf("capabilities lacks tools: %v", capabilities)
	}
	info := result["serverInfo"].(map[string]any)
	if info["name"] != "learning" {
		t.Fatalf("serverInfo.name = %v", info["name"])
	}
	if version, _ := info["version"].(string); version == "" {
		t.Fatalf("serverInfo.version is empty: %v", info)
	}
}

func TestMCPToolsListNamesFiveToolsWithClosedSchemas(t *testing.T) {
	responses := serveLines(t, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`)
	result := toolResult(t, responses[0])
	list, ok := result["tools"].([]any)
	if !ok {
		t.Fatalf("tools/list has no tools array: %v", result)
	}
	want := map[string]bool{
		"learning_status":   false,
		"learning_validate": false,
		"learning_advance":  false,
		"learning_review":   false,
		"learning_init":     false,
	}
	if len(list) != len(want) {
		t.Fatalf("tools/list has %d tools, want %d: %v", len(list), len(want), list)
	}
	for _, raw := range list {
		tool := raw.(map[string]any)
		name, _ := tool["name"].(string)
		if _, ok := want[name]; !ok {
			t.Fatalf("unexpected tool %q", name)
		}
		want[name] = true
		if description, _ := tool["description"].(string); !strings.Contains(description, "learning_status") {
			t.Fatalf("%s description does not bind completion to learning_status: %q", name, description)
		}
		schema, ok := tool["inputSchema"].(map[string]any)
		if !ok {
			t.Fatalf("%s has no inputSchema", name)
		}
		if schema["type"] != "object" {
			t.Fatalf("%s schema type = %v, want object", name, schema["type"])
		}
		if schema["additionalProperties"] != false {
			t.Fatalf("%s schema does not forbid additional properties: %v", name, schema["additionalProperties"])
		}
	}
	for name, seen := range want {
		if !seen {
			t.Fatalf("tools/list is missing %s", name)
		}
	}
}

func TestMCPUnknownToolIsInvalidParams(t *testing.T) {
	responses := serveLines(t,
		callLine(3, "learning_nope", map[string]string{"root": "/tmp"}),
		`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"arguments":{}}}`,
		`{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"learning_status","arguments":"nope"}}`,
		`{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"learning_status","arguments":["nope"]}}`,
	)
	for i, resp := range responses {
		if code := rpcErrorCode(t, resp); code != rpcInvalidParams {
			t.Fatalf("response %d error code = %d, want %d", i, code, rpcInvalidParams)
		}
		if resp["id"].(float64) != float64(3+i) {
			t.Fatalf("response %d lost the request id: %v", i, resp["id"])
		}
	}
}

func TestMCPUnknownMethodAndParseErrorThenKeepsServing(t *testing.T) {
	responses := serveLines(t,
		`{"jsonrpc":"2.0","id":7,"method":"tools/nope"}`,
		`{this is not json`,
		`{"jsonrpc":"2.0","id":8,"method":"ping"}`,
	)
	if len(responses) != 3 {
		t.Fatalf("got %d responses, want 3", len(responses))
	}
	if code := rpcErrorCode(t, responses[0]); code != rpcMethodNotFound {
		t.Fatalf("unknown method code = %d, want %d", code, rpcMethodNotFound)
	}
	if responses[0]["id"].(float64) != 7 {
		t.Fatalf("unknown method lost the id: %v", responses[0])
	}
	if code := rpcErrorCode(t, responses[1]); code != rpcParseError {
		t.Fatalf("malformed line code = %d, want %d", code, rpcParseError)
	}
	// The next line is still served: the loop never dies on a bad request.
	result := toolResult(t, responses[2])
	if len(result) != 0 {
		t.Fatalf("ping result = %v, want {}", result)
	}
	if responses[2]["id"].(float64) != 8 {
		t.Fatalf("ping lost the id: %v", responses[2])
	}
}

func TestMCPAdvanceOnIncompleteStageIsAnEngineError(t *testing.T) {
	root, ws := newMCPWorkspace(t)
	var initOut bytes.Buffer
	if code := run([]string{"init", "--root", root, "--workspace", ws, "--rules", rulesPath, "--json"}, &initOut); code != 0 {
		t.Fatalf("init exit = %d: %s", code, initOut.String())
	}

	responses := serveLines(t, callLine(9, "learning_advance", map[string]string{
		"root": root, "workspace": ws, "rules": rulesPath, "stage": "preparation",
	}))
	result := toolResult(t, responses[0])
	if result["isError"] != true {
		t.Fatalf("advance on an incomplete stage reported success: %v", result)
	}
	text := resultText(t, result)
	if !strings.Contains(text, "missing artifact: plan.json") {
		t.Fatalf("engine reason text is not in the result: %q", text)
	}
	if status := structured(t, result)["status"]; status != "blocked" {
		t.Fatalf("structured status = %v, want blocked", status)
	}
}

func TestMCPStatusOnUnregisteredWorkspaceIsAnEngineError(t *testing.T) {
	root, ws := newMCPWorkspace(t)
	responses := serveLines(t, callLine(10, "learning_status", map[string]string{
		"root": root, "workspace": ws, "rules": rulesPath,
	}))
	result := toolResult(t, responses[0])
	if result["isError"] != true {
		t.Fatalf("status without state reported success: %v", result)
	}
	if text := resultText(t, result); !strings.Contains(text, "run not initialized") {
		t.Fatalf("engine text is not in the result: %q", text)
	}
	if status := structured(t, result)["status"]; status != "blocked" {
		t.Fatalf("structured status = %v, want blocked", status)
	}
}

func TestMCPInitThenStatusReportsEngineState(t *testing.T) {
	root, ws := newMCPWorkspace(t)
	initArgs := map[string]string{"root": root, "workspace": ws, "rules": rulesPath}

	responses := serveLines(t,
		callLine(11, "learning_init", initArgs),
		callLine(12, "learning_status", initArgs),
	)
	initResult := toolResult(t, responses[0])
	if initResult["isError"] != false {
		t.Fatalf("init reported an error: %v", initResult)
	}
	if status := structured(t, initResult)["status"]; status == "" {
		t.Fatalf("init structured report has no status: %v", initResult)
	}

	statusResult := toolResult(t, responses[1])
	if statusResult["isError"] != false {
		t.Fatalf("status after init reported an error: %v", statusResult)
	}
	report := structured(t, statusResult)
	status, ok := report["status"].(string)
	if !ok || status == "" {
		t.Fatalf("status report has no status: %v", report)
	}
	if _, ok := report["stage"].(string); !ok {
		t.Fatalf("status report has no stage: %v", report)
	}
}

func TestMCPAbsentArgumentsLetTheEngineDecide(t *testing.T) {
	// The environment stands in for absent paths, so it must be empty here.
	t.Setenv("LEARNING_ROOT", "")
	t.Setenv("LEARNING_WORKSPACE", "")
	responses := serveLines(t,
		`{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"learning_status","arguments":{}}}`,
	)
	result := toolResult(t, responses[0])
	if result["isError"] != true {
		t.Fatalf("a call with no flags reported success: %v", result)
	}
	if text := resultText(t, result); !strings.Contains(text, "missing required flag") {
		t.Fatalf("engine argument error is not in the result: %q", text)
	}
}

// LEARNING_ROOT and LEARNING_WORKSPACE stand in for the paths a call omits,
// and a path the call declares always wins over them.
func TestMCPEnvironmentStandsInForOmittedPaths(t *testing.T) {
	root, ws := newMCPWorkspace(t)
	t.Setenv("LEARNING_ROOT", root)
	t.Setenv("LEARNING_WORKSPACE", ws)

	responses := serveLines(t,
		callLine(14, "learning_init", map[string]string{"rules": rulesPath}),
		callLine(15, "learning_status", map[string]string{"rules": rulesPath}),
	)
	if result := toolResult(t, responses[0]); result["isError"] != false {
		t.Fatalf("init with paths from the environment reported an error: %v", result)
	}
	if _, err := os.Stat(filepath.Join(ws, ".learning", "state.json")); err != nil {
		t.Fatalf("init did not write the run where LEARNING_WORKSPACE points: %v", err)
	}
	status := toolResult(t, responses[1])
	if status["isError"] != false {
		t.Fatalf("status with paths from the environment reported an error: %v", status)
	}
	if _, ok := structured(t, status)["stage"].(string); !ok {
		t.Fatalf("status report has no stage: %v", status)
	}

	// A declared workspace wins: this one was never initialised, so the engine refuses it.
	otherRoot, otherWS := newMCPWorkspace(t)
	responses = serveLines(t, callLine(16, "learning_status", map[string]string{"root": otherRoot, "workspace": otherWS, "rules": rulesPath}))
	if result := toolResult(t, responses[0]); result["isError"] != true {
		t.Fatalf("declared paths lost to the environment: %v", result)
	}
}

// A flag a tool offers must be a flag the engine accepts: the MCP layer never
// invents vocabulary the CLI would refuse.
func TestMCPNeverOffersAFlagTheEngineRejects(t *testing.T) {
	values := map[string]string{
		"mode":     "deep",
		"scope":    "complete",
		"stage":    "preparation",
		"rule":     "own-words",
		"verdict":  "PASS",
		"reason":   "reviewer rationale",
		"reviewer": "chat",
		// init does not accept --method today; the value exists so that re-adding it
		// fails on the engine's refusal instead of on a missing fixture value.
		"method": "pareto",
	}
	for _, name := range toolOrder {
		tool := tools[name]
		root, ws := newMCPWorkspace(t)
		args := map[string]string{}
		for _, flag := range tool.flags {
			switch flag {
			case "root":
				args[flag] = root
			case "workspace":
				args[flag] = ws
			case "rules":
				args[flag] = rulesPath
			default:
				value, ok := values[flag]
				if !ok {
					t.Fatalf("%s declares %q and this test has no value for it", name, flag)
				}
				args[flag] = value
			}
		}
		result := toolResult(t, serveLines(t, callLine(41, name, args))[0])
		// Both shapes of an argv complaint: an unknown/missing flag and a flag
		// the command does not take.
		text := resultText(t, result)
		for _, complaint := range []string{"flag", "is only accepted by"} {
			if strings.Contains(text, complaint) {
				t.Fatalf("%s was rejected for its own declared flags (%s): %q", name, complaint, text)
			}
		}
	}
}
