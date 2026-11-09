"use client";
import { useCallback, useState, type ChangeEvent } from "react";
import { Copy, Check, WrapText } from "lucide-react";
import { CodeEditor } from "./code-editor";
import { HighlightedCode } from "./highlighted-code";
import { usePortalScope } from "../../../components/ui/overlays/ui-scope";
import { useUiPrimitives } from "../../ui-primitives";
import {
  useRendererEnvironment,
  writeClipboard,
} from "../../renderer-environment";

/** Longer code shows a notice instead; copying stops at a lower bound. */
export const CODE_DISPLAY_LIMIT = 131072;
const COPY_LIMIT = 65536;
type CopyStatus = "idle" | "copying" | "copied" | "failed" | "too-long";
// A refused copy says why: clipboard permissions do not help with length.
const COPY_PROBLEMS: Partial<Record<CopyStatus, string>> = {
  failed: "Could not copy code. Check clipboard permissions.",
  "too-long": `Code is longer than ${COPY_LIMIT.toLocaleString("en-US")} characters, too long to copy.`,
};
export interface CodeFrameProps {
  /** The code as shown and copied. */
  source: string;
  language: string;
  /** Copying waits until the code is final. */
  ready: boolean;
  /** Present for an editable block; the frame then shows the code editor. */
  onChange?: ((event: ChangeEvent<HTMLTextAreaElement>) => void) | undefined;
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
}
/**
 * The code block chrome shared by CodeBlock and Markdown fences: language
 * label, word wrap, copy, and highlighted code, with the host's injected
 * primitives.
 */
export function CodeFrame({
  source,
  language,
  ready,
  onChange,
  presentationRef,
}: CodeFrameProps) {
  const [wrapped, setWrapped] = useState(false);
  // A status belongs to the text it copied; edited or streamed text starts idle.
  const [copy, setCopy] = useState<{ status: CopyStatus; source: string }>({
    status: "idle",
    source,
  });
  const copyStatus = copy.source === source ? copy.status : "idle";
  const { copy: copyText } = useRendererEnvironment();
  const { Button, Tooltip } = useUiPrimitives();
  const { container } = usePortalScope();
  const toggleWrap = useCallback(() => setWrapped((value) => !value), []);
  const copyCode = useCallback(() => {
    if (source.length > COPY_LIMIT) {
      setCopy({ status: "too-long", source });
      return;
    }
    setCopy({ status: "copying", source });
    const action = copyText ? copyText(source) : writeClipboard(source);
    void action.then(
      (ok) => setCopy({ status: ok ? "copied" : "failed", source }),
      () => setCopy({ status: "failed", source }),
    );
  }, [source, copyText]);
  return (
    <div
      ref={presentationRef}
      className="dil-code-block overflow-hidden"
      data-dil-copy="code"
      data-dil-copy-language={language}
      data-word-wrap={wrapped}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground"
        data-dil-copy="skip"
      >
        <span>{language}</span>
        <div className="flex items-center gap-1">
          <Tooltip
            portalContainer={container}
            label={wrapped ? "Disable word wrap" : "Enable word wrap"}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Word wrap"
              aria-pressed={wrapped}
              onClick={toggleWrap}
            >
              <WrapText size={16} />
            </Button>
          </Tooltip>
          <Tooltip
            portalContainer={container}
            label={
              copyStatus === "copied"
                ? "Copied"
                : copyStatus === "failed" || copyStatus === "too-long"
                  ? "Copy failed"
                  : "Copy code"
            }
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Copy code"
              disabled={!ready || copyStatus === "copying"}
              onClick={copyCode}
            >
              {copyStatus === "copied" ? (
                <Check size={16} />
              ) : (
                <Copy size={16} />
              )}
            </Button>
          </Tooltip>
          <span role="status" className="sr-only">
            {copyStatus === "copied" ? "Code copied." : ""}
          </span>
        </div>
      </div>
      {onChange ? (
        <CodeEditor
          source={source}
          language={language}
          ready={ready}
          wrapped={wrapped}
          onChange={onChange}
        />
      ) : (
        <pre className="dil-code-view overflow-x-auto" tabIndex={0}>
          <code>
            <HighlightedCode source={source} language={language} />
          </code>
        </pre>
      )}
      {COPY_PROBLEMS[copyStatus] && (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          {COPY_PROBLEMS[copyStatus]}
        </p>
      )}
    </div>
  );
}
