import {
  createContext,
  useContext,
  useLayoutEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import type { DilDocument } from "../runtime/document";
type BudgetDocument = Pick<DilDocument, "renderBudget" | "reportRenderLimit">;
export const RenderAllowance = createContext(2000);
export interface RenderLimitProps {
  document: BudgetDocument;
  cost?: number;
  children: ReactNode;
}
export function RenderExceeded({ document }: { document: BudgetDocument }) {
  useLayoutEffect(() => document.reportRenderLimit(), [document]);
  return null;
}
export function RenderLimit({
  document,
  cost = 1,
  children,
}: RenderLimitProps) {
  const id = useId();
  const quota = useContext(RenderAllowance);
  const valid = Number.isFinite(cost) && cost >= 0 && cost <= quota;
  const [allowed, setAllowed] = useState(true);
  useLayoutEffect(() => {
    const reserved = valid && document.renderBudget.reserve(id, cost);
    setAllowed(reserved);
    if (!reserved) document.reportRenderLimit();
    return () => document.renderBudget.release(id);
  }, [document, id, cost, valid]);
  if (!valid || !allowed) return null;
  return (
    <RenderAllowance.Provider value={quota - cost}>
      {children}
    </RenderAllowance.Provider>
  );
}
