# Tutor runtime

Objective: the studio's tutor stops being fixed to Pi. Configuración lets the learner choose which agent tutors (Pi or Antigravity) and which model it uses, and the engine's authority stops depending on one agent's extension, so a second runtime is bound by the same rules.

Authorized ("si, hazlo todo") after the architecture review of 2026-11-04; branch `feat/tutor-runtime`; push and merge stay the user's decision.

## Specs

S1 — "yo dentro de la aplicación pueda elegir en configuraciones cuál es el proveedor"
S2 — "solamente quiero integrar ahorita dos. GentlePI y Antigravity"
S3 — "De forma que yo pueda elegir cualquiera de las dos para que sea mi tutor. O sea, que también funcione con Antigravity de fondo."
S4 — "que dentro del Gentle Shell yo también pueda elegir el modelo, aunque la mayoría del tiempo va a ser DeepSeek, pero bueno, que yo pueda decidir el modelo desde configuraciones"
S5 — "revisa qué hay que hacer para las tres": OpenCode is evaluated and documented, not implemented in this feature.
S6 — Accepted authority decision: the engine gate moves from the Pi extension to the studio, so every runtime is bound by the engine's own report (`learning status`), never by the agent's word.
S7 — "veo más probable que utilice Antigravity como main porque es el que tengo más uso sin darle uso real": Antigravity must be able to be the main tutor, not a demo.

## Tasks

T1 — S1,S4 — tutor config `<vault>/tutor.json`, `api/tutor`, model catalogue and live `set_model` for Pi — inline — pending
T2 — S3,S6 — extract `AgentRuntime` + `PiRuntime`; the studio keeps its exact SSE contract — inline — pending
T3 — S6 — engine reachable as an MCP server (`learning mcp`): status, validate, advance, review — writer — pending
T4 — S2,S3,S7 — `AgyRuntime`: one `agy --output-format stream-json` turn per prompt, conversation continuity, event mapping — inline — pending
T5 — S1,S2,S7 — Configuración › Tutor, conformance check across both runtimes, docs — inline — pending

## Log

L1 — "Quiero que revises la posibilidad de que podamos utilizar no solo GentleP o GentleShell como creador y tutor. [...] yo dentro de la aplicación pueda elegir en configuraciones cuál es el proveedor en el... O sea, solamente quiero integrar ahorita dos. GentlePI y Antigravity. De forma que yo pueda elegir cualquiera de las dos para que sea mi tutor. O sea, que también funcione con Antigravity de fondo. Porque tengo la cuota ahí y casi no la uso [...] También el Open Code u Open Code 2 con algún modelo gratuito [...] y que dentro del Gentle Shell yo también pueda elegir el modelo, aunque la mayoría del tiempo va a ser DeepSeek, pero bueno, que yo pueda decidir el modelo desde configuraciones. Pero veo más probable que utilice Antigravity como main porque es el que tengo más uso sin darle uso real."
L2 — Review delivered (2026-11-04): the studio speaks Pi's RPC event vocabulary (`agent_start`, `message_update`/`text_delta`, `tool_execution_*`, `extension_ui_request`) and the gate lives in `integrations/pi/index.ts`. Measured: `agy` 1.4.12 streams `step_update` with `text_delta` and returns `conversation_id`; its catalogue is gemini-3.8-flash-{high,medium,low}, claude-sonnet-4-6, claude-opus-4-6-thinking, gpt-oss-120b-medium.
L3 — Authorization: "si, hazlo todo" — both open decisions accepted (engine authority moves to the studio; the whole plan, not only T1).
