const sheets = new WeakMap<Document, CSSStyleSheet>();
function stylesheet(document: Document, css: string) {
  const view = document.defaultView;
  if (!view) throw new Error("Shadow rendering requires a browser document.");
  const sheet = new view.CSSStyleSheet();
  sheet.replaceSync(css);
  return sheet;
}
/** Styles belong to the rendering document; adopted sheets cannot cross documents. */
export function installShadowStyles(root: ShadowRoot, custom: string) {
  const document = root.ownerDocument;
  let base = sheets.get(document);
  if (!base) {
    // The renderer scope inside the root sets color-scheme from its appearance.
    base = stylesheet(
      document,
      ":host{all:initial;display:block;min-width:0}" + __DIL_STYLES__,
    );
    sheets.set(document, base);
  }
  root.adoptedStyleSheets = custom
    ? [base, stylesheet(document, custom)]
    : [base];
}
