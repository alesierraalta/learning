import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePreviewCaddyConfig } from "./proxy.mjs";

const valid = { address: "10.147.17.23", ports: [8447, 8448], sockets: ["/run/preview/studio.sock", "/run/preview/app.sock"] };

test("generates isolated HTTPS sites with internal TLS and Unix upstreams", () => {
  const config = generatePreviewCaddyConfig(valid);
  assert.match(config, /^\{\s*auto_https off\s*\}/);
  assert.match(config, /untrusted|trust/i);
  assert.match(config, /firewall/i);
  assert.match(config, /https:\/\/10\.147\.17\.23:8447\s*\{\s*bind 10\.147\.17\.23\s*\n\s*tls internal\s*\n\s*reverse_proxy unix\/\/run\/preview\/studio\.sock\s*\n\}/);
  assert.match(config, /https:\/\/10\.147\.17\.23:8448\s*\{\s*bind 10\.147\.17\.23\s*\n\s*tls internal\s*\n\s*reverse_proxy unix\/\/run\/preview\/app\.sock\s*\n\}/);
  assert.equal((config.match(/reverse_proxy/g) || []).length, 2);
});

test("rejects invalid or injection-capable inputs", () => {
  for (const overrides of [
    { address: "0.0.0.0" }, { address: "127.0.0.1" }, { address: "256.1.1.1" },
    { address: "10.0.0.1\n}" }, { address: "010.0.0.1" },
    { ports: [80, 8448] }, { ports: [8447, 8447] }, { ports: [8447, 65536] },
    { ports: [8447, "8448"] }, { ports: [8447, ,] }, { ports: [, 8448] },
    { sockets: ["/run/a.sock", ,] }, { sockets: [, "/run/b.sock"] },
    { sockets: ["relative.sock", "/run/b.sock"] },
    { sockets: ["/run/../etc/a.sock", "/run/b.sock"] },
    { sockets: ["/run/a sock", "/run/b.sock"] }, { sockets: ["/run/a.sock\n}", "/run/b.sock"] },
    { sockets: ["/run/{env.X}", "/run/b.sock"] }, { sockets: ["/run/a\\b", "/run/b.sock"] },
  ]) assert.throws(() => generatePreviewCaddyConfig({ ...valid, ...overrides }));
});
