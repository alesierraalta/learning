process.stdout.write(`${JSON.stringify({ event: "init", conversation_id: "test-conversation" })}\n`);
process.stdout.write(`${JSON.stringify({ event: "result", result: { status: "SUCCESS", response: "Respuesta de Antigravity" } })}\n`);
