import { useCallback, useLayoutEffect, useRef, type ChangeEvent } from "react";
import { HighlightedCode } from "./highlighted-code";

/**
 * Text metrics the highlight layer shares with the textarea. Any difference
 * moves the colored text away from the caret and the selection.
 */
export const EDITOR_METRICS = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-feature-settings",
  "font-variant-ligatures",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "tab-size",
  "text-indent",
  "white-space",
  "overflow-wrap",
  "word-break",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "box-sizing",
] as const;
export interface CodeEditorProps {
  source: string;
  language: string;
  ready: boolean;
  wrapped: boolean;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}
export function CodeEditor({
  source,
  language,
  ready,
  wrapped,
  onChange,
}: CodeEditorProps) {
  const highlight = useRef<HTMLPreElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  /** Lays the highlight over the textarea; a scroll only moves it along. */
  const synchronize = useCallback((scrollOnly: boolean) => {
    const layer = highlight.current,
      input = editor.current;
    if (!layer || !input) return;
    if (!scrollOnly) {
      // The stylesheet gives both layers the same code tokens. Copying the
      // textarea's computed metrics keeps them equal even when page CSS,
      // such as a host's base textarea rules, reaches the textarea.
      const computed = getComputedStyle(input);
      for (const property of EDITOR_METRICS)
        layer.style.setProperty(property, computed.getPropertyValue(property));
      // The editor is as tall as its code: no empty rows, no inner scrollbar.
      input.style.height = "auto";
      const frame = input.offsetHeight - input.clientHeight;
      input.style.height = input.scrollHeight + frame + "px";
      layer.style.width = input.offsetWidth + "px";
      layer.style.height = input.offsetHeight + "px";
    }
    layer.scrollTop = input.scrollTop;
    layer.scrollLeft = input.scrollLeft;
  }, []);
  const follow = useCallback(() => synchronize(true), [synchronize]);
  const layout = useCallback(() => synchronize(false), [synchronize]);
  const attach = useCallback(
    (input: HTMLTextAreaElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      editor.current = input;
      if (!input) return;
      // A new width rewraps wrapped code; the height then changes with it.
      let width = input.offsetWidth;
      const measurement = new ResizeObserver(() => {
        if (input.offsetWidth === width) return;
        width = input.offsetWidth;
        layout();
      });
      measurement.observe(input);
      observer.current = measurement;
    },
    [layout],
  );
  useLayoutEffect(layout, [source, wrapped, layout]);
  return (
    <div className="dil-code-editor">
      <pre ref={highlight} aria-hidden="true" className="dil-code-highlight">
        <code>
          <HighlightedCode source={source} language={language} />
          {"\n"}
        </code>
      </pre>
      <textarea
        ref={attach}
        aria-label="Code editor"
        className="dil-code-input"
        disabled={!ready}
        wrap={wrapped ? "soft" : "off"}
        rows={1}
        value={source}
        onChange={onChange}
        onScroll={follow}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
      />
    </div>
  );
}
