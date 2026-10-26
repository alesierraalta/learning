# Keep the studio running on the VPS

The systemd **user** service runs Node and Pi as `ale`, starts at boot without a login (lingering), and restarts after crashes. The repo is `/home/ale/learning`; the synced vault is `/home/ale/Learnings`.

**ZeroTier only.** Pi is an agent that runs commands on this host. Never expose the studio or bridge to the public internet: the TLS front binds the ZeroTier address `10.154.59.151` and nothing else.

## First install (on the VPS)

Run as `ale`, not root. Install Git, Go (the version required by `go.mod`), curl, Docker (with `ale` in the `docker` group), ZeroTier joined to the fleet network, the Infra Root CA service certificate at `/srv/certs/docker/infra.pem` + `infra-key.pem` (SAN `IP:10.154.59.151`; reissue with `/srv/certs/reissue-cert.sh`) and the official Node 24 at `~/.local/node` first (unpack the nodejs.org `linux-x64` tarball into `~/.local/node-<version>` and symlink `~/.local/node` to it): Ubuntu's `nodejs` package is built without TypeScript support and cannot run `studio/server.ts`.

1. Clone the deploy branch:
   ```sh
   git clone --branch feat/studio-vps https://github.com/alesierraalta/learning.git ~/learning
   cd ~/learning
   ```
2. Build the Linux engine:
   ```sh
   GOOS=linux GOARCH=amd64 go build -o bin/learning ./cmd/learning
   ```
3. Install Pi and configure its learning profile/extensions for this repository:
   ```sh
   npm config set prefix "$HOME/.npm-global"
   export PATH="$HOME/.npm-global/bin:$PATH"
   npm install -g @earendil-works/pi-coding-agent@1.4.0
   ```
   Complete the repository's Pi profile setup before starting the service; the studio starts `pi --mode rpc --session-id estudio` inside the vault.
4. Run `pi` yourself and log in. Do not copy credentials from another machine.
5. Configure Syncthing separately: sync only Learnings two-way with the PC's Obsidian vault into `/home/ale/Learnings`. Keep conflict copies; wait for initial sync.
6. Preview and install:
   ```sh
   bash deploy/vps/install.sh --dry-run
   bash deploy/vps/install.sh
   ```
   Dry-run prints planned mutations even when prerequisites are missing, exits nonzero for missing prerequisites, and never runs sudo or systemctl. For a different npm prefix, set `NPM_PREFIX=/your/prefix` before installation. The installer preserves an existing `~/.config/learning-studio.env`; edit its `PATH` yourself if changing prefixes later.

Open **https://10.154.59.151:8445** from a device on the ZeroTier network. HTTPS bridge pages use port **8446**. The container `learning-studio-caddy` (Caddy, host network, `deploy/vps/Caddyfile`, restarts unless stopped) terminates TLS there and proxies to loopback ports **4747** and **4748**, preserving Host. Each browser device must trust the Infra Root CA (`~/sync-hub/certs/infra-root-ca.crt`): on Windows, open the `.crt`, *Install Certificate* → *Local Machine* → *Trusted Root Certification Authorities*. The microphone needs that trusted HTTPS origin.

## Update and operate

```sh
bash ~/learning/deploy/vps/update.sh
journalctl --user -u learning-studio -f
bash ~/learning/deploy/vps/health.sh
```

Update fast-forwards Git, rebuilds and verifies the engine, restarts the service, and checks health. A failed build stops before restart. Health requires an active service and HTTP 302 at loopback and HTTP 302 at the ZeroTier HTTPS entry verified against the Infra Root CA. It does not verify Pi authentication or vault sync.

After editing the environment file, run `systemctl --user restart learning-studio`. After changing the unit, rerun the installer and restart the service (enabling an already active unit does not restart it).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Port taken / restart loop | Free 4747 or 4748; public mode deliberately fails rather than choosing another port. Inspect the journal. |
| Host not allowed | Confirm both public origins in `~/.config/learning-studio.env` match the hostname and ports above; restart. |
| Microphone unavailable | Use the HTTPS ZeroTier entry, not a plain-HTTP address, and trust the Infra Root CA on that device. Grant browser microphone permission. |
| User bus unavailable | Install from an actual login as `ale`, not a root shell; ensure systemd user services are available. |
| Pi not found or not authenticated | Check the env file's full `PATH`, profile setup and the user's own Pi login. |
| HTTPS check fails | `docker logs learning-studio-caddy`; confirm the ZeroTier interface is up (`zerotier-cli listnetworks`) and the certificate still lists `IP:10.154.59.151`. Do not touch the other Caddy containers. |
