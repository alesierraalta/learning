import { test } from "node:test";
import assert from "node:assert/strict";
import { sandboxArguments } from "./sandbox.mjs";

const options = {
  source: "/srv/preview/source", controller: "/srv/preview/controller", sockets: "/srv/preview/sockets",
  uid: 1000, gid: 1000, image: `sha256:${"a".repeat(64)}`,
  publicOrigin: "https://10.154.59.151:8447", bridgePublicOrigin: "https://10.154.59.151:8448",
};

test("sandbox has no network, host environment or writable host mounts except its socket directory", () => {
  const args = sandboxArguments(options);
  for (const argument of ["--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=1000:1000"]) assert.ok(args.includes(argument), argument);
  assert.deepEqual(args.filter((arg) => arg.startsWith("--mount=")), [
    "--mount=type=bind,src=/srv/preview/source,dst=/branch,readonly",
    "--mount=type=bind,src=/srv/preview/controller,dst=/controller,readonly",
    "--mount=type=bind,src=/srv/preview/sockets,dst=/sockets",
  ]);
  assert.ok(!args.some((arg) => /docker\.sock|\/home\/ale|--privileged|--network=host/.test(arg)));
  assert.ok(args.includes(`sha256:${"a".repeat(64)}`));
});

test("sandbox temporary fixture allows direct engine execution while retaining mount restrictions", () => {
  const args = sandboxArguments(options);
  assert.ok(args.includes("--tmpfs=/tmp:rw,nosuid,nodev,exec,size=256m"));
  assert.ok(args.includes("--tmpfs=/home/preview:rw,nosuid,nodev,noexec,size=32m"));
});

test("sandbox rejects unsafe mount syntax and mutable image tags", () => {
  for (const patch of [{ source: "/tmp/x,readonly=false" }, { sockets: "/srv/preview/source/sockets" }, { image: "node:latest" }, { uid: 0 }, { publicOrigin: "http://example.test" }]) {
    assert.throws(() => sandboxArguments({ ...options, ...patch }));
  }
});
