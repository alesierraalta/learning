import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, request } from "node:http";
import { startPreview } from "./preview.mjs";

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("preview exposes the isolated fixture through its Unix relay", async (t) => {
  const sockets = await mkdtemp(join(tmpdir(), "preview-sockets-"));
  t.after(() => rm(sockets, { recursive: true, force: true }));
  const bridgePort = await freePort();
  const preview = await startPreview({
    sourceRoot: resolve("."), sockets, bridgePort,
    publicOrigin: "https://preview.test:8447", bridgePublicOrigin: "https://preview.test:8448",
  });
  t.after(() => preview.close());
  const status = await new Promise((resolve, reject) => {
    request({ socketPath: join(sockets, "studio.sock"), path: new URL(preview.url).pathname + "api/view?topic=redes&part=p1", headers: { host: "preview.test:8447" } }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    }).on("error", reject).end();
  });
  assert.equal(status, 200);
});
