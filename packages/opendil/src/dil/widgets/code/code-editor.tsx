import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type UIEvent,
} from "react";
import { Textarea } from "../../../components/ui/controls/textarea";
import { HighlightedCode } from "./highlighted-code";
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
  const synchronize = useCallback(() => {
    const layer = highlight.current,
      input = editor.current;
    if (!layer || !input) return;
    layer.style.width = input.clientWidth + "px";
    layer.style.height = input.clientHeight + "px";
    layer.scrollTop = input.scrollTop;
    layer.scrollLeft = input.scrollLeft;
  }, []);
  const scroll = useCallback(
    (_event: UIEvent<HTMLTextAreaElement>) => synchronize(),
    [synchronize],
  );
  const attach = useCallback(
    (input: HTMLTextAreaElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      editor.current = input;
      if (input) {
        const measurement = new ResizeObserver(synchronize);
        measurement.observe(input);
        observer.current = measurement;
      }
    },
    [synchronize],
  );
  useLayoutEffect(synchronize, [source, wrapped, synchronize]);
  return (
    <div className="dil-code-editor">
      <pre ref={highlight} aria-hidden="true" className="dil-code-highlight">
        <code>
          <HighlightedCode source={source} language={language} />
          {"\n"}
        </code>
      </pre>
      <Textarea
        ref={attach}
        aria-label="Code editor"
        className="min-h-64 w-full min-w-0 rounded-none border-0 shadow-none"
        disabled={!ready}
        wrap={wrapped ? "soft" : "off"}
        value={source}
        onChange={onChange}
        onScroll={scroll}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
      />
    </div>
  );
}
