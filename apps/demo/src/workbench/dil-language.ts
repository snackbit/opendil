import type { languages } from "monaco-editor";

/** Markdown, DIL tags/directives, and nested JavaScript expressions. */
export const dilLanguage: languages.IMonarchLanguage = {
  defaultToken: "",
  tokenizer: {
    root: [
      [/^#{1,6}\s.*$/, "keyword"],
      [/^\s*```.*$/, { token: "comment", next: "@fenced" }],
      [/<!--/, "comment", "@comment"],
      [/(<\/?)([\w-]+)/, ["delimiter", { token: "tag", next: "@tag" }]],
      [/\{[@#/:][\w-]+/, "keyword", "@expression"],
      [/\{/, "delimiter.bracket", "@expression"],
      [/`[^`]*`/, "string"],
      [/\*\*[^*]+\*\*/, "strong"],
      [/\[[^\]]+\]\([^)]+\)/, "string.link"],
    ],
    tag: [
      [/\s+/, ""],
      [/\/?>/, "delimiter", "@pop"],
      [/\{/, "delimiter.bracket", "@expression"],
      [/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/, "string"],
      [/[\w:-]+/, "attribute.name"],
      [/=/, "delimiter"],
    ],
    expression: [
      [/\/\/.*$/, "comment"],
      [/\/\*/, "comment", "@comment"],
      [/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`/, "string"],
      [/\{/, "delimiter.bracket", "@push"],
      [/\}/, "delimiter.bracket", "@pop"],
      [
        /\b(?:const|let|return|if|else|true|false|null|undefined|DIL|GenUI)\b/,
        "keyword",
      ],
      [/\b\d+(?:\.\d+)?\b/, "number"],
      [/[a-zA-Z_$][\w$]*/, "identifier"],
      [/[()[\]]/, "delimiter.bracket"],
      [/[=+*/!?:&|<>%-]+/, "operator"],
      [/\s+/, ""],
    ],
    comment: [
      [/-->|\*\//, "comment", "@pop"],
      [/./, "comment"],
    ],
    fenced: [
      [/^\s*```\s*$/, "comment", "@pop"],
      [/.*$/, "string"],
    ],
  },
};
