/** Rendered content reduced to the semantics both copy formats keep. */
export type Inline =
  | { kind: "text"; value: string }
  | { kind: "strong" | "emphasis" | "deleted"; children: Inline[] }
  | { kind: "code"; value: string }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "image"; src: string; alt: string }
  | { kind: "break" }
  /** A checkbox or switch, or a radio option, with its current state. */
  | { kind: "mark"; control: "check" | "radio"; checked: boolean };
export type Block =
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { kind: "list"; ordered: boolean; start: number; items: Block[][] }
  | { kind: "quote"; children: Block[] }
  | { kind: "code"; language: string; value: string }
  | { kind: "table"; header: Inline[][] | null; rows: Inline[][][] }
  | { kind: "rule" };
