// A <Markdown> body ends at the exact "</Markdown>". Its escape is
// bijective: the encoder adds one backslash after "<" in every "<\*/Markdown",
// so an encoded body never contains the closing tag, and the decoder removes
// one backslash from every "<\+/Markdown".
const CLOSING = /<(\\*)\/Markdown/g;
const ESCAPED_CLOSING = /<(\\+)\/Markdown/g;

export function encodeLiteralMarkdown(markdown: string): string {
  return markdown.replace(CLOSING, "<\\$1/Markdown");
}
/**
 * Reads a raw `<Markdown>` body. The line breaks that `literalMarkdown`
 * places after the opening tag and before the closing tag are not content.
 */
export function decodeLiteralMarkdown(body: string): string {
  let text = body.startsWith("\n") ? body.slice(1) : body;
  if (text.endsWith("\n")) text = text.slice(0, -1);
  return text.replace(
    ESCAPED_CLOSING,
    (_match, slashes: string) => "<" + slashes.slice(1) + "/Markdown",
  );
}
/**
 * Wraps Markdown in a `<Markdown>` block, so DIL shows it as Markdown only:
 * braces, tags, and directives in it display literally and never evaluate.
 */
export function literalMarkdown(markdown: string): string {
  return "<Markdown>\n" + encodeLiteralMarkdown(markdown) + "\n</Markdown>";
}
