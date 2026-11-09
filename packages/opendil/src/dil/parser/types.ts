export type NodeKind =
  "root" | "element" | "markdown" | "if" | "branch" | "each" | "pending";
/**
 * `incomplete` marks a construct that was still open when the document was
 * finalized: elements keep their completed children, while unfinished opening
 * tags and repeat templates render nothing.
 */
export type NodeStatus = "streaming" | "ready" | "incomplete" | "error";
export interface Attribute {
  expression?: string;
  literal?: string | boolean;
}
export interface DilNode {
  id: number;
  kind: NodeKind;
  name: string;
  attributes: Record<string, Attribute>;
  text: string;
  expressions: string[];
  status: NodeStatus;
  offset: number;
  /** Developer-facing reason for an `error` node; readers see generic wording. */
  error: string;
}
/** A parse problem reported to the host once, with its source offset. */
export interface ParseIssue {
  kind: "syntax" | "incomplete";
  code: "malformed-syntax" | "unfinished-structure";
  message: string;
  offset: number;
}
export interface TreeBatch {
  revision: number;
  nodes: DilNode[];
  links: { parent: number; child: number }[];
  declarations: string[];
  issues: ParseIssue[];
  complete: boolean;
  scanned: number;
}
/** The parser's last reply when a message exceeds its node limit. */
export interface ParserStop {
  stopped: "limit";
  message: string;
}
export type ParserReply = TreeBatch | ParserStop;
export interface StreamInput {
  suffix: string;
  complete: boolean;
  /** Host-registered component names, sent when they change. */
  components?: readonly string[];
}
