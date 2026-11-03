"use client";
import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { installShadowStyles } from "./shadow-styles";
export interface ShadowRendererProps {
  children: ReactNode;
  shadowStyles?: string | undefined;
}
/** DOM/style encapsulation only. Expression isolation remains in the QuickJS worker. */
export function ShadowRenderer({
  children,
  shadowStyles = "",
}: ShadowRendererProps) {
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      const shadow =
        element.shadowRoot ?? element.attachShadow({ mode: "open" });
      installShadowStyles(shadow, shadowStyles);
      setRoot(shadow);
    },
    [shadowStyles],
  );
  return (
    <div ref={attach} data-dil-mode="shadow">
      {root && createPortal(children, root)}
    </div>
  );
}
