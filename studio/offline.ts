/**
 * A part saved for reading with no connection: one HTML file that carries everything.
 *
 * The bridge serves a part as a page plus its kit, its reader, its pictures, its
 * demos and libraries from a CDN. With no network none of that answers, so the
 * studio asks the bridge for the page once and folds every resource into the file:
 * stylesheets and scripts inline, pictures and demos as `data:` URLs, and the CDN
 * libraries the kit loads on demand in `window.learningOffline`, keyed by the URL the
 * kit would have asked for.
 *
 * Nothing of where the page came from stays in it: the bridge's address, its run
 * token and every route that reaches the tutor are dropped, and the page is told it
 * is a saved copy so it can say what needs a connection.
 *
 * Only two places are ever asked for anything: the bridge the page came from and
 * cdn.jsdelivr.net. A CDN script is taken only when its bytes match the SHA-384 hash
 * pinned next to its URL in the code that loads it; a mismatch refuses the copy.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Fetches one resource. The caller decides how: the bridge in process, the CDN through a cache. */
export type Load = (url: string) => Promise<{ bytes: Buffer; type: string }>;

/**
 * How a saved part is served. `sandbox allow-scripts` gives it an opaque origin, so the
 * author's scripts run but cannot use the studio's token, storage or routes; everything
 * else it needs is inside the file, so it may fetch nothing at all.
 */
export const OFFLINE_CSP = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data:",
  "frame-src data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const CDN_ORIGIN = "https://cdn.jsdelivr.net";
/**
 * A CDN URL followed, in its own statement, by the hash that pins it: no `;`, no line
 * break and no other CDN URL in between, so a hash never pins a neighbour's URL.
 */
const PINNED = /(https:\/\/cdn\.jsdelivr\.net\/npm\/[^\s"'`)]+)(?:(?!https:\/\/cdn\.jsdelivr\.net)[^;\n]){0,80}?(sha384-[A-Za-z0-9+/]+={0,2})/g;
/** Libraries a part needs only when it uses them; everything else on the CDN is always needed. */
const ON_DEMAND: Record<string, (content: string) => boolean> = {
  katex: (content) => /<lk-math\b|\$/.test(content),
  mermaid: (content) => /mermaid/i.test(content),
};
/** What a stylesheet may bring inside it: a WOFF2 font or a picture, never code or another stylesheet. */
const STYLE_ASSET = /\.(?:woff2|png|jpe?g|gif|svg|webp|avif)(?:[?#].*)?$/i;
const NOTE_VIDEO = /<video\b[^>]*>[\s\S]*?<\/video>/gi;
const VIDEO_NOTE = '<p class="offline-note">🎬 El video de esta parte necesita conexión.</p>';
/** The reader's data: the note, its quiz and its demos, as JSON in a script element. */
const VIEW_DATA = /(<script type="application\/json" id="view-data">)([\s\S]*?)(<\/script>)/;
/** Where the reader's data waits while the markup around it is folded. */
const VIEW_DATA_SLOT = "<!--learning-offline:view-data-->";
/** Keys of the reader's data that point at the bridge or the tutor. */
const BRIDGE_KEYS = ["submitUrl", "runUrl", "home", "topicBase", "transcribeUrl", "app", "quizUrl", "video"];

const dataUrl = (bytes: Buffer, type: string) => `data:${type.split(";")[0].trim() || "application/octet-stream"};base64,${bytes.toString("base64")}`;
const sha384 = (bytes: Buffer) => `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
/** Text that sits inside a `<script>` or `<style>` element and must not close it early. */
const inScript = (text: string) => text.replace(/<\/script/gi, "<\\/script");
const inStyle = (text: string) => text.replace(/<\/style/gi, "<\\/style");
/** JSON that sits inside a script element. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(tag)?.[2];
/**
 * A reference made absolute against the page that holds it. A malformed reference
 * refuses the copy with its name instead of leaving a hole in the saved page.
 */
const resolve = (ref: string, base: string): URL => {
  try {
    return new URL(ref, base);
  } catch {
    throw new Error(`cannot resolve ${JSON.stringify(ref)} against ${base}`);
  }
};
const isCdn = (url: string) => resolve(url, CDN_ORIGIN).origin === CDN_ORIGIN;
/** The CDN package a URL belongs to: `katex` for `.../npm/katex@0.16.22/...`. */
const packageOf = (url: string) => /\/npm\/(@?[^@/]+)/.exec(url)?.[1] ?? "";

/**
 * One document of the copy: the part itself or one of its demos. Each is its own page
 * in the browser, so each carries the on-demand libraries its own content uses.
 */
type Page = {
  /** What the document shows, without the tags that load code: it decides which libraries travel. */
  content: string;
  /** On-demand CDN libraries its scripts may ask for, by URL. */
  libraries: Map<string, string>;
  /** CDN libraries already inlined as a script tag: never shipped a second time. */
  inlined: Set<string>;
};

class Snapshot {
  private readonly page: string;
  private readonly load: Load;
  private readonly bridge: string;
  /** Run tokens that must never reach the device: the bridge's, and any the caller names. */
  private readonly secrets: string[];
  private readonly pins = new Map<string, string>();
  private readonly cache = new Map<string, Promise<{ bytes: Buffer; type: string }>>();

  constructor(page: string, load: Load, secrets: string[]) {
    this.page = page;
    this.load = load;
    this.bridge = resolve(page, page).origin;
    const [, bridgeToken] = resolve(page, page).pathname.split("/");
    this.secrets = [bridgeToken, ...secrets].filter((secret) => secret && secret.length >= 16);
  }

  build(): Promise<string> {
    return this.document(this.page, 0);
  }

  /** One request per URL, and only to the bridge or the CDN. */
  private fetch(url: string) {
    const origin = resolve(url, url).origin;
    if (origin !== this.bridge && origin !== CDN_ORIGIN) return Promise.reject(new Error(`refusing to fetch ${url}: only the bridge and ${CDN_ORIGIN} serve a saved part`));
    let pending = this.cache.get(url);
    if (!pending) {
      pending = this.load(url);
      this.cache.set(url, pending);
    }
    return pending;
  }

  /** Every CDN URL the code pins, with its hash. */
  private learnPins(text: string) {
    for (const [, url, hash] of text.matchAll(PINNED)) if (!this.pins.has(url)) this.pins.set(url, hash);
  }

  private needed(url: string, page: Page) {
    return ON_DEMAND[packageOf(url)]?.(page.content) ?? true;
  }

  /** The document at `url`, folded, with the on-demand libraries it uses ahead of everything else. */
  private async document(url: string, depth: number): Promise<string> {
    const source = (await this.fetch(url)).bytes.toString("utf8");
    const page: Page = {
      content: source.replace(/<script\b[^>]*\bsrc\s*=[^>]*><\/script>/gi, ""),
      libraries: new Map(),
      inlined: new Set(),
    };
    const html = await this.html(source, url, depth, page);
    const libraries = Object.fromEntries([...page.libraries].filter(([library]) => !page.inlined.has(library)));
    const shim = `<script>window.learningOffline = ${scriptJson(libraries)};</script>`;
    // Checked per document, before a demo is encoded into its page where no search would see it.
    if (this.secrets.some((secret) => html.includes(secret))) throw new Error(`the saved copy of ${url} still names a run token`);
    return /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (head) => `${head}\n${shim}`) : `${shim}\n${html}`;
  }

  /** A CDN script or stylesheet, taken only when its bytes match its pin. */
  private async pinned(url: string): Promise<{ bytes: Buffer; type: string }> {
    const hash = this.pins.get(url);
    if (!hash) throw new Error(`${url} has no pinned hash in the code that loads it`);
    const found = await this.fetch(url);
    if (sha384(found.bytes) !== hash) throw new Error(`${url} does not match the hash pinned for it`);
    return found;
  }

  private async html(source: string, base: string, depth: number, page: Page): Promise<string> {
    this.learnPins(source);
    // Code and styles are text, not markup: their bodies wait in slots while the tags are
    // folded, so a `<img src="${x}">` inside a script is never fetched as a picture.
    const bodies: string[] = [];
    const slot = (body: string) => `<!--learning-offline:${bodies.push(body) - 1}-->`;
    // The reader's data is JSON: it is folded on its own, never edited as markup.
    const data = VIEW_DATA.exec(source);
    let html = this.config(data ? source.replace(data[0], VIEW_DATA_SLOT) : source);
    html = await this.replaceAsync(html, /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi, async ([, open, tag, body, close]) => {
      // A page's own <style> brings its pictures and fonts like any stylesheet.
      const kept = tag.toLowerCase() === "style" ? inStyle(await this.css(body, base)) : body;
      return `${open}${slot(kept)}${close}`;
    });
    html = html.replace(NOTE_VIDEO, VIDEO_NOTE);
    html = await this.replaceAsync(html, /<link\b[^>]*>/gi, async ([tag]) => {
      const href = attr(tag, "href");
      if (!href || !/\brel\s*=\s*(["'])stylesheet\1/i.test(tag)) return "";
      const url = resolve(href, base).href;
      if (isCdn(url) && !this.needed(url, page)) return "";
      const sheet = isCdn(url) ? await this.pinned(url) : await this.fetch(url);
      return `<style>${slot(inStyle(await this.css(sheet.bytes.toString("utf8"), url)))}</style>`;
    });
    html = await this.replaceAsync(html, /<(img|source)\b[^>]*>/gi, ([tag]) => this.inlineAttr(tag, "src", base));
    html = await this.replaceAsync(html, /<iframe\b[^>]*>/gi, async ([tag]) => {
      const src = attr(tag, "src");
      if (!src || src.startsWith("data:") || depth > 1) return tag;
      return tag.replace(src, await this.frame(resolve(src, base).href, depth));
    });
    html = await this.replaceAsync(html, /<script\b([^>]*)\bsrc\s*=\s*(["'])(.*?)\2([^>]*)><!--learning-offline:\d+--><\/script>/gi, async ([, before, , src, after]) => {
      const url = resolve(src, base).href;
      if (isCdn(url)) {
        if (!this.needed(url, page)) return "";
        page.inlined.add(url);
        return `<script>${slot(inScript((await this.pinned(url)).bytes.toString("utf8")))}</script>`;
      }
      const code = (await this.fetch(url)).bytes.toString("utf8");
      await this.script(code, page);
      return `<script${(before + after).replace(/\s+/g, " ").replace(/\s*$/, "")}>${slot(inScript(code))}</script>`;
    });
    html = html.replace(/<!--learning-offline:(\d+)-->/g, (_, index: string) => bodies[Number(index)]);
    if (!data) return html;
    const folded = await this.viewData(data, base, depth);
    return html.replace(VIEW_DATA_SLOT, () => folded);
  }

  /** A script the page loads from the bridge: its on-demand CDN libraries travel with the page. */
  private async script(code: string, page: Page) {
    this.learnPins(code);
    for (const [, url] of code.matchAll(PINNED)) {
      if (page.libraries.has(url) || !this.needed(url, page)) continue;
      const found = await this.pinned(url);
      const text = found.bytes.toString("utf8");
      page.libraries.set(url, /\.css(?:[?#]|$)/.test(url) ? await this.css(text, url) : text);
    }
  }

  /** A stylesheet whose fonts and pictures are inside it. */
  private css(text: string, base: string): Promise<string> {
    return this.replaceAsync(text, /url\(\s*(["']?)([^"')]+)\1\s*\)/g, async ([whole, , ref]) => {
      if (ref.startsWith("data:") || ref.startsWith("#")) return whole;
      const url = resolve(ref, base).href;
      // The browser takes the first font it can read: WOFF2 travels, older formats and
      // anything that is not a font or a picture (an @import, a script) are left empty.
      if (!STYLE_ASSET.test(url)) return "url(data:,)";
      const found = await this.fetch(url);
      return `url(${dataUrl(found.bytes, found.type)})`;
    });
  }

  private async inlineAttr(tag: string, name: string, base: string) {
    const src = attr(tag, name);
    if (!src || src.startsWith("data:")) return tag;
    const found = await this.fetch(resolve(src, base).href);
    return tag.replace(src, dataUrl(found.bytes, found.type));
  }

  /** A demo frame: its own page, folded the same way, as the frame's source. */
  private async frame(url: string, depth: number) {
    return dataUrl(Buffer.from(await this.document(url, depth + 1), "utf8"), "text/html");
  }

  /** The rich page's bridge config keeps who the page is and loses where it came from. */
  private config(html: string) {
    return html.replace(/window\.LEARNING_BRIDGE\s*=\s*(\{[\s\S]*?\});/, (_, json) => {
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(json);
      } catch {
        // An unreadable config only loses the topic and part names.
      }
      return `window.LEARNING_BRIDGE = ${scriptJson({ topic: config.topic, part: config.part, offline: true })};`;
    });
  }

  /** The reader's data: the note's pictures and demos inside, the bridge's routes out. */
  private async viewData(found: RegExpExecArray, base: string, depth: number): Promise<string> {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(found[2]);
    } catch {
      throw new Error(`the reader's data on ${base} is not JSON`);
    }
    for (const key of BRIDGE_KEYS) delete data[key];
    data.offline = true;
    if (typeof data.markdown === "string") {
      let markdown = data.markdown.replace(NOTE_VIDEO, VIDEO_NOTE);
      markdown = await this.replaceAsync(markdown, /(!\[[^\]]*\]\()([^)\s]+)(\))/g, async ([whole, open, src, close]) => {
        if (src.startsWith("data:") || /^https?:/i.test(src)) return whole;
        const image = await this.fetch(resolve(src, base).href);
        return `${open}${dataUrl(image.bytes, image.type)}${close}`;
      });
      data.markdown = await this.replaceAsync(markdown, /<img\b[^>]*>/gi, ([tag]) => this.inlineAttr(tag, "src", base));
    }
    if (Array.isArray(data.demos)) {
      data.demoNames = data.demos.map((path) => String(path).split("/").pop());
      data.demos = await Promise.all(data.demos.map((path) => this.frame(resolve(String(path), base).href, depth)));
    }
    return `${found[1]}${scriptJson(data)}${found[3]}`;
  }

  /** `String.replace` with an async replacer; matches are replaced in place, in order. */
  private async replaceAsync(text: string, pattern: RegExp, replace: (match: RegExpMatchArray) => Promise<string> | string): Promise<string> {
    const matches = [...text.matchAll(pattern)];
    const replaced = await Promise.all(matches.map((match) => replace(match)));
    let out = "";
    let at = 0;
    matches.forEach((match, i) => {
      out += text.slice(at, match.index) + replaced[i];
      at = (match.index ?? 0) + match[0].length;
    });
    return out + text.slice(at);
  }
}

/** The page at `page`, folded into one file that reads with no network and names none of `secrets`. */
export function snapshotPage(page: string, load: Load, secrets: string[] = []): Promise<string> {
  return new Snapshot(page, load, secrets).build();
}

/**
 * Loads a part's resources: the bridge over loopback, the CDN through a disk cache so a
 * library is downloaded once. The cache holds bytes only; every snapshot verifies them
 * against their pin again, so a damaged file in it refuses the copy instead of shipping.
 */
export function partLoader(bridge: string, cacheDir: string): Load {
  const bridgeOrigin = resolve(bridge, bridge).origin;
  const get = async (url: string) => {
    // A redirect is refused: the URL checked against the bridge and the CDN is the one fetched.
    const response = await fetch(url, { redirect: "error" });
    if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
    return { bytes: Buffer.from(await response.arrayBuffer()), type: response.headers.get("content-type") ?? "application/octet-stream" };
  };
  return async (url) => {
    if (resolve(url, url).origin === bridgeOrigin) return get(url);
    const key = createHash("sha256").update(url).digest("hex");
    const body = join(cacheDir, `${key}.bin`);
    const kind = join(cacheDir, `${key}.type`);
    if (existsSync(body) && existsSync(kind)) return { bytes: readFileSync(body), type: readFileSync(kind, "utf8") };
    const found = await get(url);
    mkdirSync(cacheDir, { recursive: true });
    // Written beside and renamed: a half-written file is never read back.
    const temporary = `${body}.${process.pid}.tmp`;
    writeFileSync(temporary, found.bytes);
    writeFileSync(kind, found.type);
    renameSync(temporary, body);
    return found;
  };
}
