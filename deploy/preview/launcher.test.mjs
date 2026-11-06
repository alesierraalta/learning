import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { launchPreview } from "./launcher.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "preview-launcher-"));
  const source = join(root, "source"), controller = join(root, "controller"), sockets = join(root, "sockets");
  await Promise.all([source, controller, sockets].map((path) => mkdir(path)));
  const image = `sha256:${"a".repeat(64)}`;
  return { root, workspaceRoot: root, trustedOwner: process.getuid(), source, controller, sockets, uid: 123, gid: 456, forbiddenUid: 789, forbiddenGid: 987, image, expectedImage: image, publicOrigin: "https://preview.example", bridgePublicOrigin: "https://bridge.example" };
}

function fakeSpawn(exitCode = 0) {
  const calls = [];
  const spawn = (...args) => {
    calls.push(args);
    const child = new EventEmitter();
    process.nextTick(() => child.emit("close", exitCode, null));
    return child;
  };
  return { spawn, calls };
}

test("launches canonical mounts with isolated Docker process arguments", async () => {
  const options = await fixture();
  const fake = fakeSpawn();
  await launchPreview(options, { spawn: fake.spawn });
  assert.equal(fake.calls.length, 1);
  const [command, args, spawnOptions] = fake.calls[0];
  assert.equal(command, "docker");
  assert.equal(args[0], "run");
  assert.ok(args.includes("--pull=never"));
  assert.ok(args.includes(`--mount=type=bind,src=${options.source},dst=/branch,readonly`));
  assert.ok(args.includes(options.image));
  assert.deepEqual(spawnOptions.env, {});
  assert.equal(spawnOptions.shell, false);
  assert.equal(spawnOptions.stdio, "ignore");
});

test("rejects invalid directories, symlink overlap, identity and image before spawning", async () => {
  const options = await fixture();
  const link = join(options.root, "nested-link");
  await symlink(options.source, link);
  const file = join(options.root, "file");
  await writeFile(file, "fixture");
  const fake = fakeSpawn();
  for (const change of [
    { source: join(options.root, "missing") }, { source: file }, { source: "/" },
    { controller: link }, { source: "relative" }, { uid: 0 }, { gid: -1 },
    { image: "node:latest" }, { image: undefined },
    { workspaceRoot: undefined }, { trustedOwner: undefined }, { trustedOwner: -1 },
    { forbiddenUid: undefined }, { forbiddenGid: undefined },
    { uid: options.forbiddenUid }, { gid: options.forbiddenGid },
    { expectedImage: undefined }, { expectedImage: `sha256:${"b".repeat(64)}` },
  ]) {
    await assert.rejects(launchPreview({ ...options, ...change }, { spawn: fake.spawn }));
  }
  assert.equal(fake.calls.length, 0);
});

test("rejects untrusted workspace paths and permissions", async () => {
  const options = await fixture();
  const fake = fakeSpawn();
  const external = await mkdtemp(join(tmpdir(), "preview-external-"));
  const alias = join(options.root, "alias");
  await symlink(external, alias);
  for (const change of [
    { source: external }, { source: alias }, { workspaceRoot: alias },
    { workspaceRoot: `${options.root}/..` }, { trustedOwner: process.getuid() + 1 },
  ]) await assert.rejects(launchPreview({ ...options, ...change }, { spawn: fake.spawn }));
  const parent = join(options.root, "parent");
  const nested = join(parent, "workspace");
  await mkdir(parent);
  await mkdir(nested);
  await Promise.all(["source", "controller", "sockets"].map((name) => mkdir(join(nested, name))));
  await chmod(parent, 0o777);
  await assert.rejects(launchPreview({ ...options, workspaceRoot: nested, source: join(nested, "source"), controller: join(nested, "controller"), sockets: join(nested, "sockets") }, { spawn: fake.spawn }));
  const linkedRoot = join(options.root, "linked-workspace");
  await mkdir(linkedRoot);
  await symlink(external, join(linkedRoot, "source"));
  await Promise.all(["controller", "sockets"].map((name) => mkdir(join(linkedRoot, name))));
  await assert.rejects(launchPreview({ ...options, workspaceRoot: linkedRoot, source: join(linkedRoot, "source"), controller: join(linkedRoot, "controller"), sockets: join(linkedRoot, "sockets") }, { spawn: fake.spawn }));
  await chmod(options.controller, 0o777);
  await assert.rejects(launchPreview(options, { spawn: fake.spawn }));
  await chmod(options.controller, 0o700);
  await chmod(options.root, 0o777);
  await assert.rejects(launchPreview(options, { spawn: fake.spawn }));
  assert.equal(fake.calls.length, 0);
});

test("fails closed when Docker fails or cannot start without exposing its error", async () => {
  const options = await fixture();
  await assert.rejects(launchPreview(options, { spawn: fakeSpawn(2).spawn }), /Docker launch failed/);
  await assert.rejects(launchPreview(options, { spawn: () => { throw new Error("secret"); } }), (error) => !error.message.includes("secret"));
  const spawn = () => {
    const child = new EventEmitter();
    process.nextTick(() => child.emit("error", new Error("secret")));
    return child;
  };
  await assert.rejects(launchPreview(options, { spawn }), (error) => !error.message.includes("secret"));
});
