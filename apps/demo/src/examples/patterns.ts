export const deployment = `{@body const [region, setRegion] = DIL.useState("eu")}
{@body const [replicas, setReplicas] = DIL.useState(3)}
{@body const [deployed, setDeployed] = DIL.useState(false)}
<box border radius="xl" padding={5} gap={4}>
  <row align="center" justify="between">
    <title size="xl">Ship something good.</title>
    <badge color={deployed ? "success" : "secondary"}>{deployed ? "Deployed" : "Ready"}</badge>
  </row>
  <caption>Your next deployment, configured in a few lines of DIL.</caption>
  <divider />
  <label>Region</label>
  <segmented-control
    value={region}
    onChange={setRegion}
    options={[
      { value: "eu", label: "Europe" },
      { value: "us", label: "US East" },
      { value: "ap", label: "Asia Pacific" },
    ]}
  />
  <row justify="between">
    <label>Replicas</label>
    <text tabularNums>{replicas}</text>
  </row>
  <slider
    aria-label="Replicas"
    value={replicas}
    min={1}
    max={8}
    onChange={setReplicas}
  />
  <box
    background="surface-secondary"
    radius="lg"
    padding={4}
    gap={1}
  >
    <caption>Estimated monthly cost</caption>
    <title size="2xl">€{(replicas * 24).toFixed(2)}</title>
    <caption>{replicas} replicas · {region === "eu"
      ? "Frankfurt"
      : region === "us"
        ? "Virginia"
        : "Singapore"}</caption>
  </box>
  <button block onClick={() => setDeployed(true)}>{deployed ? "Deployment created" : "Deploy application"}</button>
</box>`;
export const pricing = `{@body const [seats, setSeats] = DIL.useState(8)}
{@body const [annual, setAnnual] = DIL.useState(true)}
<box border padding={5} radius="xl" gap={4}>
  <title size="xl">A plan that grows with you</title>
  <row justify="between">
    <label>Team members</label>
    <text>{seats}</text>
  </row>
  <slider
    aria-label="Team members"
    min={1}
    max={50}
    value={seats}
    onChange={setSeats}
  />
  <checkbox checked={annual} onChange={setAnnual} lineThrough={false}>
    Annual billing · save 20%
  </checkbox>
  <divider />
  <title size="2xl">€{(seats * 29 * (annual ? 0.8 : 1)).toFixed(2)} / month</title>
  <caption>{seats} seats · €29 per seat{annual ? " · annual discount applied" : ""}</caption>
  <button onClick={() => GenUI.copy(JSON.stringify({ seats, annual }))}>Copy configuration</button>
</box>`;
export const form = `{@body const [name, setName] = DIL.useState("Ada")}
{@body const [notifications, setNotifications] = DIL.useState(true)}
<box border padding={5} radius="xl" gap={4}>
  <title size="xl">Make yourself at home.</title>
  <label>Display name</label>
  <input
    aria-label="Display name"
    value={name}
    onChange={setName}
  />
  <checkbox checked={notifications} onChange={setNotifications}>
    Send me release updates
  </checkbox>
  <box
    background="surface-secondary"
    radius="lg"
    padding={4}
    gap={2}
  >
    <title>Welcome, {name || "friend"}.</title>
    <text color="secondary">Release updates are {notifications ? "on" : "off"}.</text>
  </box>
</box>`;
export const tabs = `{@body const [tab, setTab] = DIL.useState("activity")}
<box border padding={5} radius="xl" gap={4}>
  <segmented-control
    value={tab}
    onChange={setTab}
    options={[
      { value: "activity", label: "Activity" },
      { value: "metrics", label: "Metrics" },
      { value: "settings", label: "Settings" },
    ]}
  />
  {#if tab === "activity"}
  <title>Activity</title>
  <text>Pull request merged</text>
  <caption>Just now</caption>
  {:else if tab === "metrics"}
  <title>Requests today</title>
  <title size="2xl">24,801</title>
  <badge color="success">All systems healthy</badge>
  {:else}
  <title>Workspace preferences</title>
  <text>Configure your environment.</text>
  {/if}
</box>`;
