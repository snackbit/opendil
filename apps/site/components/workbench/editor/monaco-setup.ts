import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/typescript/register";
import { dilLanguage } from "@/lib/markdown/dil-monarch";

// One base worker serves every label; the DIL tokenizer is Monarch and needs no language worker.
globalThis.MonacoEnvironment = {
  getWorker: () =>
    new Worker(new URL("./editor.worker.ts", import.meta.url), {
      type: "module",
    }),
};
monaco.languages.register({ id: "dil", extensions: [".dil"] });
monaco.languages.setMonarchTokensProvider("dil", dilLanguage);
monaco.languages.setLanguageConfiguration("dil", {
  comments: { blockComment: ["<!--", "-->"] },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
});
for (const dark of [false, true]) {
  monaco.editor.defineTheme(dark ? "opendil-dark" : "opendil-light", {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: dark ? "C5A7FF" : "4935D0" },
      { token: "tag", foreground: dark ? "C5A7FF" : "4935D0" },
      { token: "attribute.name", foreground: dark ? "91D7AF" : "16794B" },
      { token: "string", foreground: dark ? "91D7AF" : "16794B" },
      { token: "number", foreground: dark ? "F2B685" : "9A5B00" },
      { token: "comment", foreground: dark ? "979FB3" : "70798A" },
    ],
    colors: {
      "editor.background": dark ? "#232735" : "#F6F7F9",
      "editor.foreground": dark ? "#F1F2F8" : "#252838",
      "editorLineNumber.foreground": dark ? "#979FB3" : "#70798A",
      "editor.lineHighlightBackground": dark ? "#2D3242" : "#EEF0F4",
      "editor.selectionBackground": dark ? "#6559AD" : "#CDC7FF",
    },
  });
}
export { monaco };
