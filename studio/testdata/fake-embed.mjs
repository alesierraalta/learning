#!/usr/bin/env node
// Deterministic stand-in for bin/embed (T4 contract): same JSON Lines shape, same
// 384-dim little-endian float32 base64 payload, no model and no network. Tokens
// shared between two texts produce a positive cosine, so the retrieval harness
// can exercise hybrid search without the Rust binary.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DIM = 384;

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
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let cut;
    while ((cut = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      if (!line.trim()) continue;
      const delay = Number(process.env.FAKE_EMBED_DELAY_MS ?? 0);
      const handle = () => {
        try {
          const request = JSON.parse(line);
          if (request.kind !== "passage" && request.kind !== "query") throw new Error("kind must be passage or query");
          if (!Array.isArray(request.texts) || request.texts.length < 1 || request.texts.length > 64) throw new Error("texts must have 1 to 64 items");
          process.stdout.write(`${JSON.stringify(answer(request.id, request.texts))}\n`);
        } catch (error) {
          const id = (() => { try { return JSON.parse(line).id; } catch { return undefined; } })();
          process.stdout.write(`${JSON.stringify({ id, error: String(error?.message ?? error) })}\n`);
        }
      };
      if (delay > 0) setTimeout(handle, delay);
      else handle();
    }
  });
  process.stdin.on("end", () => process.exit(0));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serve();
