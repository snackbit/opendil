/*
 * Export helpers for rendered diagrams. They need a browser only when called:
 * importing them reads no window or document.
 */
export type DilRasterScale = 1 | 2 | 3 | 4;
export type DilRasterBackground = "transparent" | "white";
export interface DilRasterizeOptions {
  scale: DilRasterScale;
  background: DilRasterBackground;
}
export type DilExportErrorCode =
  | "invalid-svg"
  | "missing-size"
  | "invalid-options"
  | "too-large"
  | "decode-failed"
  | "encode-failed";
/** Why an export failed, as a stable `code`. */
export class DilExportError extends Error {
  readonly code: DilExportErrorCode;
  constructor(
    code: DilExportErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DilExportError";
    this.code = code;
  }
}
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SCALES: readonly number[] = [1, 2, 3, 4];
// Browsers refuse canvases past about 16k pixels on a side.
const CANVAS_LIMIT = 16384;

export interface StandaloneSvg {
  /** A complete SVG document with its namespace and a pixel size. */
  markup: string;
  width: number;
  height: number;
}
function length(value: string | null): number | undefined {
  if (value === null || !/^\s*[\d.]+(?:px)?\s*$/.test(value)) return undefined;
  const parsed = Number.parseFloat(value);
  return parsed > 0 ? parsed : undefined;
}
/**
 * Parses SVG markup, as rendered inline or as a file, into a standalone
 * document sized to its natural dimensions: the viewBox, or numeric width
 * and height attributes.
 */
export function standaloneSvg(svg: string): StandaloneSvg {
  // The HTML parser reads inline SVG as the page did, including entities
  // such as &nbsp; that an XML parser rejects.
  const parsed = new DOMParser().parseFromString(svg, "text/html");
  const root = parsed.body.querySelector("svg");
  if (!root || root.namespaceURI !== SVG_NAMESPACE)
    throw new DilExportError("invalid-svg", "The markup has no SVG element.");
  const box = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const width =
    box?.length === 4 && box[2] && box[2] > 0
      ? box[2]
      : length(root.getAttribute("width"));
  const height =
    box?.length === 4 && box[3] && box[3] > 0
      ? box[3]
      : length(root.getAttribute("height"));
  if (!width || !height)
    throw new DilExportError(
      "missing-size",
      "The SVG has no viewBox or pixel width and height.",
    );
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  return {
    markup: new XMLSerializer().serializeToString(root),
    width,
    height,
  };
}
/** The SVG as a standalone `image/svg+xml` file, ready to download. */
export function exportSvg(svg: string): Blob {
  return new Blob([standaloneSvg(svg).markup], {
    type: "image/svg+xml;charset=utf-8",
  });
}
function fontFamilies(markup: string): Set<string> {
  const families = new Set<string>();
  for (const match of markup.matchAll(/font-family\s*[:=]\s*["']?([^;"'>]+)/gi))
    for (const family of (match[1] ?? "").split(","))
      families.add(
        family
          .trim()
          .replace(/^["']|["']$/g, "")
          .toLowerCase(),
      );
  return families;
}
function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}
/**
 * Every @font-face rule of a stylesheet, with the URL its font files are
 * relative to. Rules inside @layer, @media and @supports blocks and in
 * imported sheets count too: CSS frameworks often put fonts there.
 */
function* fontFaceRules(
  sheet: CSSStyleSheet,
): Generator<{ rule: CSSFontFaceRule; base: string }> {
  let list: CSSRuleList;
  try {
    list = sheet.cssRules;
  } catch {
    // Cross-origin stylesheets do not expose their rules.
    return;
  }
  const base = sheet.href ?? document.baseURI;
  const nested = [Array.from(list)];
  for (let rules = nested.pop(); rules; rules = nested.pop())
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) yield { rule, base };
      else if (rule instanceof CSSGroupingRule)
        nested.push(Array.from(rule.cssRules));
      // An @import rule; checked by shape, as not every DOM has CSSImportRule.
      else if ("styleSheet" in rule && rule.styleSheet instanceof CSSStyleSheet)
        yield* fontFaceRules(rule.styleSheet);
    }
}
// The image parses the SVG as XML, where these characters are markup even
// inside a <style> element.
function xmlText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
/**
 * An image renders without the page's web fonts, so the @font-face rules the
 * SVG uses are copied in with their files as data URLs. System fonts need
 * nothing. A font that cannot be read leaves the PNG in a fallback font.
 */
export async function embeddedFonts(markup: string): Promise<string> {
  const families = fontFamilies(markup);
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets))
    for (const { rule, base } of fontFaceRules(sheet)) {
      const family = rule.style
        .getPropertyValue("font-family")
        .trim()
        .replace(/^["']|["']$/g, "")
        .toLowerCase();
      if (!families.has(family)) continue;
      let text = rule.cssText;
      for (const match of text.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) {
        const source = match[2];
        if (!source || source.startsWith("data:")) continue;
        try {
          const response = await fetch(new URL(source, base));
          if (!response.ok) continue;
          text = text.replace(
            match[0],
            `url("${await dataUrl(await response.blob())}")`,
          );
        } catch {
          continue;
        }
      }
      rules.push(text);
    }
  if (!rules.length) return markup;
  const style = `<style>${xmlText(rules.join("\n"))}</style>`;
  return markup.replace(/<svg\b[^>]*>/, (open) => open + style);
}
/**
 * Draws the SVG to a PNG at 1x, 2x, 3x or 4x its natural size, on a transparent
 * or white background, with the web fonts it uses embedded.
 */
export async function rasterizeSvg(
  svg: string,
  options: DilRasterizeOptions,
): Promise<Blob> {
  if (
    !SCALES.includes(options.scale) ||
    (options.background !== "transparent" && options.background !== "white")
  )
    throw new DilExportError(
      "invalid-options",
      "Scale must be 1, 2, 3 or 4 and background transparent or white.",
    );
  const { markup, width, height } = standaloneSvg(svg);
  const pixelWidth = Math.ceil(width * options.scale);
  const pixelHeight = Math.ceil(height * options.scale);
  if (pixelWidth > CANVAS_LIMIT || pixelHeight > CANVAS_LIMIT)
    throw new DilExportError(
      "too-large",
      `A ${pixelWidth}×${pixelHeight} PNG exceeds the ${CANVAS_LIMIT} pixel canvas limit.`,
    );
  const image = new Image();
  image.src =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(await embeddedFonts(markup));
  try {
    await image.decode();
  } catch (cause) {
    throw new DilExportError("decode-failed", "The SVG could not be drawn.", {
      cause,
    });
  }
  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext("2d");
  if (!context)
    throw new DilExportError("encode-failed", "No 2D canvas is available.");
  if (options.background === "white") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pixelWidth, pixelHeight);
  }
  context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new DilExportError(
                "encode-failed",
                "The PNG could not be encoded.",
              ),
            ),
      "image/png",
    ),
  );
}
