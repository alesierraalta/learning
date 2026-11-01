# offline-reading

Read a part of Learnings with no connection, inside the studio itself: the studio keeps opening and the parts already saved on the device stay readable.
Branch: `feat/offline-reading` (worktree `~/documents/learning-offline`, from `origin/main` 10ef586).

## Specs

S1 — «se debe poder integrar en learnings un modo sin conexión, para poder leer una parte sin tener que estar conectado a internet»
S2 — «debe funcionar dentro de la misma pagina, no debo poder salir de ahi»

Design that follows from S1–S2 (parent decision, L3):

S3 — With no connection the studio still opens at its usual address and shows the library as it was last seen, with an offline notice.
S4 — Every part the learner opens while online is saved on the device. The topic page can save all its written parts at once («Guardar el tema sin conexión»).
S5 — Offline, a saved part opens in the same reader; a part that is not saved says it needs a connection instead of showing an error.
S6 — The saved copy carries the explanation whole: text, figures, formulas, walkthroughs, Mermaid diagrams and demos. What needs the tutor or the network (video, quiz grading, questions to the tutor) says it needs a connection.
S7 — The saved copy runs isolated from the studio: its scripts cannot reach the tutor, the vault or the studio's routes.
S8 — Online, the studio always loads its latest version: a deploy never leaves a device on old assets.

## Tasks

| # | Spec | Deliverable | Commit |
|---|------|-------------|--------|
| T1 | S6, S7 | `studio/offline.ts`: self-contained snapshot of a part (local assets, pinned CDN libraries verified by SRI, demos, images) served at `api/offline` under a sandbox CSP | `d89d1be` |
| T2 | S3, S8 | Service worker on the studio origin: shell, assets and library cached; network first online | `8c15555` |
| T3 | S3, S4, S5 | Studio UI: offline notice, saved marks, save-topic action, reader falls back to the saved copy | `30af877` |
| T4 | S1–S8 | Docs, full suites, real-vault check, iPad prerequisite (trusted Infra Root CA) | `8df28c8` |
| T5 | S6, S7 | Hardening from the independent verification (L12): token checked per document and the studio's token too, pins only within one statement, stylesheets bring only fonts and pictures (also inside `<style>`), no redirects in the loader or the worker's store | `82841b7`, `f00ad4f` |
| T6 | S7 | Hardening from the second independent verification (L14): base64 `data:` URLs decoded before the token check, stylesheet assets judged by path (no query) and by answer type, reader data kept by an allow-list of 10 keys, pins never cross any JavaScript line terminator | pending |

## Log

L1 — alesierraalta (11/01/2026): «se debe poder integrar en learnings un modo sin conexión, para poder leer una parte sin tener que estar conectado a internet»
L2 — alesierraalta (11/01/2026), choosing between an installable app and a downloadable HTML file: «debe funcionar dentro de la misma pagina, no debo poder salir de ahi»
L3 — decision: offline reading lives in the studio origin. A service worker caches the studio; each part is saved as one self-contained HTML snapshot built by the server, because the part pages come from the bridge, another origin that a studio service worker cannot serve. The snapshot is served with `content-security-policy: sandbox allow-scripts`, so author scripts run in an opaque origin and cannot use the studio's token or routes.
L4 — evidence: every page loads marked, DOMPurify, Tinos, KaTeX (0.16.22 in `kit.js`, 0.19.1 in `view/math.js`) and Mermaid 11.6.0 from cdn.jsdelivr.net; Markdown parts render client-side from `view/app.js`; demos are iframes on the bridge's `file/` route; videos are vault attachments.
L5 — prerequisite: Safari registers a service worker only on a certificate the device trusts. The iPad has to trust the Infra Root CA once (today `docs/deploy-vps.md` calls it optional). Loopback (`http://127.0.0.1:4747`) needs nothing.
L6 — evidence: `~/documents/learning` was found on an old branch (`fix/responsive-tsp-followups`) with four stray copies of `main` files, likely a sync from another machine; left untouched, this work uses its own worktree.
L7 — evidence (T1): all seven written parts of the real vault save and read in a browser with no request beyond the file (2.9–3.9 MB each, Mermaid being most of it). Two defects found that way and fixed: demos shared one library map with their page (a demo with KaTeX or Mermaid would have drawn nothing offline), and the kit loaded a library the page already had by tag, so every Markdown note with diagrams downloaded Mermaid twice, online too.
L8 — decision (T2): `deploy/vps/learning-studio.env.example` sets no `STUDIO_TOKEN`, so the token changes on every deploy, and deploys follow every merge. The service worker is therefore served at `/sw.js` (no token, static code) with scope `/`, and caches responses under keys with the token segment removed; a part saved before a deploy still opens after it. Offline, `/` is answered with the saved studio, because the redirect to the token URL needs the server.
L9 — evidence (T3): real vault on an upright iPad (820×1180): «Guardar el tema sin conexión» saved the 3 written SQL parts, each row then read «Guardada en este dispositivo»; with the server stopped and the browser offline, Parte 2 opened in the same reader under the notice «Sin conexión · estás viendo lo guardado en este dispositivo», with «🎬 El video de esta parte necesita conexión.» where its video was.
L10 — evidence (T3): the full suite caught a real defect: saving a part fetched the copy without reading its body, so the request stayed open, its megabytes stayed held and the reader never went idle (5 reader tests timed out). Fixed by reading the body to the end. The shell's `frame-src` now admits `'self'` for the saved copy; the three shell CSP tests pin exactly the bridge plus `'self'`.
L11 — evidence (T4): `node --test studio/*.test.mjs integrations/pi/*.test.mjs` → 242 tests, 233 pass, 0 fail, 9 skipped (code-exercise tests that need Docker images, unrelated). Docs: `docs/studio.md` «Reading with no connection»; `docs/deploy-vps.md` no longer calls the Infra Root CA optional for devices that read offline.
L12 — evidence (independent verification, gentle-ai-verify mvya3g6y-1-4m1d, on 5f9d416): FAIL on S6 and S7. Blocker: the run-token check ran on the final page only, after demos were base64-encoded, so a token inside a demo would survive; the studio's own token was never checked. Also: CSS `url()`/`@import` fetched without a pin; the pin regex crossed statements (up to 200 chars); the loader followed redirects; the worker could keep a redirect-followed answer; `url()` inside a page's own `<style>` was not folded. Self-navigation of the copy: proven in a browser to be blocked by the shell's `frame-src` for any outside URL; within the studio origin only `/` and `/sw.js` answer without a token. External `https://` images in notes stay a deliberate limit. All fixed or documented in T5, each pinned by a test.
L13 — evidence (T5): the full browser suite failed the quick-note flow 1 run in 3 on the branch while main passed 3 of 3 (41/41). Cause: the service worker opened its store and wrote each copy before handing the answer over, so every studio request waited on a cache write. Fixed in `f00ad4f` (answer at once, copy written in the background, the saved-parts question waits for pending writes). After it: three full browser-suite runs at 50/50, the rest of the suites 190 pass / 0 fail / 9 skipped (Docker), and all seven written parts of the real vault still save and read with no extra request.
L14 — evidence (second independent verification, on 2666197, and T6): four gaps in `studio/offline.ts`, all on S7. A token hidden in a base64 `data:` URL (written by the author or by the snapshot) escaped the plain-text check; a stylesheet named `x.css?.png` or answered as CSS under a picture's name was embedded; the reader's data dropped only known bridge keys, so a new key would travel; the pin regex could cross CR, U+2028 or U+2029. Fixed: every base64 payload of each delivered document is decoded and checked; `url()` assets need a font or picture extension on the path and an `image/` or `font/woff2` answer; only `kind, topic, part, title, topicTitle, markdown, quiz, answered, demos, verdicts` are kept (`demoNames` is added after; exercise links already pointed nowhere offline since `topicBase` was removed in T5); the pin stops at every JavaScript line terminator. Checks: `studio/offline.test.mjs` 18/18; full suite 253 tests, 244 pass, 0 fail, 9 skipped (Docker); real vault: all written parts save and read with 0 extra requests and 0 errors, 2.9–3.9 MB, KaTeX and Mermaid drawn, video notes where videos were.
