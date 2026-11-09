import type { ComponentType, ReactNode } from "react";

export interface DilMarkdownLinkProps {
  /** A URL that react-markdown's URL filter allowed. */
  href: string;
  title?: string | undefined;
  children: ReactNode;
  /** The block that contains the link is still streaming. */
  streaming: boolean;
}
export interface DilMarkdownImageProps {
  src: string;
  alt: string;
  title?: string | undefined;
}
export interface DilMarkdownCodeProps {
  /** The fence's info string language, or "" for inline code and plain fences. */
  language: string;
  /** Code text without the fence's final line break. */
  source: string;
  /** True for fenced and indented code blocks, false for inline code spans. */
  block: boolean;
  /** The block that contains the code is still streaming. */
  streaming: boolean;
  /** OpenDIL's stock rendering: a Mermaid diagram, a code block, or inline code. */
  Default: ComponentType<Omit<DilMarkdownCodeProps, "Default">>;
}
export interface DilMarkdownHeadingProps {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
  /** Forward to the heading element to take part in progressive reveal. */
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
}
/**
 * Host renderers for Markdown elements, in DIL prose, `<Markdown>` blocks, and
 * `MarkdownRenderer`. Without an override, links render their label as inert
 * text and images render nothing. Raw HTML in Markdown always stays text.
 */
export interface DilMarkdownComponents {
  link?: ComponentType<DilMarkdownLinkProps>;
  image?: ComponentType<DilMarkdownImageProps>;
  code?: ComponentType<DilMarkdownCodeProps>;
  heading?: ComponentType<DilMarkdownHeadingProps>;
  blockquote?: ComponentType<{ children: ReactNode }>;
  /** Replaces the table element; render a table around the rows. */
  table?: ComponentType<{ children: ReactNode }>;
  /**
   * Decides which link and image URLs reach `link` and `image`. Return the
   * URL to use, or undefined to drop it, which renders the label as inert text
   * and the image as nothing. Without it, only relative URLs and the http,
   * https, mailto, irc, ircs, and xmpp schemes pass. In DIL prose, a URL that
   * contains an expression is dropped before this runs.
   */
  urlTransform?: DilMarkdownUrlTransform | undefined;
}
export type DilMarkdownUrlTransform = (
  url: string,
  attribute: "href" | "src",
) => string | undefined;
const PLACEHOLDER = /DILX\d+END/;
/** Applies the host's URL policy, or react-markdown's safe default without one. */
export function markdownUrlTransform(
  transform: DilMarkdownUrlTransform | undefined,
  expressions: boolean,
  fallback: (url: string) => string,
) {
  return (url: string, key: string): string | undefined => {
    if (expressions && PLACEHOLDER.test(url)) return undefined;
    if (!transform) return fallback(url);
    // Markdown carries URLs only in href (links, definitions) and src (images).
    const result = transform(url, key === "src" ? "src" : "href");
    return typeof result === "string" ? result : undefined;
  };
}
/**
 * The URL to give a host override. In DIL prose, a URL that contains an
 * expression placeholder is never passed on: its value is not literal text.
 */
export function hostUrl(
  value: unknown,
  expressions: boolean,
): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  return expressions && PLACEHOLDER.test(value) ? undefined : value;
}
/**
 * Text a host override receives as an attribute (alt, title). In DIL prose its
 * expression placeholders are dropped: attributes are not substituted.
 */
export function hostText(
  value: string | undefined,
  expressions: boolean,
): string | undefined {
  return expressions && value !== undefined
    ? value.replace(/DILX\d+END/g, "")
    : value;
}
