"use client";
import { useCallback, useState, type ChangeEvent } from "react";
import { CodeEditor } from "./code/code-editor";
import { HighlightedCode } from "./code/highlighted-code";
import { Button } from "../../components/ui/controls/button";
import { Tooltip } from "../../components/ui/overlays/tooltip";
import { Copy, Check, WrapText } from "lucide-react";
import { useRendererEnvironment } from "../renderer-environment";
import type { DilDocument } from "../runtime/document";

export interface CodeBlockProps {
  source: string;
  language: string;
  editable: boolean;
  ready: boolean;
  document: DilDocument;
  identity: string;
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
}
export function CodeBlock({
  source,
  language,
  editable,
  ready,
  document,
  identity,
  presentationRef,
}: CodeBlockProps) {
  const [draft, setDraft] = useState(() => document.drafts.get(identity));
  const [wrapped, setWrapped] = useState(false);
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copying" | "copied" | "failed"
  >("idle");
  const { copy: copyText } = useRendererEnvironment();
  const change = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      document.drafts.set(identity, event.target.value);
      setDraft(event.target.value);
      setCopyStatus("idle");
    },
    [document, identity],
  );
  const current = draft ?? source.trim();
  const toggleWrap = useCallback(() => setWrapped((value) => !value), []);
  const copy = useCallback(() => {
    setCopyStatus("copying");
    const action =
      current.length > 65536
        ? Promise.resolve(false)
        : copyText
          ? copyText(current)
          : navigator.clipboard
            ? navigator.clipboard.writeText(current).then(
                () => true,
                () => false,
              )
            : Promise.resolve(false);
    void action.then(
      (ok) => setCopyStatus(ok ? "copied" : "failed"),
      () => setCopyStatus("failed"),
    );
  }, [current, copyText]);
  if (source.length > 131072)
    return <p role="alert">Code block exceeds the display limit.</p>;
  return (
    <div
      ref={presentationRef}
      className="dil-code-block overflow-hidden rounded-lg border bg-muted/50"
      data-word-wrap={wrapped}
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span>{language}</span>
        <div className="flex items-center gap-1">
          <Tooltip label={wrapped ? "Disable word wrap" : "Enable word wrap"}>
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
            label={
              copyStatus === "copied"
                ? "Copied"
                : copyStatus === "failed"
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
              onClick={copy}
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
      {editable ? (
        <CodeEditor
          source={current}
          language={language}
          ready={ready}
          wrapped={wrapped}
          onChange={change}
        />
      ) : (
        <pre className="overflow-x-auto p-4 text-xs leading-6" tabIndex={0}>
          <code>
            <HighlightedCode source={current} language={language} />
          </code>
        </pre>
      )}
      {copyStatus === "failed" && (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          Could not copy code. Check clipboard permissions.
        </p>
      )}
    </div>
  );
}
