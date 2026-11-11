import { join } from "node:path";

const out = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const parameters = { Path: join(process.cwd(), "redes", "quiz.md") };
out({ event: "init", conversation_id: "diagnosis-conversation" });
for (const state of ["ACTIVE", "DONE"]) {
  out({ event: "step_update", step_update: { step_index: 2, state, step_type: "tool", tool_name: "write_file", tool_info: { name: "write_file", parameters } } });
}
out({ event: "result", result: { status: "SUCCESS", response: "Escribí el diagnóstico" } });
