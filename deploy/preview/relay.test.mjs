import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, request } from "node:http";
import { listenRelay } from "./relay.mjs";

test("relay forwards HTTP through a Unix socket to loopback", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "preview-relay-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const upstream = createServer((_req, res) => res.end("preview"));
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => upstream.close(resolve)));
  const socket = join(dir, "studio.sock");
  const relay = await listenRelay(socket, upstream.address().port);
  t.after(() => new Promise((resolve) => relay.close(resolve)));
  const response = await new Promise((resolve, reject) => {
    request({ socketPath: socket, path: "/" }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    }).on("error", reject).end();
  });
  assert.deepEqual(response, { status: 200, body: "preview" });
});

test("the socket is connectable by the proxy user, not only its creator", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "preview-relay-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const upstream = createServer((_req, res) => res.end("preview"));
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => upstream.close(resolve)));
  const socket = join(dir, "studio.sock");
  const relay = await listenRelay(socket, upstream.address().port);
  t.after(() => new Promise((resolve) => relay.close(resolve)));
  assert.equal((await stat(socket)).mode & 0o666, 0o666, "the sandbox's umask must not close the socket to the host proxy");
});
