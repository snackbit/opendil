import { useCallback, type ComponentType, type ReactNode } from "react";
import type { DilComponentProps } from "./customization";

export interface CustomComponentProps {
  component: ComponentType<DilComponentProps>;
  name: string;
  attributes: Readonly<Record<string, unknown>>;
  config: Readonly<Record<string, unknown>>;
  children: ReactNode;
  className: string;
  slots: Readonly<Record<string, string>>;
  ready: boolean;
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
}
export function CustomComponent({
  component: Component,
  attributes,
  ...props
}: CustomComponentProps) {
  const invoke = useCallback(
    (attribute: string, value?: unknown) => {
      const handler = attributes[attribute];
      if (props.ready && typeof handler === "function") handler(value);
    },
    [attributes, props.ready],
  );
  return <Component {...props} attributes={attributes} invoke={invoke} />;
}
