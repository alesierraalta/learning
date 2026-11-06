import { chmod } from "node:fs/promises";
import { createConnection, createServer } from "node:net";

/** Relay a local Unix socket to a listener in the same isolated network namespace. */
export async function listenRelay(socketPath, port) {
  const server = createServer((client) => {
    const upstream = createConnection({ host: "127.0.0.1", port });
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
    client.pipe(upstream).pipe(client);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  // The sandbox's umask would otherwise leave the socket owner-only, and the
  // proxy on the host is a different user: it could never connect.
  await chmod(socketPath, 0o666);
  return server;
}
