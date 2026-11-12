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
