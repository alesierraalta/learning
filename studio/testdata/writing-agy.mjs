// An agy that writes a part note and edits the diagnosis, reporting each tool step the way
// `agy --output-format stream-json` does: one ACTIVE then one DONE update per step.
import { join } from "node:path";

const out = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const step = (index, state, name, parameters) =>
  out({ event: "step_update", step_update: { step_index: index, state, step_type: "tool", tool_name: name, tool_info: { name, parameters } } });

out({ event: "init", conversation_id: "writing-conversation" });
const part = { Path: join(process.cwd(), "redes", "explicaciones", "Parte 1 - Capas.md") };
step(2, "ACTIVE", "write_to_file", part);
step(2, "DONE", "write_to_file", part);
const quiz = { TargetFile: join(process.cwd(), "redes", "quiz.md") };
step(4, "ACTIVE", "replace_file_content", quiz);
step(4, "DONE", "replace_file_content", quiz);
out({ event: "result", result: { status: "SUCCESS", response: "Escribí la Parte 1" } });
