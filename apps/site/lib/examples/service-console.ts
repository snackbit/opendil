export const serviceConsole = `<title size="xl">Production service console</title>

{@body const [view, setView] = DIL.useState("overview")}
{@body const [environment, setEnvironment] = DIL.useState("production")}
{@body const [traffic, setTraffic] = DIL.useState(65)}
{@body const [selected, setSelected] = DIL.useState("gateway")}
{@body const [acknowledged, setAcknowledged] = DIL.useState(false)}
{@body const [note, setNote] = DIL.useState("")}
{@body const services = [
  {
    id: "gateway",
    name: "API gateway",
    latency: 24,
    uptime: "99.99%",
    owner: "Platform",
    status: "Healthy",
  },
  {
    id: "auth",
    name: "Identity",
    latency: 38,
    uptime: "99.98%",
    owner: "Identity",
    status: "Healthy",
  },
  {
    id: "payments",
    name: "Payments",
    latency: 180,
    uptime: "99.92%",
    owner: "Commerce",
    status: "Investigating",
  },
  {
    id: "queue",
    name: "Job queue",
    latency: 12,
    uptime: "99.99%",
    owner: "Platform",
    status: "Healthy",
  },
]}

<row justify="between" align="center">
  <badge color="success">Connected to local example data</badge>
  <segmented-control
    value={environment}
    onChange={setEnvironment}
    options={[
      { value: "production", label: "Production" },
      { value: "staging", label: "Staging" },
    ]}
  />
</row>
<segmented-control
  value={view}
  onChange={setView}
  options={[
    { value: "overview", label: "Overview" },
    { value: "topology", label: "Topology" },
    { value: "incident", label: "Incident" },
  ]}
/>

{#if view === "overview"}
<grid columns={2} gap={3}>
  <box border padding={4} radius="lg" gap={2}>
    <caption>Requests per second</caption>
    <title size="2xl">{traffic * (environment === "production" ? 120 : 12)}</title>
    <text color="success">Within reserved capacity</text>
  </box>
  <box border padding={4} radius="lg" gap={2}>
    <caption>Available capacity</caption>
    <title size="2xl">{100 - traffic}%</title>
    <text color="secondary">Target headroom: at least 20%</text>
  </box>
</grid>
<box border padding={4} radius="xl" gap={3}>
  <row justify="between">
    <label>Simulated traffic</label>
    <text tabularNums>{traffic}%</text>
  </row>
  <slider
    aria-label="Simulated traffic"
    min={10}
    max={95}
    value={traffic}
    onChange={setTraffic}
  />
  <Chart content={{
    chartType: "line",
    xKey: "time",
    series: [
      { dataKey: "requests", label: "Requests / second" },
      { dataKey: "capacity", label: "Reserved capacity" },
    ],
    data: [40, 46, 43, 59, 52, 61, 65].map((value, index) => ({
      time: [
        "09:00",
        "09:10",
        "09:20",
        "09:30",
        "09:40",
        "09:50",
        "10:00",
      ][index],
      requests: Math.round(
        value * traffic * (environment === "production" ? 2 : 0.2),
      ),
      capacity: environment === "production" ? 12000 : 1200,
    })),
  }} />
</box>
<title>Service health</title>
<text color="secondary">
  Latency is the median over the last ten minutes. Availability covers the
  current month. Select Topology to inspect service ownership, or open Incident
  to prepare a handoff without leaving this document.
</text>
<table>
  <table-row>
    <table-cell>Service</table-cell>
    <table-cell>Latency</table-cell>
    <table-cell>Uptime</table-cell>
    <table-cell>Status</table-cell>
  </table-row>
  {#each services as service}
  <table-row>
    <table-cell>{service.name}</table-cell>
    <table-cell>{service.latency} ms</table-cell>
    <table-cell>{service.uptime}</table-cell>
    <table-cell>
      <badge color={service.status === "Healthy" ? "success" : "warning"}>{service.status}</badge>
    </table-cell>
  </table-row>
  {/each}
</table>
{:else if view === "topology"}
<title>Request path</title>
<NodeGraph
  selectedId={selected}
  onSelect={setSelected}
  content={{
    nodes: [
      {
        id: "gateway",
        label: "Gateway",
        sub: "Public API",
        x: 0,
        y: 80,
      },
      {
        id: "auth",
        label: "Identity",
        sub: "Authentication",
        x: 240,
        y: 0,
      },
      {
        id: "payments",
        label: "Payments",
        sub: "Transactions",
        x: 240,
        y: 160,
      },
      {
        id: "queue",
        label: "Queue",
        sub: "Background jobs",
        x: 480,
        y: 80,
      },
    ],
    edges: [
      { source: "gateway", target: "auth" },
      { source: "gateway", target: "payments" },
      { source: "payments", target: "queue" },
    ],
  }}
/>
{#each services.filter((service) => service.id === selected) as service}
<box border padding={4} radius="lg" gap={3}>
  <row justify="between">
    <title>{service.name}</title>
    <badge>{service.owner}</badge>
  </row>
  <text>Median latency: {service.latency} ms</text>
  <text>Availability this month: {service.uptime}</text>
  <button variant="outline" onClick={() => GenUI.copy(service.id)}>
    Copy service identifier
  </button>
</box>
{/each}
{:else}
<box border padding={4} radius="xl" gap={4}>
  <row justify="between">
    <title>Payment latency elevated</title>
    <badge color="warning">SEV 3</badge>
  </row>
  <text>
    Payment requests are completing successfully but the 95th percentile latency
    is above the 150 ms target. No data loss has been reported.
  </text>
  <row justify="between">
    <text>Owner</text>
    <text>Commerce on-call</text>
  </row>
  <row justify="between">
    <text>Started</text>
    <text>09:42 UTC</text>
  </row>
  <divider />
  <title size="lg">Incident timeline</title>
  <table>
    <table-row>
      <table-cell>Time</table-cell>
      <table-cell>Observation</table-cell>
    </table-row>
    <table-row>
      <table-cell>09:42</table-cell>
      <table-cell>Latency alert crossed the 150 ms threshold.</table-cell>
    </table-row>
    <table-row>
      <table-cell>09:46</table-cell>
      <table-cell>
        On-call confirmed successful transactions and stable throughput.
      </table-cell>
    </table-row>
    <table-row>
      <table-cell>09:51</table-cell>
      <table-cell>
        Database connections were identified as the first investigation target.
      </table-cell>
    </table-row>
  </table>
  <text color="secondary">
    Escalate to the database owner if connection saturation persists. Pause the
    rollout if the error rate rises above 1% for five minutes. Keep customer
    support informed before changing the public status page.
  </text>
  <divider />
  <title size="lg">Response checklist</title>
  <text>Compare database connection usage with the previous release.</text>
  <text>Confirm that retry volume remains below the alert threshold.</text>
  <text>Prepare the previous image before changing the traffic split.</text>
  <checkbox checked={acknowledged} onChange={setAcknowledged}>
    Acknowledge and take ownership
  </checkbox>
  <label>Handoff note</label>
  <input
    aria-label="Handoff note"
    value={note}
    onChange={setNote}
    placeholder="What should the next engineer know?"
  />
  {#if acknowledged}
  <badge color="success">Acknowledged by the current operator</badge>
  {/if}
  <button disabled={!acknowledged || !note.trim()} onClick={() =>
    GenUI.copy(
      JSON.stringify(
        {
          service: "payments",
          environment,
          note,
          acknowledged,
        },
        null,
        2,
      ),
    )}>
    Copy incident handoff
  </button>
</box>
{/if}

<caption>
  All values are illustrative. Changing the controls makes no network requests.
</caption>`;
