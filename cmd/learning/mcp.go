package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime/debug"
	"strings"
)

// The MCP layer is a transport, not a second engine: every tool call is
// rebuilt as the equivalent argv and executed by run, so the engine keeps
// deciding what a stage requires and whether it is complete. A tutor runtime
// reads the same JSON report a human running the CLI would read.

const mcpProtocolVersion = "2025-06-18"

// JSON-RPC 2.0 error codes used by this server.
const (
	rpcParseError     = -32700
	rpcMethodNotFound = -32601
	rpcInvalidParams  = -32602
)

// serveMCP serves newline-delimited JSON-RPC on in/out until EOF. Diagnostics
// never go to out: a client parses every line of out as one response object.
func serveMCP(in io.Reader, out, errOut io.Writer) int {
	s := &mcpServer{out: out, errOut: errOut, version: serverVersion()}
	reader := bufio.NewReader(in)
	for {
		line, err := reader.ReadBytes('\n')
		if len(line) > 0 {
			s.handleLine(line)
		}
		if err == nil {
			continue
		}
		if errors.Is(err, io.EOF) {
			return 0
		}
		fmt.Fprintf(errOut, "learning mcp: read failed: %v\n", err)
		return 2
	}
}

type mcpServer struct {
	out     io.Writer
	errOut  io.Writer
	version string
}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// handleLine answers one line. A line that is not an object is a parse error;
// a request without an id is a notification and gets no response at all.
func (s *mcpServer) handleLine(line []byte) {
	line = bytes.TrimSpace(line)
	if len(line) == 0 {
		return
	}
	var req rpcRequest
	if err := json.Unmarshal(line, &req); err != nil {
		s.send(rpcResponse{ID: json.RawMessage("null"), Error: parseError()})
		return
	}
	if !isJSONObject(line) {
		s.send(rpcResponse{ID: json.RawMessage("null"), Error: parseError()})
		return
	}
	if req.ID == nil {
		// Notifications (notifications/initialized included) never answer.
		return
	}
	switch req.Method {
	case "initialize":
		s.send(rpcResponse{ID: req.ID, Result: mustMarshal(map[string]any{
			"protocolVersion": mcpProtocolVersion,
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": "learning", "version": s.version},
		})})
	case "ping":
		s.send(rpcResponse{ID: req.ID, Result: json.RawMessage("{}")})
	case "tools/list":
		s.send(rpcResponse{ID: req.ID, Result: mustMarshal(map[string]any{"tools": toolList()})})
	case "tools/call":
		s.callTool(req)
	default:
		s.send(rpcResponse{ID: req.ID, Error: &rpcError{
			Code:    rpcMethodNotFound,
			Message: fmt.Sprintf("unknown method %q", req.Method),
		}})
	}
}

func (s *mcpServer) callTool(req rpcRequest) {
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if len(req.Params) > 0 && !isJSONObject(req.Params) {
		s.send(rpcResponse{ID: req.ID, Error: invalidParams("params must be an object")})
		return
	}
	if len(req.Params) > 0 {
		if err := json.Unmarshal(req.Params, &params); err != nil {
			s.send(rpcResponse{ID: req.ID, Error: invalidParams("params must be an object")})
			return
		}
	}
	tool, ok := tools[params.Name]
	if params.Name == "" || !ok {
		s.send(rpcResponse{ID: req.ID, Error: invalidParams(fmt.Sprintf("unknown tool %q", params.Name))})
		return
	}
	args, rpcErr := decodeArguments(tool, params.Arguments)
	if rpcErr != nil {
		s.send(rpcResponse{ID: req.ID, Error: rpcErr})
		return
	}
	s.send(rpcResponse{ID: req.ID, Result: mustMarshal(runTool(tool, args))})
}

// decodeArguments accepts an object whose declared values are strings. An
// absent arguments value is an empty call: the engine then reports the flags
// it still needs, exactly as it would for a human.
func decodeArguments(tool mcpTool, raw json.RawMessage) (map[string]string, *rpcError) {
	args := map[string]string{}
	if len(raw) == 0 {
		return args, nil
	}
	if !isJSONObject(raw) {
		return nil, invalidParams("arguments must be an object")
	}
	var values map[string]json.RawMessage
	if err := json.Unmarshal(raw, &values); err != nil {
		return nil, invalidParams("arguments must be an object")
	}
	for key, value := range values {
		if !tool.accepts(key) {
			return nil, invalidParams(fmt.Sprintf("%s does not accept the argument %q", tool.name, key))
		}
		var text string
		if err := json.Unmarshal(value, &text); err != nil {
			return nil, invalidParams(fmt.Sprintf("argument %q must be a string", key))
		}
		args[key] = text
	}
	return args, nil
}

// runTool is the whole bridge: reconstruct the CLI argv for this tool, run it
// through the same entry point the human CLI uses, and hand its report back.
func runTool(tool mcpTool, args map[string]string) map[string]any {
	cliArgs := []string{tool.command}
	for _, flag := range tool.flags {
		value := args[flag]
		if value == "" {
			switch flag {
			case "root":
				value = os.Getenv("LEARNING_ROOT")
			case "workspace":
				value = os.Getenv("LEARNING_WORKSPACE")
			}
		}
		if value == "" {
			continue
		}
		cliArgs = append(cliArgs, "--"+flag, value)
	}
	cliArgs = append(cliArgs, "--json")

	var captured bytes.Buffer
	code := run(cliArgs, &captured)
	text := captured.String()

	result := map[string]any{
		"content": []map[string]any{{"type": "text", "text": text}},
		"isError": code != 0,
	}
	if structured, ok := parseReport(text); ok {
		result["structuredContent"] = structured
	}
	return result
}

func parseReport(text string) (map[string]any, bool) {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil, false
	}
	var doc map[string]any
	if err := json.Unmarshal([]byte(trimmed), &doc); err != nil {
		return nil, false
	}
	return doc, true
}

// --- tools -----------------------------------------------------------------

type mcpTool struct {
	name        string
	description string
	command     string
	flags       []string
}

func (t mcpTool) accepts(name string) bool {
	for _, f := range t.flags {
		if f == name {
			return true
		}
	}
	return false
}

// authority is the sentence every description repeats: the engine's report is
// the only proof that a stage is done, whatever the tutor would like to say.
const authority = "The engine decides completion: a tutor may not claim or announce that a stage is done unless learning_status reports it."

var toolOrder = []string{
	"learning_status",
	"learning_validate",
	"learning_advance",
	"learning_review",
	"learning_init",
}

var tools = map[string]mcpTool{
	"learning_status": {
		name:        "learning_status",
		command:     "status",
		flags:       []string{"root", "workspace", "rules", "mode"},
		description: "Report the engine's own status: receipt freshness, recorded reviews, conditional obligations, the next required stage and fail-closed completion. " + authority,
	},
	"learning_validate": {
		name:        "learning_validate",
		command:     "validate",
		flags:       []string{"root", "workspace", "rules", "mode"},
		description: "Evaluate the objective checks of a stage without writing anything and list the reviews still pending. " + authority,
	},
	"learning_advance": {
		name:        "learning_advance",
		command:     "advance",
		flags:       []string{"root", "workspace", "rules", "mode", "stage"},
		description: "Validate objective checks, require every applicable review to be recorded and fresh, then record stage evidence. A pending review, a FAIL verdict or failing validation records nothing. " + authority,
	},
	"learning_review": {
		name:        "learning_review",
		command:     "review",
		flags:       []string{"root", "workspace", "rules", "mode", "stage", "rule", "verdict", "reason", "reviewer"},
		description: "Record the tutor's PASS or FAIL verdict for one rubric of a stage, bound to the current artifact, rules and evidence hashes. Recording a review never advances a stage. " + authority,
	},
	"learning_init": {
		name:        "learning_init",
		command:     "init",
		flags:       []string{"root", "workspace", "rules", "mode", "scope"},
		description: "Create engine-owned state (.learning/state.json) for a new deep run; it refuses to overwrite an existing run. " + authority,
	},
}

func toolList() []map[string]any {
	list := make([]map[string]any, 0, len(toolOrder))
	for _, name := range toolOrder {
		tool := tools[name]
		list = append(list, map[string]any{
			"name":        tool.name,
			"description": tool.description,
			"inputSchema": schemaFor(tool.flags),
		})
	}
	return list
}

func schemaFor(flags []string) map[string]any {
	properties := make(map[string]any, len(flags))
	for _, flag := range flags {
		properties[flag] = map[string]any{
			"type":        "string",
			"description": flagDoc[flag],
		}
	}
	return map[string]any{
		"type":                 "object",
		"properties":           properties,
		"additionalProperties": false,
	}
}

var flagDoc = map[string]string{
	"root":      "Canonical Learnings root directory (containment boundary).",
	"workspace": "Topic workspace directory inside the root.",
	"rules":     "Structured rules file (repository rules/deep.json).",
	"mode":      "deep (default) or conceptual.",
	"scope":     "init only: complete (default) or pareto.",
	"stage":     "Stage name, as declared in the rules file.",
	"rule":      "review only: rubric id receiving the verdict.",
	"verdict":   "review only: PASS or FAIL.",
	"reason":    "review only: reviewer rationale (required, non-empty).",
	"reviewer":  "review only: reviewer identity label (default \"chat\").",
}

// --- wire helpers ----------------------------------------------------------

func (s *mcpServer) send(resp rpcResponse) {
	resp.JSONRPC = "2.0"
	b, err := json.Marshal(resp)
	if err != nil {
		fmt.Fprintf(s.errOut, "learning mcp: encode response failed: %v\n", err)
		return
	}
	b = append(b, '\n')
	if _, err := s.out.Write(b); err != nil {
		fmt.Fprintf(s.errOut, "learning mcp: write response failed: %v\n", err)
	}
}

func mustMarshal(value any) json.RawMessage {
	b, err := json.Marshal(value)
	if err != nil {
		// The values here are all plain maps and slices; this cannot happen.
		return json.RawMessage("null")
	}
	return b
}

func parseError() *rpcError {
	return &rpcError{Code: rpcParseError, Message: "parse error: expected one JSON object per line"}
}

func invalidParams(message string) *rpcError {
	return &rpcError{Code: rpcInvalidParams, Message: message}
}

func isJSONObject(raw []byte) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) > 0 && trimmed[0] == '{'
}

func serverVersion() string {
	if info, ok := debug.ReadBuildInfo(); ok {
		if v := info.Main.Version; v != "" && v != "(devel)" {
			return v
		}
	}
	return "1.0.0"
}
