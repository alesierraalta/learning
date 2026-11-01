/* The studio with no connection (docs/studio.md, "Reading with no connection").
 *
 * Online, every request goes to the network first and a good answer is kept: the
 * studio always shows what the server has now. With no network, the kept answer is
 * served instead, so the studio, its library and every saved part still open.
 *
 * Kept answers are filed without the run token: the token changes on every restart,
 * and a part saved under the old one must still open under the new one. The root
 * address redirects to the token URL, which needs the server; offline it is answered
 * with the kept studio.
 */
"use strict";

const STORE = "learning-studio";
/** The first path segment of a studio URL is its run token. */
const TOKEN = /^\/[0-9a-f]{64}(?=\/)/;
/** Live or private streams that must never be kept or replayed. */
const NEVER = /^\/(?:events|api\/view|api\/note)(?:[/?]|$)/;
const CDN = "https://cdn.jsdelivr.net";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** A URL, or null: a worker that throws would take the whole studio down with it. */
function parse(href) {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/** Where a request is filed: the studio's own path without its token, or the CDN URL as is. */
function keyOf(request) {
  const url = parse(request.url);
  if (!url) return null;
  if (url.origin === CDN) return url.href;
  if (url.origin !== self.location.origin) return null;
  const path = url.pathname.replace(TOKEN, "");
  if (NEVER.test(path) || path === "/sw.js") return null;
  return `${self.location.origin}${path}${url.search}`;
}

async function networkFirst(request, key) {
  const store = await caches.open(STORE);
  try {
    const answer = await fetch(request);
    // Only a complete answer is kept: never a redirect, an error page or an opaque reply.
    if (answer.ok && (answer.type === "basic" || answer.type === "cors")) await store.put(key, answer.clone());
    return answer;
  } catch (error) {
    const kept = await store.match(key);
    if (!kept) throw error;
    // Marked, so the studio can say it is showing what this device kept.
    const headers = new Headers(kept.headers);
    headers.set("x-learning-saved", "1");
    return new Response(kept.body, { status: kept.status, statusText: kept.statusText, headers });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const key = keyOf(request);
  if (!key) return;
  event.respondWith(networkFirst(request, key));
});

/** Asked by the studio: which saved parts this device can open with no connection. */
self.addEventListener("message", (event) => {
  if (event.data?.type !== "saved-parts") return;
  event.waitUntil(
    caches.open(STORE).then(async (store) => {
      const parts = [];
      for (const request of await store.keys()) {
        const url = parse(request.url);
        if (url?.pathname !== "/api/offline") continue;
        parts.push({ topic: url.searchParams.get("topic"), part: url.searchParams.get("part") });
      }
      event.ports[0]?.postMessage(parts);
    }),
  );
});
