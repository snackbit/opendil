"use client";

import type { ComponentProps } from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { cn } from "../../../lib/cn";
import { usePortalScope } from "../overlays/ui-scope";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;
const SelectGroup = SelectPrimitive.Group;
const SelectViewport = SelectPrimitive.Viewport;
const SelectItemIndicator = SelectPrimitive.ItemIndicator;
const SelectItemText = SelectPrimitive.ItemText;

function SelectPortal(props: ComponentProps<typeof SelectPrimitive.Portal>) {
  const { container } = usePortalScope();
  return <SelectPrimitive.Portal container={container} {...props} />;
}

function SelectTrigger({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "inline-flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
function SelectContent({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Content
      data-slot="select-content"
      className={cn(
        "z-50 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
        className,
      )}
      {...props}
    />
  );
}
function SelectItem({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
function SelectLabel({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs font-medium", className)}
      {...props}
    />
  );
}
export {
  Select,
  SelectValue,
  SelectGroup,
  SelectPortal,
  SelectViewport,
  SelectItemIndicator,
  SelectItemText,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
};
