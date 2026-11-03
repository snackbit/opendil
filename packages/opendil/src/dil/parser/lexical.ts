// Resumable lexical state for JavaScript inside braces and tag attributes.
// A final character is deferred until lookahead is available, unless finalizing.
import type { Attribute } from "./types";
export class LexicalState {
  depth = 0;
  quote = "";
  escaped = false;
  comment = "";
  regex = false;
  characterClass = false;
  previous = "";
  templates: number[] = [];

  consume(char: string, next: string): number {
    if (this.comment === "line") {
      if (char === "\n") this.comment = "";
      return 1;
    }
    if (this.comment === "block") {
      if (char === "*" && next === "/") {
        this.comment = "";
        return 2;
      }
      return 1;
    }
    if (this.escaped) {
      this.escaped = false;
      return 1;
    }
    if (this.quote || this.regex) {
      if (char === "\\") {
        this.escaped = true;
        return 1;
      }
      if (this.regex) {
        if (char === "[") this.characterClass = true;
        if (char === "]") this.characterClass = false;
        if (char === "/" && !this.characterClass) {
          this.regex = false;
          this.previous = "v";
        }
      } else if (this.quote === "`" && char === "$" && next === "{") {
        this.templates.push(this.depth);
        this.depth++;
        this.quote = "";
        return 2;
      } else if (char === this.quote) {
        this.quote = "";
        this.previous = "v";
      }
      return 1;
    }
    if (char === "/" && next === "/") {
      this.comment = "line";
      return 2;
    }
    if (char === "/" && next === "*") {
      this.comment = "block";
      return 2;
    }
    if (
      char === "/" &&
      (!this.previous || /[({[=:;,!?&|+*%~<>-]/.test(this.previous))
    ) {
      this.regex = true;
      return 1;
    }
    if (char === '"' || char === "'" || char === "`") this.quote = char;
    else if (char === "{") this.depth++;
    else if (char === "}") {
      this.depth--;
      if (this.templates.at(-1) === this.depth) {
        this.templates.pop();
        this.quote = "`";
      }
    }
    if (!/\s/.test(char)) this.previous = char;
    return 1;
  }

  get neutral() {
    return !this.quote && !this.comment && !this.regex;
  }
}

export function fenceMarker(
  source: string,
  cursor: number,
  current: string,
): string | undefined {
  const char = source.charAt(cursor);
  if (char !== "`" && char !== "~") return undefined;
  const marker = source.slice(cursor, cursor + 3);
  if (marker !== "```" && marker !== "~~~") return undefined;
  if (current && current !== marker) return undefined;
  const prefix = source.slice(source.lastIndexOf("\n", cursor - 1) + 1, cursor);
  return /^ {0,3}$/.test(prefix) ? marker : undefined;
}

export function braceEnd(source: string, start: number): number {
  const state = new LexicalState();
  for (let cursor = start; cursor < source.length;) {
    const char = source[cursor] ?? "";
    cursor += state.consume(char, source[cursor + 1] ?? "");
    if (state.neutral && state.depth === 0) return cursor;
  }
  throw new Error("Unfinished JavaScript expression");
}

export function parseAttributes(source: string): Record<string, Attribute> {
  const result: Record<string, Attribute> = {};
  let cursor = 0;
  while (cursor < source.length) {
    const match = /^\s*([\w:-]+)/.exec(source.slice(cursor));
    if (!match) break;
    const name = match[1];
    if (!name) break;
    cursor += match[0].length;
    while (/\s/.test(source[cursor] ?? "") && cursor < source.length) cursor++;
    if (source[cursor] !== "=") {
      result[name] = { literal: true };
      continue;
    }
    cursor++;
    while (/\s/.test(source[cursor] ?? "") && cursor < source.length) cursor++;
    const char = source[cursor];
    if (char === "{") {
      const end = braceEnd(source, cursor);
      result[name] = { expression: source.slice(cursor + 1, end - 1) };
      cursor = end;
    } else if (char === '"' || char === "'") {
      const end = source.indexOf(char, cursor + 1);
      if (end === -1) throw new Error(`Unfinished attribute ${name}`);
      result[name] = { literal: source.slice(cursor + 1, end) };
      cursor = end + 1;
    } else throw new Error(`Expected quoted value or expression for ${name}`);
  }
  if (source.slice(cursor).trim())
    throw new Error("Invalid component attributes");
  return result;
}
