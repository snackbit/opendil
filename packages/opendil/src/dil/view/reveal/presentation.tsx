import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useLayoutEffect,
  useId,
  useMemo,
  type ReactNode,
} from "react";
import type { RevealController } from "./controller";
const NO_RETURN = { current: false };
export const RevealContext = createContext<RevealController | null>(null);
const ScopeContext = createContext({ key: "", returning: NO_RETURN });
export function usePresentationKey(identity: string) {
  return useContext(ScopeContext).key + "/" + identity;
}
/**
 * A block that may fade in. `offset` is where it starts in the message
 * source: only text that arrives after the renderer mounted reveals.
 */
export function usePresentationTarget(
  identity: string,
  eligible = true,
  offset = Infinity,
) {
  const controller = useContext(RevealContext);
  const scope = useContext(ScopeContext);
  const key = scope.key + "/" + identity;
  const cleanup = useRef<(() => void) | undefined>(undefined);
  return useCallback(
    (element: HTMLElement | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      if (element && controller)
        cleanup.current = controller.register(
          key,
          element,
          eligible,
          scope.returning.current,
          offset,
        );
    },
    [controller, key, eligible, scope, offset],
  );
}
export function VirtualPresentation({
  identity,
  returning,
  children,
}: {
  identity: string;
  returning: boolean;
  children: ReactNode;
}) {
  const controller = useContext(RevealContext),
    parent = useContext(ScopeContext);
  const key = parent.key + "/" + identity;
  const skip = useRef(
    parent.returning.current || returning || !!controller?.history.visited(key),
  );
  useLayoutEffect(() => {
    controller?.history.visit(key);
    skip.current = false;
  }, [controller, key]);
  const value = useMemo(() => ({ key, returning: skip }), [key]);
  return (
    <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
  );
}
export function BranchPresentation({ children }: { children: ReactNode }) {
  const controller = useContext(RevealContext),
    parent = useContext(ScopeContext);
  const generation = useId();
  const key = parent.key + "/branch:" + generation;
  useLayoutEffect(
    () => () => {
      // Descendant refs finish their animations later in the unmount commit.
      queueMicrotask(() => controller?.history.forget(key + "/"));
    },
    [controller, key],
  );
  const value = useMemo(
    () => ({ key, returning: parent.returning }),
    [key, parent.returning],
  );
  return (
    <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
  );
}
