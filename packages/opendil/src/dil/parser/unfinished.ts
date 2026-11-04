import type { DilNode, ParseIssue } from "./types";
import type { TagVocabulary } from "./vocabulary";

/** A construct that was still open when the document was finalized. */
interface Unfinished {
  label: string;
  offset: number;
}
/** A tag or brace token that the end of the document cut off. */
export interface CutToken {
  source: string;
  mode: "brace" | "tag";
  offset: number;
  /** The node an unfinished opening tag of a known component created. */
  pending: DilNode | undefined;
}
function tokenLabel({ source, mode, offset }: CutToken) {
  if (mode === "brace") return "an expression or directive";
  if (source.charAt(offset + 1) === "/") return "a closing tag";
  const name = /^<[\w-]*/.exec(source.slice(offset, offset + 66))?.[0];
  return name && name !== "<" ? `the opening tag ${name}` : "a tag";
}
/** Constructs listed at each end of a long report; the middle is counted. */
const LISTED = 4;
/**
 * Marks the open constructs (outermost first) and the cut token's pending node
 * incomplete, so they keep what they completed, and returns one
 * developer-facing report that lists them.
 */
export function finishOpen(
  open: readonly DilNode[],
  token: CutToken | undefined,
): ParseIssue | undefined {
  const unfinished: Unfinished[] = [];
  for (const node of open) {
    node.status = "incomplete";
    if (node.kind === "branch") continue;
    const label =
      node.kind === "element" ? `<${node.name}>` : `{#${node.kind}}`;
    unfinished.push({ label, offset: node.offset });
  }
  if (token?.pending) token.pending.status = "incomplete";
  if (token)
    unfinished.push({ label: tokenLabel(token), offset: token.offset });
  const first = unfinished[0];
  if (!first) return undefined;
  const describe = ({ label, offset }: Unfinished) =>
    `${label} at character ${offset}`;
  const hidden = unfinished.length - 2 * LISTED;
  const list =
    hidden > 1
      ? [
          ...unfinished.slice(0, LISTED).map(describe),
          `${hidden} more`,
          ...unfinished.slice(-LISTED).map(describe),
        ].join(", ")
      : unfinished.map(describe).join(", ");
  return {
    kind: "incomplete",
    message: `The document ended before it was finished. Unfinished: ${list}.`,
    offset: first.offset,
  };
}
/**
 * Whether the rest of a finalized source is a cut-off tag: a strict prefix of
 * the open element's closing tag, a lone "<", or "<" and the start of a
 * component name that is not a name by itself.
 */
export function cutTag(
  rest: string,
  open: string | undefined,
  vocabulary: TagVocabulary,
) {
  const closing = open === undefined ? "" : `</${open}>`;
  if (rest.length < closing.length && closing.startsWith(rest)) return true;
  const name = /^<([A-Za-z][\w-]*)?$/.exec(rest)?.[1];
  return name === undefined
    ? rest === "<"
    : !vocabulary.isComponent(name) && vocabulary.startsName(name);
}
