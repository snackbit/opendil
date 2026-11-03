export function showcaseSource(source: string): string {
  const start = source.search(/<svg\b/);
  const end = source.indexOf("</svg>", start);
  if (start < 0 || end < 0) return source;
  return (
    source.slice(0, start) +
    `<NodeGraph
  content={{
    nodes: nodes.map((item, index) => ({
      id: String(index),
      label: item.label,
      sub: item.sub,
      x: item.x,
      y: item.y
    })),
    edges: [[0, 1], [0, 2], [1, 3], [2, 4]].map(([source, target], index) => ({
      id: String(index),
      source: String(source),
      target: String(target)
    }))
  }}
  selectedId={String(node)}
  onSelect={id => setNode(Number(id))}
/>` +
    source.slice(end + 6)
  );
}
