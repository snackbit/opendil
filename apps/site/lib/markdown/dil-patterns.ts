/**
 * Token patterns of DIL source, shared by the Shiki grammar for docs code fences
 * (dil-grammar.ts) and the Monaco tokenizer of the playground (dil-monarch.ts),
 * so both highlight the same way. Each is a regular expression source that is
 * valid in JavaScript and in the Oniguruma flavor of TextMate grammars.
 */
export const dilPatterns = {
  heading: "^#{1,6}\\s.*$",
  fenceOpen: "^\\s*```.*$",
  fenceClose: "^\\s*```\\s*$",
  htmlCommentOpen: "<!--",
  /** HTML also ends a comment at `--!>`. */
  htmlCommentClose: "--!?>",
  /** Groups: the `<` or `</` delimiter, then the tag name. */
  tagOpen: "(</?)([A-Za-z][\\w-]*)",
  tagClose: "/?>",
  attributeName: "[\\w:-]+",
  /** Groups: the brace, the directive sigil, then its name, as in `{#if`, `{:else`, `{/each` or `{@body`. */
  directive: "(\\{)([#/:@])([\\w-]+)",
  braceOpen: "\\{",
  braceClose: "\\}",
  quotedString: "\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'",
  scriptString:
    "\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`",
  keyword:
    "\\b(?:const|let|return|if|else|as|true|false|null|undefined|DIL|GenUI)\\b",
  number: "\\b\\d+(?:\\.\\d+)?\\b",
  functionName: "[A-Za-z_$][\\w$]*(?=\\s*\\()",
  identifier: "[A-Za-z_$][\\w$]*",
  operator: "[=+*/!?:&|<>%-]+",
  lineComment: "//.*$",
  blockCommentOpen: "/\\*",
  blockCommentClose: "\\*/",
  inlineCode: "`[^`]*`",
  bold: "\\*\\*[^*]+\\*\\*",
  link: "\\[[^\\]]+\\]\\([^)]+\\)",
} as const;
