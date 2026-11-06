import { isAbsolute, normalize } from "node:path";

// Produces arguments for Docker, never a shell command. The caller supplies an
// already verified, trusted local Node image ID and disposable source snapshot.
export function sandboxArguments({ source, controller, sockets, uid, gid, image, publicOrigin, bridgePublicOrigin }) {
  for (const path of [source, controller, sockets]) {
    if (typeof path !== "string" || !isAbsolute(path) || normalize(path) !== path || path === "/" || /[,\n\r]/.test(path)) {
      throw new Error("mount paths must be normalized absolute paths without commas");
    }
  }
  const paths = [source, controller, sockets];
  if (paths.some((path, i) => paths.some((other, j) => i !== j && (path === other || path.startsWith(`${other}/`))))) {
    throw new Error("mount paths must not overlap");
  }
  if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(gid) || gid <= 0) throw new Error("a non-root uid and gid are required");
  if (!/^sha256:[0-9a-f]{64}$/.test(image)) throw new Error("a pinned local image ID is required");
  for (const origin of [publicOrigin, bridgePublicOrigin]) {
    let url;
    try { url = new URL(origin); } catch { throw new Error("HTTPS origins are required"); }
    if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) throw new Error("HTTPS origins are required");
  }
  return [
    "run", "--detach", "--name=learning-branch-preview", "--network=none", "--read-only",
    `--user=${uid}:${gid}`, "--cap-drop=ALL", "--security-opt=no-new-privileges",
    "--pids-limit=128", "--memory=1g", "--cpus=1.5",
    "--tmpfs=/tmp:rw,nosuid,nodev,exec,size=256m", "--tmpfs=/home/preview:rw,nosuid,nodev,noexec,size=32m",
    `--mount=type=bind,src=${source},dst=/branch,readonly`,
    `--mount=type=bind,src=${controller},dst=/controller,readonly`,
    `--mount=type=bind,src=${sockets},dst=/sockets`,
    "--env=HOME=/home/preview", "--env=PREVIEW_SOURCE_ROOT=/branch", "--env=PREVIEW_SOCKET_DIR=/sockets",
    `--env=PREVIEW_PUBLIC_ORIGIN=${publicOrigin}`, `--env=PREVIEW_BRIDGE_PUBLIC_ORIGIN=${bridgePublicOrigin}`,
    image, "node", "/controller/preview.mjs",
  ];
}
