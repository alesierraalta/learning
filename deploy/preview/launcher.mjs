import { spawn as spawnChild } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { sandboxArguments } from "./sandbox.mjs";

// The operator must provision and protect this workspace and independently verify
// the image and forbidden identities. Path checks are not race-free authorization.
export async function launchPreview(options, { spawn = spawnChild } = {}) {
  const { workspaceRoot, trustedOwner, forbiddenUid, forbiddenGid, image, expectedImage } = options ?? {};
  const validId = (id) => Number.isSafeInteger(id) && id >= 0;
  if (!validId(trustedOwner) || !validId(forbiddenUid) || !validId(forbiddenGid) ||
      options.uid === forbiddenUid || options.gid === forbiddenGid ||
      typeof expectedImage !== "string" || image !== expectedImage) {
    throw new Error("invalid trusted provisioning");
  }
  if (typeof workspaceRoot !== "string" || !isAbsolute(workspaceRoot) ||
      normalize(workspaceRoot) !== workspaceRoot || workspaceRoot === "/" || /[,\n\r]/.test(workspaceRoot)) {
    throw new Error("invalid trusted workspace");
  }
  try {
    if (await realpath(workspaceRoot) !== workspaceRoot) throw new Error();
    for (let path = workspaceRoot; ; path = dirname(path)) {
      const info = await stat(path);
      const isWorkspace = path === workspaceRoot;
      const trustedStickyParent = !isWorkspace && info.uid === 0 && (info.mode & 0o1000) !== 0;
      if (!info.isDirectory() || (isWorkspace ? info.uid !== trustedOwner : info.uid !== 0 && info.uid !== trustedOwner) ||
          ((info.mode & 0o022) !== 0 && !trustedStickyParent)) throw new Error();
      if (path === "/") break;
    }
    for (const name of ["source", "controller", "sockets"]) {
      const path = join(workspaceRoot, name);
      if (options[name] !== path || await realpath(path) !== path) throw new Error();
      const info = await stat(path);
      if (!info.isDirectory() || info.uid !== trustedOwner || (info.mode & 0o022) !== 0) throw new Error();
    }
  } catch {
    throw new Error("invalid trusted workspace");
  }
  const args = sandboxArguments(options);
  args.splice(1, 0, "--pull=never");
  await new Promise((resolve, reject) => {
    const fail = () => reject(new Error("Docker launch failed"));
    try {
      const child = spawn("docker", args, { env: {}, shell: false, stdio: "ignore" });
      child.once("error", fail);
      child.once("close", (code, signal) => code === 0 && !signal ? resolve() : fail());
    } catch {
      fail();
    }
  });
}
