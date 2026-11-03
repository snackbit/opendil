export type NodeKind =
  "root" | "element" | "markdown" | "if" | "branch" | "each" | "pending";
export type NodeStatus = "streaming" | "ready" | "error";
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
  error: string;
}
export interface TreeBatch {
  revision: number;
  nodes: DilNode[];
  links: { parent: number; child: number }[];
  declarations: string[];
  complete: boolean;
  scanned: number;
}
export interface StreamInput {
  suffix: string;
  complete: boolean;
}
