import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listenRelay } from "./relay.mjs";

// This entrypoint runs inside the sandbox, never directly on the production host.
export async function startPreview({ sourceRoot, sockets, bridgePort, publicOrigin, bridgePublicOrigin }) {
  const { makeRoot } = await import(pathToFileURL(join(sourceRoot, "studio/testdata/root.mjs")));
  const { startStudio } = await import(pathToFileURL(join(sourceRoot, "studio/server.ts")));
  const { root, engine } = makeRoot();
  const studio = await startStudio({
    root, enginePath: engine, agentDisabled: true, piCommand: ["/bin/false"],
    bridgePort, publicOrigin, bridgePublicOrigin,
  });
  const relays = [];
  try {
    relays.push(await listenRelay(join(sockets, "studio.sock"), studio.port));
    relays.push(await listenRelay(join(sockets, "bridge.sock"), bridgePort));
  } catch (error) {
    await Promise.all(relays.map((relay) => new Promise((resolve) => relay.close(resolve))));
    await studio.close();
    throw error;
  }
  return {
    url: studio.url,
    async close() {
      await Promise.all(relays.map((relay) => new Promise((resolve) => relay.close(resolve))));
      await studio.close();
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const preview = await startPreview({
    sourceRoot: required("PREVIEW_SOURCE_ROOT"),
    sockets: required("PREVIEW_SOCKET_DIR"),
    publicOrigin: required("PREVIEW_PUBLIC_ORIGIN"),
    bridgePublicOrigin: required("PREVIEW_BRIDGE_PUBLIC_ORIGIN"),
    bridgePort: 4748,
  });
  console.log("Preview is ready");
  const stop = async () => { await preview.close(); process.exit(0); };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
