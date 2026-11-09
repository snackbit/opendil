/*
 * SVG from an answer, and the diagrams OpenDIL renders, must load nothing:
 * no remote images, fonts, filters, or stylesheets, which would reveal the
 * reader to a third party. References inside the document (url(#id)) stay.
 */

// A url() whose target is not a fragment of this document.
const NON_LOCAL_URL = /url\(\s*(?!\s*(["']?)#[\w-]+\1\s*\))[^)]*\)?/gi;
// Values that fetch without url(): string image-set() candidates, the
// legacy image() and cross-fade() forms, and CSS Values 4 src("file").
const FETCHING_FUNCTION =
  /(?:-webkit-)?image-set\s*\(|image\s*\(|cross-fade\s*\(|\bsrc\s*\(/i;

/**
 * True when an SVG presentation attribute value is plain data or a local
 * reference. Escapes, protocols, markup and declaration separators are
 * refused outright rather than decoded.
 */
export function isLocalSvgValue(value: string): boolean {
  if (/javascript:|https?:|data:|\/\/|@import|[<;\\]/i.test(value))
    return false;
  if (FETCHING_FUNCTION.test(value)) return false;
  return (
    !/url\s*\(/i.test(value) || /^url\(\s*(["']?)#[\w-]+\1\s*\)$/.test(value)
  );
}
/** CSS text with every rule or value that could fetch removed. */
export function localStyleText(css: string): string {
  // Escapes could spell url( or @import in a form these patterns miss.
  if (css.includes("\\")) return "";
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/@font-face\s*\{[^}]*\}/gi, "")
    .replace(NON_LOCAL_URL, "none")
    .replace(
      /(?:-webkit-)?image-set\s*\([^)]*\)|image\s*\([^)]*\)|cross-fade\s*\([^)]*\)|\bsrc\s*\([^)]*\)/gi,
      "none",
    );
}
const LINK_ATTRIBUTES = new Set(["href", "xlink:href", "src", "srcset"]);
/**
 * Removes everything in a sanitized SVG tree that could fetch: link
 * attributes, attributes with non-local url() values, and remote references
 * in style attributes and style elements.
 */
export function stripRemoteReferences(root: Element): void {
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (element.localName === "style") {
      element.textContent = localStyleText(element.textContent ?? "");
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (LINK_ATTRIBUTES.has(name) || name.startsWith("on"))
        element.removeAttribute(attribute.name);
      else if (name === "style")
        element.setAttribute(attribute.name, localStyleText(attribute.value));
      else if (
        /url\s*\(|@import/i.test(attribute.value) ||
        FETCHING_FUNCTION.test(attribute.value)
      ) {
        if (!isLocalSvgValue(attribute.value))
          element.removeAttribute(attribute.name);
      }
    }
  }
}
