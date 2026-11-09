"use client";
import type { ReactNode } from "react";
import { useCustomization } from "../customization";
import type { DilRenderError } from "../render-error";

const ALERT =
  "rounded border border-destructive/30 p-3 text-sm text-destructive";
/**
 * A part of the message that cannot be shown: the host's Problem component
 * when it supplied one, otherwise the generic wording in children.
 */
export function PartProblem({
  error,
  inline = false,
  children,
}: {
  error?: DilRenderError | undefined;
  inline?: boolean;
  children: ReactNode;
}) {
  const Problem = useCustomization().diagnostics?.Problem;
  if (Problem && error) return <Problem scope="part" error={error} />;
  return inline ? (
    <span role="alert">{children}</span>
  ) : (
    <div role="alert" className={ALERT}>
      {children}
    </div>
  );
}
