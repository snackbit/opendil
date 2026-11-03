export const chart = `<box border radius="xl" padding={4} gap={3}>
  <title>Deployments this week</title>
  <caption>Successful and failed deploys, by day</caption>
  <Chart content={{
    chartType: "bar",
    xKey: "day",
    data: [
      { day: "Mon", success: 18, failed: 2 },
      { day: "Tue", success: 26, failed: 1 },
      { day: "Wed", success: 22, failed: 3 },
      { day: "Thu", success: 32, failed: 1 },
      { day: "Fri", success: 28, failed: 0 },
    ],
    series: [
      { dataKey: "success", label: "Successful" },
      { dataKey: "failed", label: "Failed" },
    ],
  }} />
</box>`;
export const graph = `{@body const [selected, setSelected] = DIL.useState("api")}
<box border padding={4} radius="xl" gap={3}>
  <title>Follow the request.</title>
  <NodeGraph
    selectedId={selected}
    onSelect={setSelected}
    content={{
      nodes: [
        { id: "edge", label: "Gateway", sub: "Ingress", x: 0, y: 72 },
        {
          id: "api",
          label: "API service",
          sub: "Compute",
          x: 240,
          y: 0,
        },
        {
          id: "worker",
          label: "Worker",
          sub: "Async jobs",
          x: 240,
          y: 144,
        },
        { id: "db", label: "Database", sub: "Storage", x: 480, y: 0 },
      ],
      edges: [
        { source: "edge", target: "api" },
        { source: "edge", target: "worker" },
        { source: "api", target: "db" },
      ],
    }}
  />
  <caption>Selected service: {selected}</caption>
</box>`;
export const media = `<box gap={3}>
  <title>Room to explore.</title>
  <carousel>
    <carousel-item><AsyncImage query="mountain landscape" /></carousel-item>
    <carousel-item><AsyncImage query="butterfly" /></carousel-item>
  </carousel>
  <caption>Offline illustrations. No network request required.</caption>
</box>`;
export const code = `<box gap={3}>
  <title>Code belongs in the conversation.</title>
  <CodeBlock language="typescript" editable>
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: Error };

const success = <T,>(data: T): Result<T> => ({
  ok: true,
  data,
});
  </CodeBlock>
</box>`;
export const table = `{@body const services = [
  { name: "api-gateway", latency: "18 ms", status: "Healthy" },
  { name: "auth-service", latency: "32 ms", status: "Healthy" },
  { name: "payments", latency: "240 ms", status: "Degraded" },
]}
<box border padding={4} radius="xl" gap={3}>
  <title>Production services</title>
  <table>
    <table-row>
      <table-cell>Service</table-cell>
      <table-cell>Latency</table-cell>
      <table-cell>Status</table-cell>
    </table-row>
    {#each services as service}
    <table-row>
      <table-cell>{service.name}</table-cell>
      <table-cell>{service.latency}</table-cell>
      <table-cell>
        <badge color={service.status === "Healthy" ? "success" : "warning"}>{service.status}</badge>
      </table-cell>
    </table-row>
    {/each}
  </table>
</box>`;
export const overlays = `<box padding={4} gap={4}>
  <title>A little more context.</title>
  <popover>
    <popover-trigger>
      <button variant="outline">Show details</button>
    </popover-trigger>
    <popover-content>
      <box gap={2}>
        <title>Contextual popover</title>
        <text>Supplementary information, without leaving the document.</text>
      </box>
    </popover-content>
  </popover>
</box>`;
export const mermaid = `<Mermaid source={"flowchart LR\\n A[Source] --> B[Parser]\\n B --> C[Interactive UI]"} />`;
export const vector = `<svg viewBox="0 0 400 160" width="100%">
  <rect x="12" y="30" width="120" height="80" rx="12" fill="#F0EEFF" />
  <text x="30" y="75" fill="#252838">Source</text>
  <line x1="145" y1="70" x2="245" y2="70" stroke="#5E4CFF" strokeWidth="2" />
  <rect x="258" y="30" width="130" height="80" rx="12" fill="#F6F7F9" />
  <text x="278" y="75" fill="#252838">Interface</text>
</svg>`;
export const layout = `<grid columns={2} gap={3}>
  <box border padding={4} radius="lg">
    <title>Build</title>
    <caption>Compose an interface from small parts.</caption>
  </box>
  <box border padding={4} radius="lg">
    <title>Ship</title>
    <caption>Use your own application shell.</caption>
  </box>
</grid>`;
export const status = `<row gap={2} align="center">
  <badge color="success">Healthy</badge>
  <badge color="warning">Review needed</badge>
  <badge>Draft</badge>
</row>`;
