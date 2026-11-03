"use client";
import {
  createContext,
  useContext,
  useCallback,
  type FocusEvent,
  type ReactNode,
} from "react";
import { TableRow } from "../../components/ui/display/table";
export const TableScope = createContext<false | "body" | "row">(false);
interface RowMeasurement {
  index: number;
  group: string;
  measure: (element: HTMLElement | null) => void;
  focus: (event: FocusEvent<HTMLElement>) => void;
  blur: (event: FocusEvent<HTMLElement>) => void;
}
export const VirtualRowScope = createContext<RowMeasurement | null>(null);
export function DilTableRow({
  children,
  presentationRef,
}: {
  children: ReactNode;
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
}) {
  const row = useContext(VirtualRowScope);
  const measure = row?.measure;
  const ref = useCallback(
    (element: HTMLTableRowElement | null) => {
      measure?.(element);
      presentationRef?.(element);
    },
    [measure, presentationRef],
  );
  return (
    <TableRow
      ref={ref}
      data-index={row?.index}
      data-virtual-index={row?.index}
      data-virtual-group={row?.group}
      onFocusCapture={row?.focus}
      onBlurCapture={row?.blur}
    >
      <TableScope.Provider value="row">{children}</TableScope.Provider>
    </TableRow>
  );
}
