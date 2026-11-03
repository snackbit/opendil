import type { ReactNode } from "react";
import { UiScope } from "@snackbit/opendil/ui";
const tokens = {
  "--background": "var(--od-surface)",
  "--foreground": "var(--od-text)",
  "--primary": "var(--od-accent)",
  "--primary-foreground": "var(--od-on-accent)",
  "--muted": "var(--od-surface-subtle)",
  "--muted-foreground": "var(--od-text-secondary)",
  "--popover": "var(--od-surface)",
  "--popover-foreground": "var(--od-text)",
  "--secondary": "var(--od-surface-muted)",
  "--accent": "var(--od-surface-muted)",
  "--accent-foreground": "var(--od-text)",
  "--border": "var(--od-border)",
  "--input": "var(--od-border-strong)",
  "--ring": "var(--od-focus)",
  "--font-dil": "var(--od-font-body)",
} as const;
export interface ShellScopeProps {
  children: ReactNode;
  className?: string;
}
export function ShellScope({ children, className = "" }: ShellScopeProps) {
  return (
    <UiScope className={"od-controls " + className} tokens={tokens}>
      {children}
    </UiScope>
  );
}
