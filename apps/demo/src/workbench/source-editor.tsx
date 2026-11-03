import { useCallback, useEffect, useRef } from "react";
import { EditorState, Compartment, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { editorLanguage } from "./dil-language";
import { generatedCode, generatedThrough } from "./generated-code";
const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.tagName, tags.heading],
    color: "var(--od-code-keyword, #c5a7ff)",
  },
  {
    tag: [tags.string, tags.attributeName],
    color: "var(--od-code-string, #91d7af)",
  },
  { tag: [tags.number, tags.bool], color: "var(--od-code-number, #f2b685)" },
  {
    tag: [tags.variableName, tags.definition(tags.variableName)],
    color: "var(--od-code-text, #e2e5f0)",
  },
  { tag: tags.comment, color: "var(--od-code-comment, #9aa3bb)" },
]);
const theme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--od-code-canvas, #1b1d29)",
      color: "var(--od-code-text, #e2e5f0)",
      fontSize: "13px",
    },
    ".cm-content": {
      fontFamily: '"IBM Plex Mono", monospace',
      lineHeight: "1.6",
      padding: "20px 0",
      caretColor: "var(--od-code-keyword, #c5a7ff)",
    },
    ".cm-scroller": {
      fontFamily: '"IBM Plex Mono", monospace',
      overflow: "auto",
    },
    ".cm-line": { padding: "0 20px" },
    ".cm-gutters": {
      background: "var(--od-code-canvas, #1b1d29)",
      color: "var(--od-code-comment, #8790a8)",
      border: "none",
      paddingRight: "4px",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "var(--od-code-active, #252938)",
    },
    "&.cm-focused": { outline: "none" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      background: "var(--od-code-selection, #45415f)",
    },
  },
  { dark: true },
);
export interface SourceEditorProps {
  value: string;
  onChange?: ((value: string) => void) | undefined;
  onRun?: (() => void) | undefined;
  readOnly?: boolean;
  language?: "dil" | "tsx";
  label?: string;
  appearance?: "terminal" | "subtle";
  followTail?: boolean;
  generatedLength?: number | undefined;
}
export function SourceEditor({
  value,
  onChange,
  onRun,
  readOnly = false,
  language = "dil",
  label = "DIL source",
  appearance = "subtle",
  followTail = false,
  generatedLength,
}: SourceEditorProps) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null);
  const current = useRef({ onChange, onRun });
  const editable = useRef(new Compartment());
  const initial = useRef({ value, language, label, generatedLength });
  const manual = useRef(false);
  useEffect(() => {
    current.current = { onChange, onRun };
  }, [onChange, onRun]);
  const create = useCallback((parent: HTMLDivElement | null) => {
    host.current = parent;
  }, []);
  useEffect(() => {
    if (!host.current) return;
    const run = () => {
      current.current.onRun?.();
      return true;
    };
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.current.value,
        extensions: [
          basicSetup,
          ...(initial.current.generatedLength === undefined
            ? []
            : [generatedCode]),
          theme,
          syntaxHighlighting(highlight),
          editorLanguage(initial.current.language),
          editable.current.of(EditorState.readOnly.of(false)),
          EditorView.contentAttributes.of((view) => ({
            "aria-label": initial.current.label,
            role: "textbox",
            "aria-multiline": "true",
            spellcheck: "false",
            "aria-readonly": String(view.state.readOnly),
            tabindex: "0",
          })),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              current.current.onChange?.(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            wheel: () => {
              manual.current = true;
              return false;
            },
            touchmove: () => {
              manual.current = true;
              return false;
            },
            pointerdown: () => {
              manual.current = true;
              return false;
            },
            keydown: () => {
              manual.current = true;
              return false;
            },
          }),
          Prec.highest(keymap.of([{ key: "Mod-Enter", run }])),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      const previous = editor.state.doc.toString();
      const append = value.startsWith(previous);
      editor.dispatch({
        changes: append
          ? { from: previous.length, insert: value.slice(previous.length) }
          : { from: 0, to: previous.length, insert: value },
      });
    }
  }, [value, followTail, readOnly]);
  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || generatedLength === undefined) return;
    const end = generatedLength;
    editor.dispatch({ effects: generatedThrough.of(end) });
    if (followTail && !manual.current)
      editor.requestMeasure({
        read: (view) => view.lineBlockAt(end).bottom,
        write: (bottom, view) => {
          view.scrollDOM.scrollTop = Math.max(
            0,
            bottom - view.scrollDOM.clientHeight + 24,
          );
        },
      });
  }, [generatedLength, followTail]);
  return (
    <div
      ref={create}
      className="od-source-editor"
      data-appearance={appearance}
    />
  );
}
