// HTML-like prose such as <div class="x"> or <https://example.com> is not DIL.
// Its tag-shaped run stays text; a brace that cannot be an attribute value ends
// the run, so prose like "a<b then {total}" still evaluates its expression.
import { LexicalState } from "./lexical";

/** An autolink scheme such as "<https:"; tagStart has already rejected it as a tag. */
export const AUTOLINK = /^<[A-Za-z][\w-]{1,31}:/;

export class LiteralTag {
  /** Whether the run ended with its own ">". */
  closed = false;
  private equals = false;
  private quote = "";
  private braces: LexicalState | null = null;

  constructor(private readonly autolink = false) {}

  /**
   * Returns how many characters at char belong to the literal run, or 0 when
   * the run ends before char. A run never continues past its line.
   */
  step(char: string, next: string): number {
    if (char === "\n") return 0;
    if (this.braces) {
      const taken = this.braces.consume(char, next);
      if (this.braces.neutral && this.braces.depth === 0) {
        this.braces = null;
        this.equals = false;
      }
      return taken;
    }
    if (this.quote) {
      if (char === this.quote) {
        this.quote = "";
        this.equals = false;
      }
      return 1;
    }
    if (char === ">") {
      this.closed = true;
      return 1;
    }
    // An autolink cannot contain spaces or "<"; its braces are part of the URL.
    if (this.autolink) return /[\s<]/.test(char) ? 0 : 1;
    if (char === "{") {
      if (!this.equals) return 0;
      this.braces = new LexicalState();
      this.braces.depth = 1;
      return 1;
    }
    if (this.equals && (char === '"' || char === "'")) {
      this.quote = char;
      return 1;
    }
    if (char === "=") this.equals = true;
    else if (!/\s/.test(char)) this.equals = false;
    return 1;
  }
}
