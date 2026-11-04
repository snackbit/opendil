import "@/components/playback/playback.css";
import type { ComponentProps, ReactNode } from "react";
import { ToggleGroup, UiScope } from "@snackbit/opendil/ui";
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
/** Package UI controls painted with the site tokens; every site control sits inside one. */
export function ShellScope({ children, className = "" }: ShellScopeProps) {
  return (
    <UiScope className={"od-controls " + className} tokens={tokens}>
      {children}
    </UiScope>
  );
}

type SingleToggleGroupProps = Extract<
  ComponentProps<typeof ToggleGroup>,
  { type: "single" }
>;
export type SegmentedControlProps = Omit<
  SingleToggleGroupProps,
  "type" | "segmented" | "size" | "variant"
>;
/**
 * One choice out of a few, drawn like the stock tabs: options on a gray track, the selected
 * one raised as a pill (`.od-segmented` in playback.css). Use ToggleGroupItem for the options.
 */
export function SegmentedControl({
  className = "",
  ...props
}: SegmentedControlProps) {
  return (
    <ToggleGroup
      {...props}
      type="single"
      segmented
      size="sm"
      className={"od-segmented " + className}
    />
  );
}
