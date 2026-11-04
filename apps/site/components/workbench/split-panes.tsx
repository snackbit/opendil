import type { ReactNode } from "react";

export interface SplitPanesProps {
  className: string;
  source: ReactNode;
  preview: ReactNode;
}

export function SplitPanes({ className, source, preview }: SplitPanesProps) {
  return (
    <div className={className}>
      {source}
      {preview}
    </div>
  );
}
