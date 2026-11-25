#!/usr/bin/env node
// Deterministic stand-in for bin/embed (T4 contract): same JSON Lines shape, same
// 384-dim little-endian float32 base64 payload, no model and no network. Tokens
// shared between two texts produce a positive cosine, so the retrieval harness
// can exercise hybrid search without the Rust binary.
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DIM = 384;

/**
 * One JSONL line per lifecycle event, when `FAKE_EMBED_LOG` names a file: `ready` once per child,
 * `request` when a line arrives, `answer` when the vectors are written and `cancelled` when the
 * client withdraws a request it no longer awaits (#427). It is how a test observes what the child
 * itself saw: a cancelled request is one the embedder was told to drop, so it never answers it.
 */
function anotar(evento) {
  const destino = process.env.FAKE_EMBED_LOG;
  if (!destino) return;
  appendFileSync(destino, `${JSON.stringify({ ...evento, at: Date.now() })}\n`);
}

const normalizar = (texto) => String(texto).normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();

/** FNV-1a over normalized words, folded into two signed dimensions per word. */
export function vectorDe(texto) {
  const vector = new Float32Array(DIM);
  for (const token of normalizar(texto).match(/[\p{L}\p{N}]+/gu) ?? []) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < token.length; index++) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    const first = hash % DIM;
    const second = (hash >>> 9) % DIM;
    vector[first] += (hash & 0x10000) ? 1 : -1;
    vector[second] += (hash & 0x20000) ? 1 : -1;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  if (norm > 0) {
    norm = Math.sqrt(norm);
    for (let index = 0; index < DIM; index++) vector[index] /= norm;
  }
  return vector;
}

function answer(id, texts) {
  const vectors = texts.map((texto) => Buffer.from(vectorDe(texto).buffer).toString("base64"));
  return { id, dim: DIM, vectors };
}

export function serve() {
  process.stdout.write(`${JSON.stringify({ ready: true, model: "multilingual-e5-small-q8", dim: DIM })}\n`);
  anotar({ event: "ready" });
  /** Requests received and not yet answered: a withdrawal names them and drops their timer. */
  const pendientes = new Map();
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let cut;
    while ((cut = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      // The pinned contract skips a blank line (`tools/embed/src/main.rs`): it carries no work and no
      // reply. The studio uses it to say it no longer awaits the request it just sent, so the child
      // drops it exactly as a cancellation would. A withdrawn request is never answered.
      if (!line.trim()) {
        for (const [id, timer] of [...pendientes]) {
          clearTimeout(timer);
          pendientes.delete(id);
          anotar({ event: "cancelled", id });
        }
        continue;
      }
      let request;
      try { request = JSON.parse(line); } catch { request = undefined; }
      const id = request?.id;
      anotar({ event: "request", id, kind: request?.kind });
      const handle = () => {
        try {
          if (request.kind !== "passage" && request.kind !== "query") throw new Error("kind must be passage or query");
          if (!Array.isArray(request.texts) || request.texts.length < 1 || request.texts.length > 64) throw new Error("texts must have 1 to 64 items");
          pendientes.delete(id);
          process.stdout.write(`${JSON.stringify(answer(id, request.texts))}\n`);
          anotar({ event: "answer", id });
        } catch (error) {
          pendientes.delete(id);
          const fallo = id ?? request?.id;
          process.stdout.write(`${JSON.stringify({ id: fallo, error: String(error?.message ?? error) })}\n`);
        }
      };
      const delay = Number(process.env.FAKE_EMBED_DELAY_MS ?? 0);
      if (delay > 0) pendientes.set(id, setTimeout(handle, delay));
      else handle();
    }
  });
  process.stdin.on("end", () => process.exit(0));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serve();
