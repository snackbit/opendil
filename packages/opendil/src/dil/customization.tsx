import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";

export interface DilComponentProps {
  name: string;
  attributes: Readonly<Record<string, unknown>>;
  config: Readonly<Record<string, unknown>>;
  children: ReactNode;
  className: string;
  slots: Readonly<Record<string, string>>;
  ready: boolean;
  invoke: (attribute: string, value?: unknown) => void;
  /** Forward to the visual root to participate in progressive reveal. */
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
}
export interface DilCustomization {
  components?: Readonly<Record<string, ComponentType<DilComponentProps>>>;
  componentConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  classNames?: Readonly<Record<string, string>>;
  slots?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}
export const CustomizationContext = createContext<DilCustomization>({});
export function useCustomization() {
  return useContext(CustomizationContext);
}
