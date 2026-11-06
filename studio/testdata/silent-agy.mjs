// An Antigravity turn that ends with nothing: no result event, no text, exit 0.
process.stdout.write(`${JSON.stringify({ event: "init", conversation_id: "silent-conversation" })}\n`);
