export const releasePlanner = `<title size="xl">Plan a production release</title>

{@body const [region, setRegion] = DIL.useState("eu")}
{@body const [replicas, setReplicas] = DIL.useState(3)}
{@body const [canary, setCanary] = DIL.useState(true)}
{@body const [checks, setChecks] = DIL.useState(false)}
{@body const [released, setReleased] = DIL.useState(false)}
{@body const monthly = replicas * 24}

<box border radius="xl" padding={4} gap={4}>
  <row justify="between" align="center">
    <title>API gateway</title>
    <badge color={released ? "success" : "secondary"}>{released ? "Deployed" : "Draft release"}</badge>
  </row>
  <text color="secondary">
    Choose a region, reserve capacity, and inspect the rollout before deploying.
    This example keeps its release state in the document.
  </text>
  <label>Region</label>
  <segmented-control
    value={region}
    onChange={setRegion}
    options={[
      { value: "eu", label: "Frankfurt" },
      { value: "us", label: "Virginia" },
      { value: "ap", label: "Singapore" },
    ]}
  />
  <row justify="between">
    <label>Replicas</label>
    <text tabularNums>{replicas}</text>
  </row>
  <slider
    aria-label="Release replicas"
    min={1}
    max={12}
    value={replicas}
    onChange={setReplicas}
  />
  <checkbox checked={canary} onChange={setCanary}>
    Start with a canary rollout
  </checkbox>
</box>

<grid columns={2} gap={3}>
  <box
    background="surface-secondary"
    radius="lg"
    padding={4}
    gap={2}
  >
    <caption>Monthly infrastructure</caption>
    <title size="2xl">€{monthly.toFixed(2)}</title>
    <caption>{replicas} replicas at €24 each</caption>
  </box>
  <box border radius="lg" padding={4} gap={2}>
    <caption>Available capacity</caption>
    <title size="2xl">{replicas * 400} req/s</title>
    <caption>Illustrative capacity at normal load</caption>
  </box>
</grid>

<title>Rollout forecast</title>
<Chart content={{
  chartType: "line",
  xKey: "stage",
  series: [
    { dataKey: "new", label: "New release" },
    { dataKey: "current", label: "Current release" },
  ],
  data: [0, 1, 2, 3, 4].map((stage) => ({
    stage: "Stage " + (stage + 1),
    new: canary ? [5, 10, 25, 50, 100][stage] : 100,
    current: canary ? [95, 90, 75, 50, 0][stage] : 0,
  })),
}} />

<box border radius="xl" padding={4} gap={3}>
  <title>Preflight</title>
  <row justify="between">
    <text>Database migration</text>
    <badge color="success">Compatible</badge>
  </row>
  <row justify="between">
    <text>Health endpoint</text>
    <badge color="success">Passing</badge>
  </row>
  <row justify="between">
    <text>Rollback image</text>
    <badge color="success">Available</badge>
  </row>
  <checkbox checked={checks} onChange={setChecks}>
    I have reviewed the rollout and rollback plan
  </checkbox>
  <button disabled={!checks} onClick={() => setReleased(true)}>
    {released ? "Release deployed" : "Deploy release"}
  </button>
  {#if released}
  <text color="success">
    Release queued in {region.toUpperCase()} with {replicas} replicas.
    {canary
      ? " Canary stages will preserve the previous release."
      : " All traffic moves at once."}
  </text>
  {/if}
  <button variant="outline" onClick={() =>
    GenUI.copy(
      JSON.stringify(
        {
          region,
          replicas,
          canary,
          monthly,
        },
        null,
        2,
      ),
    )}>Copy release plan</button>
</box>`;
