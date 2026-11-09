import type { DilRenderError } from "../render-error";
import type { DilDocument } from "../runtime/document";
import { useReservedHeight } from "../widget-heights";
import { PartProblem } from "./problem-view";

// Heights of the widgets whose size is known before their data: NodeGraph's
// fixed frame, a Chart's plot (248 px) with its legend row, and the smallest
// common Mermaid diagram. Reserving them keeps text below a pending widget
// from moving when it arrives.
const RESERVED_HEIGHT: Readonly<Record<string, number>> = {
  NodeGraph: 320,
  Chart: 280,
  Mermaid: 120,
};
/**
 * Space held for a pending widget, or nothing for one without a known size.
 * A snapshot's measured height (`reserve`) wins over the stock reserve.
 */
export function PendingBlock({
  name,
  reserve,
}: {
  name: string | undefined;
  reserve?: number | undefined;
}) {
  const height =
    reserve ?? (name === undefined ? undefined : RESERVED_HEIGHT[name]);
  if (height === undefined) return <template data-dil-pending="true" />;
  return (
    <div
      aria-hidden="true"
      data-dil-pending="true"
      data-dil-pending-name={name}
      style={{ minHeight: height }}
    />
  );
}
export interface LoadingBlockProps {
  name?: string;
  table?: false | "body" | "row";
  svg?: boolean;
  /** Reader-facing wording; without it the block is a pending placeholder. */
  error?: string | undefined;
  /** The reported problem, for a host Problem component. */
  problem?: DilRenderError | undefined;
  /** The height a snapshot measured for this node. */
  reserve?: number | undefined;
}
/** A loading node's placeholder, holding the height its widget last measured. */
export function NodePlaceholder({
  document,
  nodeId,
  ...props
}: Omit<LoadingBlockProps, "reserve"> & {
  document: DilDocument;
  nodeId: number;
}) {
  const reserve = useReservedHeight(document.heights, nodeId);
  return <LoadingBlock {...props} reserve={reserve} />;
}
export function LoadingBlock({
  name,
  table = false,
  svg = false,
  error,
  problem,
  reserve,
}: LoadingBlockProps) {
  if (!error)
    return svg ? (
      <g data-dil-pending="true" />
    ) : table ? (
      <template data-dil-pending="true" />
    ) : (
      <PendingBlock name={name} reserve={reserve} />
    );
  if (svg) return <text role="alert">{error}</text>;
  const content = <PartProblem error={problem}>{error}</PartProblem>;
  return table === "body" ? (
    <tr>
      <td colSpan={100}>{content}</td>
    </tr>
  ) : table === "row" ? (
    <td>{content}</td>
  ) : (
    content
  );
}
