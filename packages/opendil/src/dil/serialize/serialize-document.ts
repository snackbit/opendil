import { readDocument } from "./read-dom";
import { writeHtml } from "./write-html";
import { writeMarkdown } from "./write-markdown";

export interface DilSerializedDocument {
  /** Sanitized `text/html`: semantic elements, safe links, and http(s) images only. */
  html: string;
  /** The same content as `text/plain` Markdown. */
  markdown: string;
}
/**
 * Serializes what an OpenDIL renderer shows now, for a clipboard: headings,
 * emphasis, lists, links, tables, code, and quotes, with interactive widgets
 * in their current state. Inputs give their values, checkboxes and options
 * their marks, charts their title and data table, diagrams their source.
 * Hidden panels, overlays, live regions, status and problem notices,
 * buttons, scripts, and handlers are left out.
 *
 * Pass a renderer's root, such as the element around a `DilRenderer` in
 * host or Shadow DOM mode, or a `MarkdownRenderer`. Elements of the host's
 * own components follow their HTML semantics; mark an element with
 * `data-dil-copy="skip"` to leave it out, or `data-dil-copy-text` to replace it
 * with text.
 */
export function serializeRenderedDocument(
  root: Element,
): DilSerializedDocument {
  // Open shadow roots, such as a Shadow DOM renderer's, are read too.
  const blocks = readDocument(root);
  return { html: writeHtml(blocks), markdown: writeMarkdown(blocks) };
}
