import { useCallback } from "react";
import type { DilComponentProps } from "@snackbit/opendil";
import { Button } from "@snackbit/opendil/lib";

function Callout({
  children,
  className,
  config,
  slots,
  presentationRef,
}: DilComponentProps) {
  const label = typeof config.label === "string" ? config.label : "Note";
  return (
    <aside
      ref={presentationRef}
      className={className}
      aria-label="Custom callout"
    >
      <strong className={slots.title}>{label}</strong>
      <div className={slots.body}>{children}</div>
    </aside>
  );
}

function Action({
  children,
  attributes,
  className,
  ready,
  invoke,
  presentationRef,
}: DilComponentProps) {
  const click = useCallback(() => invoke("onClick"), [invoke]);
  return (
    <Button
      type="button"
      ref={presentationRef}
      disabled={!ready || attributes.disabled === true}
      className={className}
      onClick={click}
    >
      {children}
    </Button>
  );
}

export const components = { Callout, button: Action };
