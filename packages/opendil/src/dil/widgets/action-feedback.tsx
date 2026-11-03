import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { Tooltip } from "../../components/ui/overlays/tooltip";
import { ActionReceipt } from "../runtime/action-receipt";
import type { DocumentStatus } from "../runtime/document";
export type ActionFeedback = "idle" | "copied" | "failed";
/** Shows the clipboard outcome of the action this control started, briefly. */
export function useActionFeedback(status: StoreApi<DocumentStatus>) {
  const [intent, setIntent] = useState<number | null>(null);
  const feedback = useStore(status, (state): ActionFeedback => {
    const outcome = state.clipboard;
    if (intent === null || outcome?.intent !== intent) return "idle";
    return outcome.ok ? "copied" : "failed";
  });
  useEffect(() => {
    if (feedback === "idle") return;
    const timer = setTimeout(() => setIntent(null), 2000);
    return () => clearTimeout(timer);
  }, [feedback, intent]);
  const track = useCallback((result: unknown) => {
    if (result instanceof ActionReceipt) setIntent(result.revision);
  }, []);
  return [feedback, track] as const;
}
/** Always mounted around the control so showing feedback never remounts or blurs it. */
export function ActionFeedbackTooltip({
  feedback,
  children,
}: {
  feedback: ActionFeedback;
  children: ReactNode;
}) {
  return (
    <Tooltip
      open={feedback !== "idle"}
      label={
        feedback === "failed" ? (
          "Copy failed"
        ) : (
          <span className="inline-flex items-center gap-1">
            <Check aria-hidden="true" size={14} />
            Copied
          </span>
        )
      }
    >
      {children}
    </Tooltip>
  );
}
