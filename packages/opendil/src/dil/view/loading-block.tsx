export interface LoadingBlockProps {
  name?: string;
  table?: false | "body" | "row";
  svg?: boolean;
  error?: string | undefined;
}
export function LoadingBlock({
  name: _name,
  table = false,
  svg = false,
  error,
}: LoadingBlockProps) {
  if (!error)
    return svg ? (
      <g data-dil-pending="true" />
    ) : (
      <template data-dil-pending="true" />
    );
  if (svg) return <text role="alert">{error}</text>;
  const content = (
    <div
      role="alert"
      className="rounded border border-destructive/30 p-3 text-sm text-destructive"
    >
      {error}
    </div>
  );
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
