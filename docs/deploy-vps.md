# Keep the studio running on the VPS

The systemd **user** service runs Node and Pi as `ale`, starts at boot without a login (lingering), and restarts after crashes. The repo is `/home/ale/learning`; the synced vault is `/home/ale/Learnings`.

**Tailnet only.** Pi is an agent that runs commands on this host. Never expose the studio or bridge to the public internet; do not enable Tailscale Funnel.

## First install (on the VPS)

Run as `ale`, not root. Install Git, Go (the version required by `go.mod`), curl, authenticated Tailscale and Node 22.22 at `/usr/bin/node` first.

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

Open **https://alelaptop.tail104959.ts.net:8445** from a tailnet device. HTTPS bridge pages use port **8446**. These proxy to loopback ports **4747** and **4748**. Existing Tailscale mappings on **443** and **8443** remain untouched.

## Update and operate

```sh
bash ~/learning/deploy/vps/update.sh
journalctl --user -u learning-studio -f
bash ~/learning/deploy/vps/health.sh
```

Update fast-forwards Git, rebuilds and verifies the engine, restarts the service, and checks health. A failed build stops before restart. Health requires an active service and HTTP 302 at loopback and, when Tailscale is installed, the HTTPS entry. It does not verify Pi authentication or vault sync.

After editing the environment file, run `systemctl --user restart learning-studio`. After changing the unit, rerun the installer and restart the service (enabling an already active unit does not restart it).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Port taken / restart loop | Free 4747 or 4748; public mode deliberately fails rather than choosing another port. Inspect the journal. |
| Host not allowed | Confirm both public origins in `~/.config/learning-studio.env` match the hostname and ports above; restart. |
| Microphone unavailable | Use the HTTPS tailnet entry, not a remote plain-HTTP address. Grant browser microphone permission. |
| User bus unavailable | Install from an actual login as `ale`, not a root shell; ensure systemd user services are available. |
| Pi not found or not authenticated | Check the env file's full `PATH`, profile setup and the user's own Pi login. |
| HTTPS check fails | Inspect `tailscale serve status` and tailnet access policy. Do not reset Serve or alter unrelated mappings. |
