"use client";
import { useCallback, useState, type ChangeEvent } from "react";
import { CODE_DISPLAY_LIMIT, CodeFrame } from "./code/code-frame";
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
/** The CodeBlock widget: the shared code frame, with drafts kept in the document. */
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
  const change = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      document.drafts.set(identity, event.target.value);
      setDraft(event.target.value);
    },
    [document, identity],
  );
  if (source.length > CODE_DISPLAY_LIMIT)
    return <p role="alert">Code block exceeds the display limit.</p>;
  return (
    <CodeFrame
      source={draft ?? source.trim()}
      language={language}
      ready={ready}
      onChange={editable ? change : undefined}
      presentationRef={presentationRef}
    />
  );
}
