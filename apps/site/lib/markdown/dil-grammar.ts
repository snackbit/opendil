import type { LanguageRegistration } from "shiki";
import { dilPatterns as p } from "./dil-patterns";

/**
 * TextMate grammar for DIL fences: Markdown prose, tags with attributes,
 * `{#if}`/`{:else}`/`{/each}`/`{@body}` directives, and JavaScript expressions.
 * The playground's Monaco tokenizer (dil-monarch.ts) uses the same patterns.
 */
const expressionBody = [
  { include: "#comment-js" },
  { include: "#string-js" },
  { include: "#braces" },
  { match: p.keyword, name: "keyword.control.dil" },
  { match: p.number, name: "constant.numeric.dil" },
  { match: p.functionName, name: "entity.name.function.dil" },
  { match: p.identifier, name: "variable.other.dil" },
  { match: p.operator, name: "keyword.operator.dil" },
];

export const dilLanguage: LanguageRegistration = {
  name: "dil",
  scopeName: "source.dil",
  displayName: "DIL",
  aliases: ["genui"],
  patterns: [
    { include: "#heading" },
    { include: "#fence" },
    { include: "#comment-html" },
    { include: "#tag" },
    { include: "#directive" },
    { include: "#expression" },
    { include: "#inline-markdown" },
  ],
  repository: {
    heading: { match: p.heading, name: "markup.heading.dil" },
    fence: {
      begin: p.fenceOpen,
      end: p.fenceClose,
      name: "markup.raw.block.dil",
    },
    "comment-html": {
      begin: p.htmlCommentOpen,
      end: p.htmlCommentClose,
      name: "comment.block.dil",
    },
    tag: {
      begin: p.tagOpen,
      beginCaptures: {
        1: { name: "punctuation.definition.tag.begin.dil" },
        2: { name: "entity.name.tag.dil" },
      },
      end: `(${p.tagClose})`,
      endCaptures: { 1: { name: "punctuation.definition.tag.end.dil" } },
      patterns: [
        { include: "#expression" },
        { match: p.quotedString, name: "string.quoted.dil" },
        { match: p.attributeName, name: "entity.other.attribute-name.dil" },
        { match: "=", name: "punctuation.separator.key-value.dil" },
      ],
    },
    directive: {
      begin: p.directive,
      beginCaptures: {
        1: { name: "punctuation.section.embedded.begin.dil" },
        2: { name: "keyword.control.dil" },
        3: { name: "keyword.control.dil" },
      },
      end: p.braceClose,
      endCaptures: { 0: { name: "punctuation.section.embedded.end.dil" } },
      patterns: expressionBody,
    },
    expression: {
      begin: p.braceOpen,
      beginCaptures: { 0: { name: "punctuation.section.embedded.begin.dil" } },
      end: p.braceClose,
      endCaptures: { 0: { name: "punctuation.section.embedded.end.dil" } },
      patterns: expressionBody,
    },
    braces: { begin: p.braceOpen, end: p.braceClose, patterns: expressionBody },
    "comment-js": {
      patterns: [
        { match: p.lineComment, name: "comment.line.double-slash.dil" },
        {
          begin: p.blockCommentOpen,
          end: p.blockCommentClose,
          name: "comment.block.dil",
        },
      ],
    },
    "string-js": { match: p.scriptString, name: "string.quoted.dil" },
    "inline-markdown": {
      patterns: [
        { match: p.inlineCode, name: "markup.inline.raw.dil" },
        { match: p.bold, name: "markup.bold.dil" },
        { match: p.link, name: "markup.underline.link.dil" },
      ],
    },
  },
};
