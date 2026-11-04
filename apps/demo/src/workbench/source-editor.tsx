import { useEffect, useRef, useState } from "react";
import type { editor } from "monaco-editor";
import { upcomingRange } from "./generated-code";

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
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ value, onChange, onRun, language, label, readOnly });
  useEffect(() => {
    current.current = { value, onChange, onRun, language, label, readOnly };
  }, [value, onChange, onRun, language, label, readOnly]);
  const [instance, setInstance] = useState<editor.IStandaloneCodeEditor | null>(
    null,
  );
  const applying = useRef(false),
    manual = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import("./monaco-setup").then(({ monaco }) => {
      if (cancelled || !host.current) return;
      const props = current.current;
      const model = monaco.editor.createModel(
        props.value,
        props.language === "tsx" ? "typescript" : "dil",
      );
      const view = monaco.editor.create(host.current, {
        model,
        readOnly: props.readOnly,
        ariaLabel: props.label,
        automaticLayout: true,
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 12,
        lineHeight: 21,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        padding: { top: 16, bottom: 16 },
        lineNumbersMinChars: 3,
        stickyScroll: { enabled: false },
        folding: true,
        wordWrap: "off",
        renderLineHighlight: "line",
        accessibilitySupport: "on",
        editContext: false,
      });
      const theme = () =>
        monaco.editor.setTheme(
          document.documentElement.dataset.theme === "dark"
            ? "opendil-dark"
            : "opendil-light",
        );
      theme();
      const observer = new MutationObserver(theme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      const change = view.onDidChangeModelContent(() => {
        if (!applying.current) current.current.onChange?.(view.getValue());
      });
      const scroll = view.onDidScrollChange((event) => {
        if (event.scrollTopChanged && view.hasTextFocus())
          manual.current = true;
      });
      const stopFollowing = () => {
        manual.current = true;
      };
      const element = host.current;
      element.addEventListener("wheel", stopFollowing, { passive: true });
      element.addEventListener("pointerdown", stopFollowing);
      view.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
        current.current.onRun?.(),
      );
      setInstance(view);
      dispose = () => {
        observer.disconnect();
        change.dispose();
        scroll.dispose();
        element.removeEventListener("wheel", stopFollowing);
        element.removeEventListener("pointerdown", stopFollowing);
        view.dispose();
        model.dispose();
      };
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);
  useEffect(() => {
    const model = instance?.getModel();
    if (!instance || !model || model.getValue() === value) return;
    applying.current = true;
    const previous = model.getValue();
    const append = value.startsWith(previous);
    const end = model.getPositionAt(previous.length);
    model.pushEditOperations(
      [],
      [
        {
          range: append
            ? {
                startLineNumber: end.lineNumber,
                startColumn: end.column,
                endLineNumber: end.lineNumber,
                endColumn: end.column,
              }
            : model.getFullModelRange(),
          text: append ? value.slice(previous.length) : value,
        },
      ],
      () => null,
    );
    applying.current = false;
  }, [instance, value]);
  useEffect(() => {
    instance?.updateOptions({ readOnly, ariaLabel: label });
  }, [instance, readOnly, label]);
  useEffect(() => {
    if (!instance) return;
    const decorations = instance.createDecorationsCollection();
    const model = instance.getModel();
    const range =
      generatedLength === undefined || !model
        ? null
        : upcomingRange(model.getValueLength(), generatedLength);
    if (range && model) {
      const start = model.getPositionAt(range.start),
        end = model.getPositionAt(range.end);
      decorations.set([
        {
          range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          },
          options: { inlineClassName: "od-code-upcoming" },
        },
      ]);
    }
    if (model && generatedLength !== undefined && followTail && !manual.current)
      instance.revealPosition(
        model.getPositionAt(Math.min(generatedLength, model.getValueLength())),
      );
    return () => decorations.clear();
  }, [instance, generatedLength, followTail, value]);
  return (
    <div ref={host} className="od-source-editor" data-appearance={appearance} />
  );
}
