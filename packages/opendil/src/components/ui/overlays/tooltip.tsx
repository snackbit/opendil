"use client";
import type { ReactNode } from "react";
import { Tooltip as Primitive } from "radix-ui";
import { useCollisionPadding, usePortalScope } from "./ui-scope";
export interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
  /** Controls visibility; omit for hover and focus behavior. */
  open?: boolean | undefined;
}
export function Tooltip({ label, children, open }: TooltipProps) {
  const { container } = usePortalScope();
  return (
    <Primitive.Provider delayDuration={250}>
      <Primitive.Root {...(open === undefined ? {} : { open })}>
        <Primitive.Trigger asChild>{children}</Primitive.Trigger>
        <Primitive.Portal container={container}>
          <TooltipContent label={label} />
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  );
}
/** Mounted only while open, so closed tooltips do not follow overlay room. */
function TooltipContent({ label }: { label: ReactNode }) {
  const { boundary } = usePortalScope();
  return (
    <Primitive.Content
      sideOffset={6}
      collisionPadding={useCollisionPadding(8)}
      collisionBoundary={boundary}
      className="dil-tooltip"
    >
      {label}
    </Primitive.Content>
  );
}
