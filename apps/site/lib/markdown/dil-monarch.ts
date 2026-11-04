import type { languages } from "monaco-editor";
import { dilPatterns as p } from "./dil-patterns";

const re = (source: string) => new RegExp(source);

/**
 * The Monaco (Monarch) tokenizer of the playground editor: Markdown, DIL
 * tags/directives, and nested JavaScript expressions. It uses the patterns of
 * the docs' Shiki grammar (dil-grammar.ts).
 */
export const dilLanguage: languages.IMonarchLanguage = {
  defaultToken: "",
  tokenizer: {
    root: [
      [re(p.heading), "keyword"],
      [re(p.fenceOpen), { token: "comment", next: "@fenced" }],
      [re(p.htmlCommentOpen), "comment", "@comment"],
      [re(p.tagOpen), ["delimiter", { token: "tag", next: "@tag" }]],
      [
        re(p.directive),
        ["keyword", "keyword", { token: "keyword", next: "@expression" }],
      ],
      [re(p.braceOpen), "delimiter.bracket", "@expression"],
      [re(p.inlineCode), "string"],
      [re(p.bold), "strong"],
      [re(p.link), "string.link"],
    ],
    tag: [
      [/\s+/, ""],
      [re(p.tagClose), "delimiter", "@pop"],
      [re(p.braceOpen), "delimiter.bracket", "@expression"],
      [re(p.quotedString), "string"],
      [re(p.attributeName), "attribute.name"],
      [/=/, "delimiter"],
    ],
    expression: [
      [re(p.lineComment), "comment"],
      [re(p.blockCommentOpen), "comment", "@comment"],
      [re(p.scriptString), "string"],
      [re(p.braceOpen), "delimiter.bracket", "@push"],
      [re(p.braceClose), "delimiter.bracket", "@pop"],
      [re(p.keyword), "keyword"],
      [re(p.number), "number"],
      [re(p.identifier), "identifier"],
      [/[()[\]]/, "delimiter.bracket"],
      [re(p.operator), "operator"],
      [/\s+/, ""],
    ],
    comment: [
      [re(`${p.htmlCommentClose}|${p.blockCommentClose}`), "comment", "@pop"],
      [/./, "comment"],
    ],
    fenced: [
      [re(p.fenceClose), "comment", "@pop"],
      [/.*$/, "string"],
    ],
  },
};
