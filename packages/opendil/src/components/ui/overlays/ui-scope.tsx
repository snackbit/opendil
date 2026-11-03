"use client";
import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ComponentProps,
} from "react";
import { cn } from "../../../lib/cn";
const PortalScope = createContext<{
  container: HTMLElement | null;
  boundary?: Element;
}>({ container: null });
export function usePortalScope() {
  return useContext(PortalScope);
}
export interface UiScopeProps extends ComponentProps<"section"> {
  appearance?: "light" | "dark";
  tokens?: Readonly<Record<`--${string}`, string>>;
  boundary?: Element;
}
export function UiScope({
  children,
  className,
  style,
  appearance = "light",
  tokens,
  boundary,
  ...props
}: UiScopeProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const portal = useMemo(
    () => ({ container, ...(boundary ? { boundary } : {}) }),
    [container, boundary],
  );
  return (
    <section
      {...props}
      className={cn("dil-scope", className)}
      data-theme={appearance}
      style={{ ...style, ...tokens }}
    >
      <PortalScope.Provider value={portal}>
        {children}
        <div data-dil-portals ref={setContainer} />
      </PortalScope.Provider>
    </section>
  );
}
