"use client";
import type { ReactNode } from "react";
import { Tooltip as Primitive } from "radix-ui";
import { usePortalScope } from "./ui-scope";
export interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
  /** Controls visibility; omit for hover and focus behavior. */
  open?: boolean | undefined;
}
export function Tooltip({ label, children, open }: TooltipProps) {
  const { container, boundary } = usePortalScope();
  return (
    <Primitive.Provider delayDuration={250}>
      <Primitive.Root {...(open === undefined ? {} : { open })}>
        <Primitive.Trigger asChild>{children}</Primitive.Trigger>
        <Primitive.Portal container={container}>
          <Primitive.Content
            sideOffset={6}
            collisionPadding={8}
            collisionBoundary={boundary}
            className="dil-tooltip"
          >
            {label}
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  );
}
