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
5. Put the data folder in place. The VPS holds the only copy of Learnings at `/home/ale/Learnings`; the app does not read or write the Obsidian vault, and `LEARNING_ROOT` is required (the studio refuses to start without it). Indexes copied from the old vault may still link parts through the vault path: `node tools/relink-index.mjs ~/Learnings` lists them and `--write` rewrites them to topic-relative links. The installer turns it into a Git repository backup only if it already is one (see [Content backup](#content-backup)).
6. Preview and install:
   ```sh
   bash deploy/vps/install.sh --dry-run
   bash deploy/vps/install.sh
   ```
   Dry-run prints planned mutations even when prerequisites are missing, exits nonzero for missing prerequisites, and never runs sudo or systemctl. For a different npm prefix, set `NPM_PREFIX=/your/prefix` before installation. The installer preserves an existing `~/.config/learning-studio.env`; edit its `PATH` yourself if changing prefixes later.

Open **https://learnings.infra.local/** from a device on the ZeroTier network; the bare address **https://10.154.59.151:8445** keeps working as a fallback. HTTPS bridge pages use port **8446** (`https://learnings.infra.local:8446`). The container `learning-studio-caddy` (Caddy, host network, `deploy/vps/Caddyfile`, restarts unless stopped) terminates TLS on port **443** for the name and on **8445**/**8446** for the address, proxying to loopback ports **4747** and **4748** and preserving Host. For microphone capture, keep using HTTPS; accepting the certificate warning once is enough. To read parts with no connection on a device, install the Infra Root CA on it once: a browser registers the studio's service worker only on a certificate it trusts (see [Reading with no connection](studio.md#reading-with-no-connection)); without it the studio still works online. UFW drops unlisted ports, so the installer allows `443/tcp` and `8445:8446/tcp` on the ZeroTier interface only.

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

The VPS holds the only copy of Learnings. The learner data (preferences, suggestions, telemetry) lives in `~/Learnings/learning.db`; each backup run commits a consistent snapshot of it as `learning.db.backup` and ignores the live database files (see docs/studio.md, «Learner data»). To restore, stop the studio and copy the snapshot over `learning.db`. `~/Learnings`
is a Git repository pushed to the private `alesierraalta/learnings` with a repository-scoped
deploy key (`~/.ssh/learnings_deploy`, SSH host alias `github-learnings`). Lesson videos
(`*.mp4`, `*.mov`, `*.webm`) are versioned alongside the notes; Pi's `.pi/` and `.atl/`,
search indexes and local backups stay out (`.gitignore`). Keep individual files below
GitHub's 100 MiB limit; larger future media needs a separate storage decision. The installer enables
`learnings-backup.timer`, which runs `deploy/vps/learnings-backup.sh` hourly: it commits and
pushes only when something changed. Run it now with `systemctl --user start learnings-backup`;
see runs with `journalctl --user -u learnings-backup`.

Before pushing, the script lints every note it is about to publish (`tools/deck-lint.mjs`) and
refuses to publish when a guided deck breaks the structural rules, printing the note and the rule
that failed. The content stays on the machine and the run exits nonzero, so a broken note never
reaches the pushed history. `LEARNINGS_SKIP_DECK_LINT=1` publishes anyway, for the case where the
note must be saved and fixed later — never as the normal path.

The VPS also measures the ink, not only the structure: a word that leaves its box or a caption on an arrow needs a browser, so the backup script runs `tools/deck-gate.mjs` on every changed note when a browser is available, with the same grandfather rule (a note that already failed before the edit is named but published). The pieces it needs, all installed once:

```bash
# Node: Debian's build cannot read the TypeScript the gate imports
curl -fsSL https://nodejs.org/dist/v24.11.1/node-v24.11.1-linux-x64.tar.xz | tar -xJ -C /tmp
mv /tmp/node-v24.11.1-linux-x64 ~/node24
# Playwright and its browser
npm i -g playwright && ~/.npm-global/bin/playwright install --with-deps chromium
```

The script finds them by itself (`~/node24/bin/node`, `~/.npm-global/lib/node_modules/playwright`, `~/.cache/ms-playwright`) and overrides them with `LEARNING_GATE_NODE`, `LEARNING_PLAYWRIGHT_MODULE` and `LEARNING_PLAYWRIGHT_BROWSERS`. If the browser cannot run, it says so and publishes: a broken tool must never stop the backup.

Two layers, on purpose: the VPS checks structure, because it has no browser; the real-ink
measurement (`tools/deck-gate.mjs`, which also catches a word leaving its box or a label sitting
on an arrow) runs where a browser exists: on the authoring machine before publishing a note, and
in the app's test suite. Point it at the whole vault with `node tools/deck-gate.mjs ~/Learnings`.

## Update and operate

```sh
bash ~/learning/deploy/vps/update.sh
journalctl --user -u learning-studio -f
bash ~/learning/deploy/vps/health.sh
```

Update fast-forwards Git, rebuilds and verifies the engine, links the tutor's instructions and verifies the links, restarts the service, and checks health. A failed build stops before restart. Health requires an active service and HTTP 302 at loopback and HTTP 302 at the ZeroTier HTTPS entry verified against the Infra Root CA. It does not verify Pi authentication or vault sync. The same script runs automatically after every merge to `main`; see [Continuous integration and delivery](#continuous-integration-and-delivery).

`update.sh` refuses to run when `~/learning` is on a branch other than `main` or has uncommitted changes, so a hand edit on the server is never pulled over or discarded.

### The restart waits for the tutor

A restart ends whatever turn the studio is running, and a turn killed mid-write is a learner left with an empty chat (issue #194). So the deploy never restarts a busy studio: after the build and the tutor links, and before `systemctl --user restart`, it reads the studio's idle marker and decides what the commit may do now.

The marker is `$XDG_STATE_HOME/learning-studio/busy.json` (`~/.local/state/learning-studio/busy.json` by default, next to `opened.json`): `{"busy": true, "pid": <pid>, "startedAt": <epoch ms>, "topic": <topic or null>}`. The studio writes it when it accepts a turn and removes it when the turn ends; it needs no token, so the deploy reads it as the same user. `deploy/vps/wait-for-idle.sh` asks the studio's own module (`studio/state.ts`) whether the marker holds: a marker whose pid is gone, or whose turn started more than the turn timeout ago (one hour), is a crashed studio's leftover and never blocks a deploy.

The gate does not wait inside a run. If the turn is still running, the commit is **deferred**: the run exits 3 with:

```text
deferring: the tutor is working on <topic>; the studio keeps serving and the next retry restarts it
```

**A deferral is not a failure.** A deferred commit is a **swapped-but-not-restarted** half state, on purpose: `bin/learning` and the tutor links are already the new commit, the studio process keeps serving the previous Node code, and the service is never stopped. That is safe because the engine binary is invoked per call from the same commit and the studio passes it the same flags, and because the retry is idempotent: the tree is already at `origin/main`, the build is reproducible, the links verify, and only the restart is still owed. The workflow reports `deferred, the autodeploy will finish it` and passes. `learning-autodeploy.timer` runs every minute and retries a pending commit each time, with no failure record and so no backoff, until the restart is due. A manual run (*Actions → Deploy studio → Run workflow*) retries it too.

**The deadline ends the turn through the studio.** The first deferral of a commit starts its clock in `deploy-pending` (`<commit> <first seen, epoch seconds>`). Ten minutes after that, `deploy/vps/abort-turn.sh` sends the same abort the page's «Detener» button sends: `POST /<STUDIO_TOKEN>/abort` with the body `{"cause":"update"}`, to the studio on loopback, from the studio's own origin. The token is the path segment every studio route requires. The script reads `STUDIO_TOKEN` and `STUDIO_PORT` from `~/.config/learning-studio.env` the way the shell reads them, and never prints them: curl receives the URL on stdin, so it never reaches argv or the journal. The studio releases the turn and marks it interrupted by an update. The deploy restarts the studio once the idle marker is clear, whatever answer the abort gets: the studio clears the marker before it answers. If the marker still holds, the deploy does not restart. Without `STUDIO_TOKEN` (64 hex characters) in that file the deploy cannot end a turn: it fails with a message that names the setting and restarts nothing.

**One notice after the restart.** The first page that loads after the restart shows one card in the chat: the studio was updated, the interrupted request should be sent again, and the card names the topic. A later page, or a later restart, does not repeat it.

**Rollback on a failed health check.** update.sh records the commit the studio runs in `$XDG_STATE_HOME/learning-studio/live-commit` only after a healthy restart. If `health.sh` fails after a restart, the deploy restores that commit (`git reset --hard`), rebuilds it, restarts the studio, checks it again, and exits 1: the workflow goes red and the journal names the commit it rolled back to. Without a recorded commit the deploy fails, says so, and restores nothing. A commit that keeps failing is retried by the autodeploy's 900 s failure backoff, and each retry restarts the studio twice.

**One deploy at a time.** The workflow and the timer both run update.sh. It takes `deploy.lock` before the pull, and a deploy that finds the lock held exits 3 like a deferral.

**The timer's script lives in this repository.** `deploy/vps/learning-autodeploy.sh` and its `.service` and `.timer` units are the copy the host runs. After a change reaches the host, run `bash ~/learning/deploy/vps/install-autodeploy.sh` as `ale`: it installs the script to `~/.local/bin/learning-autodeploy` and the units to `~/.config/systemd/user/`, runs `systemctl --user daemon-reload`, and, while no live commit is recorded, records the commit the studio runs as the rollback target, taken from the autodeploy's `deployed` record and only when the checkout is at that commit. Otherwise it refuses before it changes anything, and the live commit is written by hand. It restarts nothing: the timer runs the new script on its next tick. Until it has run, the old timer reads a deferral (exit 3) as a failure and backs off for 900 s.

### Tutor instructions

The tutor reads its instructions from outside this repo: the skill `explicacion-interactiva` from `~/.claude/skills/` and `~/.agents/skills/`, and the Learnings `AGENTS.md` (`<LEARNING_ROOT>/AGENTS.md`) that frames a study session. `deploy/vps/update.sh` — and `install.sh` on a first install — links them with `deploy/vps/link-tutor-context.sh`, after the build and before the restart: every directory under `skills/` that has a `SKILL.md` is linked into both skills directories, and `deploy/vps/learnings/AGENTS.md` becomes the Learnings `AGENTS.md`. The Learnings root is the studio's own `LEARNING_ROOT` (from `~/.config/learning-studio.env`), `~/Learnings` by default. Both the deploy and the installer hand that file to the linker with `--env-file <path>`, which sources it in a subshell: a quoted value and an inline `# comment` behave the way the shell defines them, so `LEARNING_ROOT="/srv/learnings"` links `/srv/learnings` and not a directory whose name carries the quote. A missing file falls back to `~/Learnings`, and a `LEARNING_ROOT` that is not an absolute path fails the deploy with `LEARNING_ROOT must be an absolute path` instead of linking relative to whatever directory it ran from.

A live copy that is not a link is moved to `~/.local/share/learning/backups/<stamp>/<path relative to $HOME>` first, never deleted, so an edit made by hand survives the deploy. The script then verifies that every link resolves to the repo path and fails the deploy with the path to fix when one does not; `bash deploy/vps/link-tutor-context.sh --verify` checks them without changing anything.

The studio refuses a tutor turn while a link points elsewhere: it names the drifted path and the fix instead of teaching with a standard nobody reviewed. See [studio](studio.md#tutor-instructions).

## Continuous integration and delivery

`.github/workflows/ci.yml` runs on GitHub-hosted runners for every pull request and every push to `main`: `gofmt`, `go vet`, `go test ./...`, `go test -race ./...`, the engine build, the digest-pinned sandbox images, Playwright Chromium, and the adapter and studio suites. A second job, `Deploy scripts`, runs on pull requests only: it checks every script under `deploy/vps` with `bash -n` and `shellcheck --severity=warning`, so a broken deploy script fails review instead of the next merge. Reproduce it locally with the commands in [README](../README.md#verification); set `PLAYWRIGHT_MODULE` to the global Playwright entry point when the module is installed globally.

`.github/workflows/deploy.yml` runs on the VPS itself, through a repository-scoped self-hosted runner labelled `learning-vps`. It triggers on `push` to `main` and on manual `workflow_dispatch`; pull requests never target it. The job calls `deploy/vps/update.sh`, so delivery follows the same path as a manual update: fast-forward, rebuild, restart, health. The script re-executes itself after the fast-forward, so a merge that changes it takes effect in that same deploy. A failed build stops before the restart and marks the run red; the service keeps serving the previous binary. A deploy that finds a tutor turn still running is deferred: the run exits 3 and passes with a notice, and the autodeploy timer finishes the commit (see [The restart waits for the tutor](#the-restart-waits-for-the-tutor)). A failed health check after the restart rolls back to the commit the studio ran, and the run goes red.

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
- A merge that creates no run at all means the workflow is switched off, not that the deploy failed: `gh workflow list --all` must show **Deploy studio** as `active`, and `gh api repos/alesierraalta/learning/actions/runners` must list the `…-learning` runner as `online` with the `learning-vps` label. With no runner a queued deploy waits forever; with the workflow `disabled_manually` nothing is even queued.
- The runner runs as `ale`, the same account that owns the vault, the studio token and Pi's credentials. The repository is public, so never approve a fork workflow run that targets the self-hosted runner; the deploy workflow only uses `push` to `main` and `workflow_dispatch`.
- `main` is protected: every change arrives through a pull request, force pushes and deletions are refused, and the rule applies to admins too. Nobody, owner included, can rewrite `.github/workflows/deploy.yml` with a direct push. If an emergency direct commit is ever unavoidable, lift the protection on purpose (`gh api -X DELETE repos/alesierraalta/learning/branches/main/protection`), make the change, and restore it the same day; a refused direct push reports `GH006: Protected branch update failed … Changes must be made through a pull request`.

After editing the environment file, run `systemctl --user restart learning-studio`. After changing the unit, rerun the installer and restart the service (enabling an already active unit does not restart it).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| A merge to `main` deploys nothing | Check both switches: `gh workflow list --all` must show **Deploy studio** as `active` (`gh workflow enable "Deploy studio"` if not), and `gh api repos/alesierraalta/learning/actions/runners` must list the runner as `online`. Reinstall it with `deploy/vps/install-runner.sh` and a fresh registration token. |
| Port taken / restart loop | Free 4747 or 4748; public mode deliberately fails rather than choosing another port. Inspect the journal. |
| Host not allowed | Confirm both public origins in `~/.config/learning-studio.env` match the hostname and ports above; restart. |
| Microphone unavailable | Use the HTTPS ZeroTier entry, not a plain-HTTP address, and accept the certificate warning once (or trust the Infra Root CA). Grant browser microphone permission. |
| User bus unavailable | Install from an actual login as `ale`, not a root shell; ensure systemd user services are available. |
| Pi not found or not authenticated | Check the env file's full `PATH`, profile setup and the user's own Pi login. |
| Antigravity says `spawn agy ENOENT` | The `agy` CLI is not on the service's `PATH`. Install it under `~/.local/bin` (the unit and the env example already list it) or add its directory to `PATH` in `~/.config/learning-studio.env`, then `systemctl --user restart learning-studio`. Check with `systemctl --user show learning-studio -p Environment` and `command -v agy` as the same user. |
| HTTPS check fails | `docker logs learning-studio-caddy`; confirm the ZeroTier interface is up (`zerotier-cli listnetworks`) and the certificate still lists `IP:10.154.59.151`. Do not touch the other Caddy containers. |

## Branch preview

A preview shows one branch at a time on the ZeroTier network, without the vault,
Pi or the production credentials. It serves the studio's own UI over fixture
data with the tutor disabled; it is not a second production studio.

The pieces live in `deploy/preview`:

| File | Role |
| --- | --- |
| `preview.mjs` | Entrypoint inside the container: fixture root, studio with `agentDisabled`, two Unix relays. |
| `relay.mjs` | Forwards a Unix socket to a loopback port and makes the socket world-writable, so the proxy user can connect. |
| `sandbox.mjs` | Docker arguments: no network, read-only root and sources, non-root, no capabilities, resource limits. |
| `launcher.mjs` | Validates the provisioned workspace, identity and image, then spawns Docker without a shell. |
| `lifecycle.mjs`, `coordinator.mjs` | One slot: freshness, ownership-scoped close, blocked state after an ambiguous failure. |
| `proxy.mjs` | Two HTTPS sites bound to one address, internal TLS, Unix upstreams. |

Prerequisites the operator owns, because no code here can prove them: a
dedicated workspace whose contents are disposable, an image the operator has
verified, an identity that is not the production user, and one host-wide lock so
only one preview runs. A branch's own code cannot be trusted to honour
`STUDIO_AGENT_DISABLED`; the container is the boundary.

The first real run used uid 65534, `--network=none`, a read-only branch mount and
an exec `/tmp` tmpfs. Inside it, `fetch` to the internet failed, `/home/ale`,
`/home/ale/Learnings`, `/home/ale/.pi` and `/var/run/docker.sock` were absent,
and the studio answered 302 through the relay for its allowed Host while the
production service stayed healthy. That is evidence for those properties only: it
does not prove the proxy, the firewall or the lifecycle.

## Branch preview

A preview shows one branch at a time, on the ZeroTier network, without the vault,
Pi or the production credentials. It is not a replacement for the studio: the
preview serves the studios
