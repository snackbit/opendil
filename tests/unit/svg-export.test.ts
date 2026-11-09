// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DilExportError,
  embeddedFonts,
  exportSvg,
  rasterizeSvg,
  standaloneSvg,
} from "../../packages/opendil/src/dil/export/svg-export";

const DIAGRAM =
  '<svg id="d" width="100%" style="max-width: 240px;" viewBox="0 0 240 120" role="graphics-document"><text>A B</text></svg>';

describe("standalone SVG", () => {
  it("sizes an inline diagram to its viewBox, with its namespace", () => {
    const { markup, width, height } = standaloneSvg(DIAGRAM);
    expect([width, height]).toEqual([240, 120]);
    const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
    const root = parsed.documentElement;
    expect(root.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(root.getAttribute("width")).toBe("240");
    expect(root.getAttribute("height")).toBe("120");
    expect(root.textContent).toBe("A B");
  });
  it("falls back to pixel width and height without a viewBox", () => {
    const { width, height } = standaloneSvg(
      '<svg width="30px" height="20"></svg>',
    );
    expect([width, height]).toEqual([30, 20]);
  });
  it("reports markup it cannot export with a stable code", () => {
    const code = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        return error instanceof DilExportError ? error.code : "other";
      }
      return "none";
    };
    expect(code(() => standaloneSvg("<div>no svg</div>"))).toBe("invalid-svg");
    expect(code(() => standaloneSvg('<svg width="100%"></svg>'))).toBe(
      "missing-size",
    );
  });
  it("exports an SVG file", async () => {
    const file = exportSvg(DIAGRAM);
    expect(file.type).toBe("image/svg+xml;charset=utf-8");
    expect(await file.text()).toContain('viewBox="0 0 240 120"');
  });
});

describe("rasterizing", () => {
  it("accepts only whole scales from 1x to 4x on transparent or white", async () => {
    await expect(
      // @ts-expect-error Zero is outside the public raster scale contract.
      rasterizeSvg(DIAGRAM, { scale: 0, background: "white" }),
    ).rejects.toMatchObject({ code: "invalid-options" });
    await expect(
      rasterizeSvg(DIAGRAM, { scale: 2, background: "black" as "white" }),
    ).rejects.toMatchObject({ code: "invalid-options" });
  });
  it("refuses PNGs past the canvas limit before drawing", async () => {
    await expect(
      rasterizeSvg('<svg viewBox="0 0 5000 100"></svg>', {
        scale: 4,
        background: "transparent",
      }),
    ).rejects.toMatchObject({ code: "too-large" });
  });
});

describe("drawing the PNG", () => {
  const drawn: string[] = [];
  let decode: () => Promise<void>;
  let encoded: Blob | null;
  beforeEach(() => {
    drawn.length = 0;
    decode = () => Promise.resolve();
    encoded = new Blob(["png"], { type: "image/png" });
    // happy-dom decodes no images and has no 2D canvas: record the calls.
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode() {
          return decode();
        }
      },
    );
    const context = {
      set fillStyle(color: string) {
        drawn.push("fill " + color);
      },
      fillRect: (...box: number[]) => drawn.push("rect " + box.join(",")),
      drawImage: (image: { src: string }, ...box: number[]) =>
        drawn.push(
          `image ${image.src.startsWith("data:image/svg+xml") ? "svg" : "other"} ${box.join(",")}`,
        ),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      function (this: HTMLCanvasElement, callback: BlobCallback) {
        drawn.push(`encode ${this.width}x${this.height}`);
        callback(encoded);
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it.each([1, 2, 3, 4] as const)(
    "draws the SVG at %ix its natural size on white",
    async (scale) => {
      const png = await rasterizeSvg(DIAGRAM, { scale, background: "white" });
      expect(png.type).toBe("image/png");
      expect(drawn).toEqual([
        "fill #ffffff",
        `rect 0,0,${240 * scale},${120 * scale}`,
        `image svg 0,0,${240 * scale},${120 * scale}`,
        `encode ${240 * scale}x${120 * scale}`,
      ]);
    },
  );
  it("leaves the background transparent by default", async () => {
    await rasterizeSvg(DIAGRAM, { scale: 1, background: "transparent" });
    expect(drawn).toEqual(["image svg 0,0,240,120", "encode 240x120"]);
  });
  it("reports images the browser cannot decode or encode", async () => {
    decode = () => Promise.reject(new Error("broken"));
    await expect(
      rasterizeSvg(DIAGRAM, { scale: 1, background: "white" }),
    ).rejects.toMatchObject({ code: "decode-failed" });
    decode = () => Promise.resolve();
    encoded = null;
    await expect(
      rasterizeSvg(DIAGRAM, { scale: 1, background: "white" }),
    ).rejects.toMatchObject({ code: "encode-failed" });
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(
      rasterizeSvg(DIAGRAM, { scale: 1, background: "white" }),
    ).rejects.toMatchObject({ code: "encode-failed" });
  });
});

describe("embedding web fonts", () => {
  let sheet: HTMLStyleElement;
  beforeEach(() => {
    // A framework-style sheet: the font the diagram uses sits in an @media
    // block, next to one it does not use.
    sheet = document.createElement("style");
    sheet.textContent = [
      '@media screen{@font-face{font-family:"Inter";src:url(/fonts/inter.woff2)}}',
      "@font-face{font-family:Mono;src:url(/fonts/mono.woff2)}",
      '@font-face{font-family:"Broken";src:url("/fonts/broken.woff2?a=1&b=2")}',
      '@font-face{font-family:"Offline";src:url(/fonts/offline.woff2),url("data:font/woff2;base64,AA")}',
    ].join("");
    document.head.append(sheet);
  });
  afterEach(() => {
    sheet.remove();
    vi.unstubAllGlobals();
  });
  it("inlines the fonts the SVG names as data URLs, as well-formed XML", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", (url: URL) => {
      requested.push(url.pathname);
      if (url.pathname.endsWith("offline.woff2"))
        return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve(
        url.pathname.endsWith("broken.woff2")
          ? new Response(null, { status: 404 })
          : new Response(new Blob(["font"], { type: "font/woff2" })),
      );
    });
    const markup = await embeddedFonts(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text font-family="Inter, Broken, Offline, sans-serif">A</text></svg>',
    );
    expect(requested.sort()).toEqual([
      "/fonts/broken.woff2",
      "/fonts/inter.woff2",
      "/fonts/offline.woff2",
    ]);
    const style = new DOMParser()
      .parseFromString(markup, "image/svg+xml")
      .querySelector("style")?.textContent;
    expect(style).toContain('url("data:font/woff2;base64,');
    expect(style).not.toContain("Mono");
    // A font that could not be read keeps its URL; its & stays text in XML.
    expect(markup).toContain("a=1&amp;b=2");
    expect(style).toContain("a=1&b=2");
  });
  it("reads imported sheets, resolves fonts against their sheet, and skips sheets it cannot read", async () => {
    const sheetWith = (css: string) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      return sheet;
    };
    const imported = sheetWith(
      "@font-face{font-family:Imported;src:url(/fonts/imported.woff2)}",
    );
    const own = sheetWith(
      "@font-face{font-family:Outer;src:url(../fonts/outer.woff2)}",
    );
    const crossOrigin = {
      get cssRules(): CSSRuleList {
        throw new DOMException("Not allowed", "SecurityError");
      },
    };
    const remote = {
      href: "https://cdn.example/css/site.css",
      cssRules: [{ styleSheet: imported }, ...Array.from(own.cssRules)],
    };
    vi.spyOn(document, "styleSheets", "get").mockReturnValue([
      crossOrigin,
      remote,
    ] as unknown as StyleSheetList);
    const requested: string[] = [];
    vi.stubGlobal("fetch", (url: URL) => {
      requested.push(url.href);
      return Promise.resolve(new Response(new Blob(["font"])));
    });
    await embeddedFonts(
      '<svg viewBox="0 0 1 1"><text font-family="Imported, Outer">A</text></svg>',
    );
    expect(requested).toContain("https://cdn.example/fonts/outer.woff2");
    expect(requested.some((url) => url.endsWith("/fonts/imported.woff2"))).toBe(
      true,
    );
    vi.restoreAllMocks();
  });
  it("leaves an SVG that names no web font unchanged", async () => {
    const svg = '<svg viewBox="0 0 10 10"><text>A</text></svg>';
    expect(await embeddedFonts(svg)).toBe(svg);
  });
});
