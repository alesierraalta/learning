# Keep the studio running on the VPS

The systemd **user** service runs Node and Pi as `ale`, starts at boot without a login (lingering), and restarts after crashes. The repo is `/home/ale/learning`; the synced vault is `/home/ale/Learnings`.

**ZeroTier only.** Pi is an agent that runs commands on this host. Never expose the studio or bridge to the public internet: the TLS front binds the ZeroTier address `10.154.59.151` and nothing else.

## First install (on the VPS)

Run as `ale`, not root. Install Git, Go (the version required by `go.mod`), curl, Docker (with `ale` in the `docker` group), ZeroTier joined to the fleet network, the Infra Root CA service certificate at `/srv/certs/docker/infra.pem` + `infra-key.pem` (SAN `IP:10.154.59.151`; reissue with `/srv/certs/reissue-cert.sh`) and the official Node 24 at `~/.local/node` first (unpack the nodejs.org `linux-x64` tarball into `~/.local/node-<version>` and symlink `~/.local/node` to it): Ubuntu's `nodejs` package is built without TypeScript support and cannot run `studio/server.ts`.

1. Clone the deploy branch:
   ```sh
   git clone https://github.com/alesierraalta/learning.git ~/learning
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
4. Give Pi its model credential and default model. The studio's tutor uses `opencode-go/deepseek-v4.1-flash` with thinking `high`: the `opencode-go` API key lives in `~/.pi/agent/auth.json` (mode 600; log in with `pi` → `/login`, or copy only that entry from the PC with the owner's consent), and `~/.pi/agent/settings.json` sets `defaultProvider: opencode-go`, `defaultModel: deepseek-v4.1-flash`, `defaultThinkingLevel: high`. Check with `pi -p --mode json "di hola" | grep -o '"thinkingLevel":"[a-z]*"'`, then `systemctl --user restart learning-studio`.
5. Put the vault in place. The VPS holds the only working copy of Learnings at `/home/ale/Learnings` (copied once from the PC's Obsidian vault; there is no live sync). The installer turns it into a Git repository backup only if it already is one (see [Content backup](#content-backup)).
6. Preview and install:
   ```sh
   bash deploy/vps/install.sh --dry-run
   bash deploy/vps/install.sh
   ```
   Dry-run prints planned mutations even when prerequisites are missing, exits nonzero for missing prerequisites, and never runs sudo or systemctl. For a different npm prefix, set `NPM_PREFIX=/your/prefix` before installation. The installer preserves an existing `~/.config/learning-studio.env`; edit its `PATH` yourself if changing prefixes later.

Open **https://learnings.infra.local/** from a device on the ZeroTier network; the bare address **https://10.154.59.151:8445** keeps working as a fallback. HTTPS bridge pages use port **8446** (`https://learnings.infra.local:8446`). The container `learning-studio-caddy` (Caddy, host network, `deploy/vps/Caddyfile`, restarts unless stopped) terminates TLS on port **443** for the name and on **8445**/**8446** for the address, proxying to loopback ports **4747** and **4748** and preserving Host. For microphone capture, keep using HTTPS; accepting the certificate warning once is enough. Installing the Infra Root CA is optional. UFW drops unlisted ports, so the installer allows `443/tcp` and `8445:8446/tcp` on the ZeroTier interface only.

## The stable name

`learnings.infra.local` is served only inside the ZeroTier network, so nothing is exposed to the internet:

- The certificate is the Infra Root CA service certificate, whose SAN covers `*.infra.local`.
- `deploy/vps/learnings-dns.sh` (run by the installer) installs dnsmasq listening on `10.154.59.151:53` only, answering `learnings.infra.local` with that address and forwarding every other query to the host resolver. It checks the record with `dig` before reporting success.
- Point the network's managed DNS at `10.154.59.151` for the `infra.local` domain in ZeroTier Central (network → **DNS**: nameserver `10.154.59.151`, domain `infra.local`). Members then resolve the name at home and away; every other lookup keeps using the device's own resolvers.
- mDNS was evaluated first and rejected: Windows did not resolve a published `*.local` address across ZeroTier (`ENOTFOUND`).

## Server-side dictation

In `~/.config/learning-studio.env`, configure both variables:

```sh
STUDIO_TRANSCRIBER_URL=http://10.154.59.151:8765
STUDIO_TRANSCRIBER_TOKEN=<API_TOKEN from ~/video-transcriber/.env>
```

Copy the existing `API_TOKEN` privately; do not print it, commit it or put it in
browser configuration. Protect the environment file with mode 600 and restart
`learning-studio`. The server calls video-transcriber; the browser only sends
audio to the bridge. Without both variables, leave both unset to use Web Speech.
HTTPS is still required by the browser for microphone access, even with this model.

## Content backup

The VPS holds the only working copy of Learnings (migrated once from Obsidian). `~/Learnings`
is a Git repository pushed to the private `alesierraalta/learnings` with a repository-scoped
deploy key (`~/.ssh/learnings_deploy`, SSH host alias `github-learnings`). Videos (`*.mp4`,
`*.mov`, `*.webm`) and Pi's `.pi/` and `.atl/` stay out (`.gitignore`). The installer enables
`learnings-backup.timer`, which runs `deploy/vps/learnings-backup.sh` hourly: it commits and
pushes only when something changed. Run it now with `systemctl --user start learnings-backup`;
see runs with `journalctl --user -u learnings-backup`.

## Update and operate

```sh
bash ~/learning/deploy/vps/update.sh
journalctl --user -u learning-studio -f
bash ~/learning/deploy/vps/health.sh
```

Update fast-forwards Git, rebuilds and verifies the engine, restarts the service, and checks health. A failed build stops before restart. Health requires an active service and HTTP 302 at loopback and HTTP 302 at the ZeroTier HTTPS entry verified against the Infra Root CA. It does not verify Pi authentication or vault sync. The same script runs automatically after every merge to `main`; see [Continuous integration and delivery](#continuous-integration-and-delivery).

`update.sh` refuses to run when `~/learning` is on a branch other than `main` or has uncommitted changes, so a hand edit on the server is never pulled over or discarded.

## Continuous integration and delivery

`.github/workflows/ci.yml` runs on GitHub-hosted runners for every pull request and every push to `main`: `gofmt`, `go vet`, `go test ./...`, `go test -race ./...`, the engine build, the digest-pinned sandbox images, Playwright Chromium, and the adapter and studio suites. Reproduce it locally with the commands in [README](../README.md#verification); set `PLAYWRIGHT_MODULE` to the global Playwright entry point when the module is installed globally.

`.github/workflows/deploy.yml` runs on the VPS itself, through a repository-scoped self-hosted runner labelled `learning-vps`. It triggers on `push` to `main` and on manual `workflow_dispatch`; pull requests never target it. The job calls `deploy/vps/update.sh`, so delivery follows the same path as a manual update: fast-forward, rebuild, restart, health. The script re-executes itself after the fast-forward, so a merge that changes it takes effect in that same deploy. A failed build stops before the restart and marks the run red; the service keeps serving the previous binary.

### Install or re-register the runner

On the VPS, as `ale`:

```sh
token=$(gh api -X POST \
  repos/alesierraalta/learning/actions/runners/registration-token --jq .token)
RUNNER_TOKEN="$token" bash ~/learning/deploy/vps/install-runner.sh
```

`gh` is only needed to mint the token; Settings → Actions → Runners → New self-hosted runner in the GitHub UI prints an equivalent `config.sh` command. The installer downloads the latest runner, verifies its SHA-256, registers it with the label `learning-vps`, and enables the `github-runner` user unit (lingering is already enabled for `ale`). The runner needs outbound HTTPS to GitHub only.

Check it:

```sh
systemctl --user status github-runner
journalctl --user -u github-runner -f
gh api repos/alesierraalta/learning/actions/runners \
  --jq '.runners[] | {name,status,busy}'
```

Re-register after deleting the runner in GitHub: `systemctl --user disable --now github-runner`, delete `~/actions-runner`, and run the installer again.

### Operating delivery

- A failed deploy is visible in the repository's Actions tab and in `journalctl --user -u learning-studio`.
- Retry from Actions → **Deploy studio** → **Run workflow**, or run `bash ~/learning/deploy/vps/update.sh` over SSH as `ale`.
- To stop automatic delivery, disable the workflow in the Actions tab or stop the runner (`systemctl --user disable --now github-runner`); manual updates keep working.
- The runner runs as `ale`, the same account that owns the vault, the studio token and Pi's credentials. The repository is public, so never approve a fork workflow run that targets the self-hosted runner; the deploy workflow only uses `push` to `main` and `workflow_dispatch`.

After editing the environment file, run `systemctl --user restart learning-studio`. After changing the unit, rerun the installer and restart the service (enabling an already active unit does not restart it).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Port taken / restart loop | Free 4747 or 4748; public mode deliberately fails rather than choosing another port. Inspect the journal. |
| Host not allowed | Confirm both public origins in `~/.config/learning-studio.env` match the hostname and ports above; restart. |
| Microphone unavailable | Use the HTTPS ZeroTier entry, not a plain-HTTP address, and accept the certificate warning once (or trust the Infra Root CA). Grant browser microphone permission. |
| User bus unavailable | Install from an actual login as `ale`, not a root shell; ensure systemd user services are available. |
| Pi not found or not authenticated | Check the env file's full `PATH`, profile setup and the user's own Pi login. |
| HTTPS check fails | `docker logs learning-studio-caddy`; confirm the ZeroTier interface is up (`zerotier-cli listnetworks`) and the certificate still lists `IP:10.154.59.151`. Do not touch the other Caddy containers. |
