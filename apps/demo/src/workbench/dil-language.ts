import { StreamLanguage } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { tags } from "@lezer/highlight";
interface DilState {
  tag: boolean;
  brace: number;
  quote: string;
}
/** DIL's directives, tags and attribute expressions sit alongside ordinary Markdown. */
const directives = StreamLanguage.define<DilState>({
  startState: () => ({ tag: false, brace: 0, quote: "" }),
  token(stream, state) {
    if (stream.eatSpace()) return null;
    if (state.quote) {
      while (!stream.eol()) {
        const char = stream.next();
        if (char === "\\") stream.next();
        else if (char === state.quote) {
          state.quote = "";
          break;
        }
      }
      return "string";
    }
    if (stream.match(/^\{[@#/:][\w-]+/)) {
      state.brace++;
      return "keyword";
    }
    if (!state.brace && stream.sol() && stream.match(/^#{1,6}\s/)) {
      stream.skipToEnd();
      return "heading";
    }
    if (
      state.brace &&
      stream.match(/^(?:const|return|true|false|DIL|GenUI|if|else|as)\b/)
    )
      return "keyword";
    if (stream.match(/^<\/?[\w-]+/)) {
      state.tag = true;
      return "tagName";
    }
    if (stream.match(/^\/?>/)) {
      state.tag = false;
      return "tagName";
    }
    const char = stream.next();
    if (char === '"' || char === "'" || char === "`") {
      state.quote = char;
      return "string";
    }
    if (char === "{") {
      state.brace++;
      return "brace";
    }
    if (char === "}") {
      state.brace = Math.max(0, state.brace - 1);
      return "brace";
    }
    if (state.brace) {
      if (/\d/.test(char ?? "")) {
        stream.eatWhile(/[\d.]/);
        return "number";
      }
      stream.eatWhile(/[\w$]/);
      return "variableName";
    }
    if (state.tag && /[\w:-]/.test(char ?? "")) {
      stream.eatWhile(/[\w:-]/);
      return "attributeName";
    }
    return null;
  },
  tokenTable: {
    tagName: tags.tagName,
    attributeName: tags.attributeName,
    brace: tags.brace,
  },
});
export function editorLanguage(language: "dil" | "tsx") {
  return language === "tsx"
    ? javascript({ jsx: true, typescript: true })
    : directives;
}
