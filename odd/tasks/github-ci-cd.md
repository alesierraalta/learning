# GitHub CI and CD

The `alesierraalta/learning` repository (public, default `main`) has no `.github/workflows`.
This feature adds continuous integration on GitHub-hosted runners and continuous delivery of
the studio to the VPS `alelaptop` (`~/learning`) through a repository-scoped self-hosted runner.
Branch `feat/github-ci-cd`, worktree `~/documents/learning-ci-cd`, based on `origin/main` (`0653e4a`).

## Specs

- **S1** CI on GitHub for the Learnings repository: "Necesito que configures para el repo de Learnings que está en la BPS el CI y C D en GitHub, porfa." Every push to `main` and every pull request runs the repository's own verification: `gofmt` clean, `go vet ./...`, `go test ./... -count=1`, `go test -race ./... -count=1`, `go build -o bin/learning ./cmd/learning`, `node --test integrations/pi/*.test.mjs studio/*.test.mjs`, with Playwright Chromium installed (browser tests run, not skip) and the digest-pinned sandbox images pulled together with their plain tags (code-exercise tests run, not skip).
- **S2** CD transport, user choice: "Runner propio en la VPS (recomendado)". A repository-scoped self-hosted runner on the VPS (label `learning-vps`, systemd user service, lingering) receives the deploy job. No GitHub secret is stored, no new inbound port is opened, and the studio stays ZeroTier/Tailscale only per `docs/deploy-vps.md`.
- **S3** CD trigger, user choice: "Automático al mergear a main (recomendado)". A push to `main` deploys; `workflow_dispatch` allows a manual retry. Pull requests never reach the self-hosted runner, so fork workflows cannot execute on the VPS.
- **S4** The deploy keeps the operator contract documented in `docs/deploy-vps.md`: the live tree is `~/learning` on `main`; `deploy/vps/update.sh` fast-forwards only (`git pull --ff-only`), rebuilds `bin/learning`, restarts `learning-studio`, and finishes with `deploy/vps/health.sh`; a failed build stops before the restart. The deploy fails loudly on a dirty or foreign-branch live tree instead of discarding work.
- **S5** Operation is documented: runner installation and re-registration, where the logs live, how to disable delivery, and the residual risk of a self-hosted runner on a public repository (never approve a fork workflow run).

## Tasks

| ID | Specs | Route | Commit |
|---|---|---|---|
| T1 | S1 | inline: `.github/workflows/ci.yml` (GitHub-hosted job; Go, Node 24, Playwright, sandbox images) | pending |
| T2 | S2, S3 | inline: `.github/workflows/deploy.yml` (self-hosted labels, push to main + dispatch, concurrency) | pending |
| T3 | S4 | inline: `deploy/vps/update.sh` guard + Go PATH; `deploy/vps/install-runner.sh` | pending |
| T4 | S5 | inline: `docs/deploy-vps.md` CI/CD section, README verification pointer | pending |
| T5 | S2 | VPS: install and register the runner, verify online in the repository API | pending |
| T6 | S1-S4 | verify: local suites exactly as CI runs them, `actionlint`, real `update.sh` run on the VPS | pending |
| T7 | S1 | push branch, open PR, watch CI on the pull request | pending |
| T8 | S3 | merge to `main` and watch the first automatic deploy (user decision) | pending |

## Log

- **L1** (user): "Necesito que configures para el repo de Learnings que está en la BPS el CI y C D en GitHub, porfa."
- **L2** (user choices): transport "Runner propio en la VPS (recomendado)"; trigger "Automático al mergear a main (recomendado)".
- **L3** Evidence: `alesierraalta/learning` is public, default `main`, `0653e4a`; no `.github/workflows` and no branch protection. VPS `alelaptop` (4 cores, 7 GB, Ubuntu), `~/learning` on `main` at `0653e4a`, service `learning-studio` active, loopback health 302, Node 24 at `~/.local/node/bin/node`, Go 1.26.5 at `/usr/local/go/bin` (not in the non-login `PATH`), Docker 29, tailnet address `100.97.133.4`, sshd on `:2222`, no `~/actions-runner`.
- **L4** Baseline on the branch before any change: `go test ./...` pass, `go vet` clean, `gofmt -l` empty, adapter suite 82 pass / 9 skip (sandbox images absent), studio suite 21 pass.
- **L5** CI design: one GitHub-hosted job so the built `bin/learning`, the pulled images and Playwright are shared; `PLAYWRIGHT_MODULE` points at the global install because `node --test` does not resolve global modules; `npm root -g` is exported to `$GITHUB_ENV`.
- **L6** CD design: the runner runs as `ale` from a systemd user unit; the deploy job calls the live tree's `update.sh` (single source of truth); `concurrency: deploy-vps` keeps runs serial; the job reports the deployed commit. The runner's default labels already include `self-hosted`, `linux`, `x64`; the custom label `learning-vps` keeps the workflow explicit.
- **L7** Evidence: pulling only the digest-pinned references leaves the plain tags (`python:3.12-alpine`) absent, and the bridge suite probes the tag, so its code-HTTP test skipped; the CI pull step pulls each reference and its tag. With both pulled, `node --test integrations/pi/*.test.mjs studio/*.test.mjs` reports 112 pass, 0 skip. The runner registered as `alelaptop-learning`, labels `self-hosted, Linux, X64, learning-vps`, status online; linger is enabled for `ale`.
