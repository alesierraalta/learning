// The stage in a browser: one server for the page's assets, one Chromium, one
// booted plan. Both the renderer and the craft gate open the stage the same
// way, so a gate verdict describes the frames a render would actually write.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const VIEWPORT = { width: 1920, height: 1080 };
export const STAGE_PATH = "/tools/video/src/page/index.html";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

export function serve(root) {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      // A request is not allowed to end the process: a broken escape is a client
      // error, and a render that dies on one loses every frame it had left.
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
      } catch {
        res.writeHead(400).end("bad request");
        return;
      }
      const path = resolve(root, "." + pathname);
      if (!path.startsWith(root + sep) && path !== root) {
        res.writeHead(403).end("forbidden");
        return;
      }
      if (!existsSync(path) || !statSync(path).isFile()) {
        res.writeHead(404).end("not found");
        return;
      }
      const stream = createReadStream(path);
      stream.on("error", () => res.destroy());
      res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
      stream.pipe(res);
    });
    server.listen(0, "127.0.0.1", () => done({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }));
  });
}

// Playwright is a tool dependency, not a package of this site: prefer a local
// install, then the global one the machine already has.
export async function loadPlaywright(roots = []) {
  const candidates = [];
  if (process.env.PLAYWRIGHT_ROOT) candidates.push(process.env.PLAYWRIGHT_ROOT);
  candidates.push(...roots, execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim());
  for (const root of candidates) {
    for (const entry of [join(root, "playwright", "index.js"), join(root, "playwright-core", "index.js")]) {
      if (existsSync(entry)) {
        const mod = await import(pathToFileURL(entry).href);
        return mod.chromium ? mod : mod.default;
      }
    }
  }
  throw new Error("playwright is not installed; set PLAYWRIGHT_ROOT");
}

// Open the stage on a plan and hand back its pages. The caller owns close().
//
// `pages` boots extra pages in the same browser: capture draws every frame in
// parallel, one page per worker, and one Chromium is enough for that. A second
// browser buys no frames, only another process and its memory. Every page is
// booted on the same plan and the same fonts, so page `k` draws the frame page
// `0` would have drawn: that is what lets the capture run wide without changing
// the film.
export async function openStage(playwright, plan, { root, pages = 1 }) {
  const server = await serve(root);
  const browser = await playwright.chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none"] });
  try {
    const opened = [];
    for (let i = 0; i < Math.max(1, pages); i++) opened.push(await bootPage(browser, `${server.url}${STAGE_PATH}`, plan, root));
    return {
      page: opened[0],
      pages: opened,
      async close() {
        await browser.close();
        server.close();
      },
    };
  } catch (cause) {
    await browser.close();
    server.close();
    throw cause;
  }
}

// One frame leaves the stage as a PNG, and the encoder reads pixels, not the
// bytes that carry them: the compression level is free to be the fast one.
// `optimizeForSpeed` trades a bigger PNG for a shorter encode and leaves every
// pixel alone (the decoded frame is the same frame, compared by hash). It also
// skips what Playwright wraps around the same CDP call — a font-ready wait and
// three more round-trips per frame — which at 30 fps is most of the budget.
// The session belongs to the page, so it is opened once and reused for every
// frame that page draws.
//
// The first capture of a page is the one that can come back as the surface from
// *before* the drawing: the copy request is answered by a frame that was already
// on its way out, so the film opens on a picture nobody drew and every frame
// after it is encoded against that picture. Measured on fresh pages, the paint
// proof had completed in every one of the 60 that were captured and 4 of them
// still carried the empty stage, so waiting for a paint (longer or otherwise) is
// not what settles this: taking the capture is what moves the surface on. So the
// opener is captured until two captures, paced by a painted frame, agree.
//
// Both bounds below are ceilings that stop the render, never fallbacks: a page
// that cannot prove it painted, and a surface that never settles, fail with a
// message instead of handing the encoder a frame nobody drew. The cost is paid
// once per page — two or three captures and a painted frame at the opening, then
// one capture per frame as before.
const OPEN_MS = 30_000;
const OPEN_ATTEMPTS = 5;

export async function frameGrabber(page, { openMs = OPEN_MS, attempts = OPEN_ATTEMPTS } = {}) {
  const context = page.context();
  if (typeof context.newCDPSession !== "function") {
    throw new Error("this browser has no CDP session, so a frame cannot be captured without the slower screenshot path");
  }
  const session = await context.newCDPSession(page);
  const shoot = async () => {
    const { data } = await session.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
    return Buffer.from(data, "base64");
  };
  let opened = false;
  return async function capture() {
    // After the opener the capture follows the drawing: the surface has carried
    // a painted frame, and every frame from here is one capture, measured across
    // every beat and state cut.
    if (opened) return shoot();
    opened = true;
    let image = await shoot();
    for (let attempt = 0; attempt < attempts; attempt++) {
      await painted(page, openMs);
      const next = await shoot();
      if (next.equals(image)) return next;
      image = next;
    }
    throw new Error(
      `the first frame of this page never settled: ${attempts} captures, each after a painted frame, still disagreed with the one before, so the surface never carried the drawing`,
    );
  };
}

// Two frames: the first starts the paint the drawing asked for, the second is
// proof it was committed. A page nobody is showing may never paint, and a render
// must not wait for a frame that is not coming — but it must not film the frame
// it has either.
async function painted(page, openMs) {
  const proven = await page.evaluate((deadline) => new Promise((done) => {
    const guard = setTimeout(() => done(false), deadline);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clearTimeout(guard);
      done(true);
    }));
  }), openMs);
  if (!proven) {
    const waited = openMs >= 1000 ? `${Math.round(openMs / 1000)} s` : `${openMs} ms`;
    throw new Error(`the page did not prove it painted within ${waited}, so the frame it was asked to draw cannot be captured; refusing to encode a frame nobody drew`);
  }
}

// One page, booted on the plan. Both the renderer and the craft gate open the
// stage the same way, so a gate verdict describes the frames a render would
// actually write.
async function bootPage(browser, url, plan, root) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error(`stage error: ${e.message}`));
  const response = await page.goto(url);
  if (!response || !response.ok()) throw new Error(`the stage is not at ${STAGE_PATH} under ${root} (HTTP ${response ? response.status() : "no response"})`);
  const booted = await page.evaluate(() => typeof window.__boot === "function");
  if (!booted) throw new Error(`${STAGE_PATH} loaded but did not boot the stage under ${root}`);
  await page.evaluate((p) => window.__boot(p), plan);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
