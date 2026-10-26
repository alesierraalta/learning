# Studio on the VPS

Run the learning studio as an always-on service on the VPS (`alelaptop`), reachable over the
tailnet with HTTPS, with the Learnings vault kept in sync with the PC's Obsidian by Syncthing.
Branch `feat/studio-vps`, based on `fix/studio-dictation` (PR #2) so the deploy carries both changes.

## Specs

- **S1** Both sessions' changes run in the same app: "comunícate con la otra sesión para que puedan tener ambos cambios en el mismo en la misma aplicación". The deployed tree contains `main` (code exercises, PR #1) and the dictation fix (PR #2), plus any pending change the other session names.
- **S2** Always on: "quiero que despliegues la aplicación en la BPS para yo poder entrar siempre, sin que me dé error de conexión o lo que sea. O sea, siempre tienes que estar prendida." The studio starts at boot without a login, restarts when it crashes, and keeps a stable address.
- **S3** Remote access: the studio, its bridge pages and dictation work from a browser on another machine of the tailnet over HTTPS (`https://alelaptop.tail104959.ts.net:<port>`). Loopback use (`http://127.0.0.1:4747/`) keeps working unchanged. Nothing is exposed to the public internet.
- **S4** Vault sync (user choice, L3): "Syncthing en las dos direcciones" — only the Learnings folder, PC (Obsidian) ↔ VPS (studio), conflicts kept as copies, never lost.
- **S5** Credentials: the Pi login on the VPS is done by the user; no credential is copied or stored by the agent.

## Tasks

| ID | Specs | Route | Commit |
|---|---|---|---|
| T1 | S1 | coordinate with session 01a17888 (pending changes?) | — |
| T2 | S3 | worker: configurable public origins in bridge + studio, with tests | 6607024 |
| T3 | S2, S3 | worker: `deploy/vps/` systemd unit, install script, tailscale serve, docs | 3dbaf4b, b3a56b5 |
| T4 | S2 | VPS: Node deps, Go engine, Pi 1.4.0 + profile, skills | — |
| T5 | S5 | user: `pi` login on the VPS | — |
| T6 | S4 | Syncthing on VPS + Windows, share Learnings two-way | — |
| T7 | S2, S3 | enable service, verify from the PC browser and after a restart | — |

## Log

- **L1** (user): "Si yo autorizo comunícate con la otra sesión para que puedan tener ambos cambios en el mismo en la misma aplicación. Y de paso, quiero que despliegues la aplicación en la BPS para yo poder entrar siempre, sin que me dé error de conexión o lo que sea. O sea, siempre tienes que estar prendida."
- **L2** Evidence: VPS `alelaptop` (x86_64, Ubuntu, sudo) has Node 22, Docker, Tailscale (`tailscale serve` already used, tailnet only), no Pi, no Go, no repo, no vault. The vault (236 MB) lives at `C:\Users\ismar\Documents\obsidian\ale\notes\04-RECURSOS\Learnings` and has no sync today. Bridge and studio accept only loopback Host/Origin and build `http://127.0.0.1:<port>` URLs, so a remote browser cannot load the sheet.
- **L3** (user choice): "Syncthing en las dos direcciones (recomendado)".
- **L4** Decision: tailnet-only HTTPS via `tailscale serve`; no public exposure, because the studio drives Pi, an agent that runs commands on the host.
- **L5** Design for T2 (keeps loopback behaviour byte-identical when unset):
  - Bridge (`integrations/pi/bridge.ts`, `BridgeOptions`): new `publicOrigin?: string` (the HTTPS origin a browser uses to reach this bridge through a TLS proxy) and `publicEmbedder?: string` (the HTTPS origin of the studio allowed to frame bridge pages). Both validated at registration as bare https origins (`^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$`, lowercase host, no path/semicolon/wildcard), else throw naming the option. When `publicOrigin` is set: `base()` returns `${publicOrigin}/${token}/`; the Host allow-list adds `new URL(publicOrigin).host`; the Origin allow-list adds `publicOrigin`. `publicEmbedder` is appended to the three `frame-ancestors` lists. `frameAncestors` stays loopback-only (its existing rejection of `https://evil.example` is kept).
  - Studio (`studio/server.ts`, `StudioOptions`): new `publicOrigin?`, `bridgePublicOrigin?`, `bridgePort?`. `publicOrigin` and `bridgePublicOrigin` must be set together (else throw). When set: the studio Host allow-list adds the public host, POST Origin allow-list adds `publicOrigin`, the bridge is registered with `port: bridgePort`, `publicOrigin: bridgePublicOrigin`, `publicEmbedder: publicOrigin`, the shell CSP `frame-src` is the bridge's real origin (derive with `new URL(base).origin`, not the 127.0.0.1 regex), and the studio port is strict (no fallback to a free port: a service behind a fixed proxy mapping must fail loudly). The CLI entry reads `STUDIO_PUBLIC_ORIGIN`, `STUDIO_BRIDGE_PUBLIC_ORIGIN`, `STUDIO_BRIDGE_PORT`; `--no-open` is implied when `STUDIO_PUBLIC_ORIGIN` is set; the printed entry is the public origin when set.
  - Tailscale serve forwards the incoming `Host` (e.g. `alelaptop.tail104959.ts.net:8446`), so tests simulate the proxy by sending that Host header to the loopback listener.
  - Ports on the VPS: studio `127.0.0.1:4747` ← `https://alelaptop.tail104959.ts.net:8445`; bridge `127.0.0.1:4748` ← `https://alelaptop.tail104959.ts.net:8446`.
- **L6** Evidence (deploy): independent verify of 6607024 PASS on security (gaps: rich-page public ancestor and CLI env not separately tested). Native review (risk, resilience, reliability) approved and acknowledged, 12 non-blocking advisories. Ubuntu's nodejs 22 lacks TypeScript support (`ERR_UNKNOWN_FILE_EXTENSION`, then `ERR_NO_TYPESCRIPT`), so the unit uses nodejs.org v24.14.1 at `~/.local/node` (symlink to `~/.local/node-v24.14.1`, sha256 checked) — b3a56b5. On the VPS: repo at `~/learning` (feat/studio-vps via git bundle, nothing pushed), engine `bin/learning` cross-built, Pi 1.4.0 + profile without credentials, gentle-pi, Claude Code CLI 2.1.310 (Pi's default provider is `claude-bridge`), Syncthing 1.29.5 as `syncthing@ale` with folder `learnings` → `~/Learnings` receive-only (device ID `G6P3C5H-CFMWCUE-CZFJE7U-5726YPQ-GOMXQJL-ANM4SDN-35AEZ3W-N2UZDAA`). Service active with linger, kill -9 recovered by systemd within 6 s, health OK, pre-existing serve mappings :443 and :8443 unchanged. Real Chromium through a SOCKS tunnel to the VPS: `https://alelaptop.tail104959.ts.net:8445/` → 200, shell rendered, `frame-src https://alelaptop.tail104959.ts.net:8446`, no console errors. Blockers outside the agent: WSL→Windows interop down (`UtilAcceptVsock accept4 failed`), Windows has neither Tailscale nor Syncthing, Claude login on the VPS is the user's. The other session (01a17888) has not answered yet. Known gap: the video pipeline (`learnings-video`) lives on the PC, so video requests from the VPS studio are not served.
