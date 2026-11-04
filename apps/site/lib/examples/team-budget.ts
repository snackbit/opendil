export const teamBudget = `<title size="xl">Plan your team budget</title>

Adjust the team. See the numbers respond.

{@body const [seats, setSeats] = DIL.useState(8)}
{@body const [annual, setAnnual] = DIL.useState(false)}

<row justify="between" align="center">
  <label>Team members</label>
  <text tabularNums>{seats}</text>
</row>
<slider
  aria-label="Team members"
  min={1}
  max={30}
  value={seats}
  onChange={setSeats}
/>
<checkbox checked={annual} onChange={setAnnual} lineThrough={false}>
  Annual billing · save 20%
</checkbox>

{@body const monthly = seats * 29 * (annual ? 0.8 : 1)}

<divider />
<row justify="between" align="center">
  <caption>Estimated monthly cost</caption>
  <title size="2xl">€{monthly.toFixed(2)}</title>
</row>
<divider />

<title>Your first three months</title>
<Chart content={{
  chartType: "bar",
  xKey: "month",
  series: [{ dataKey: "cost", label: "Total cost (€)" }],
  data: [1, 2, 3].map((month) => ({
    month: "Month " + month,
    cost: monthly * month,
  })),
}} />

<caption>Illustrative pricing · €29 per member / month</caption>

<divider />
<row justify="between" align="center">
  <title size="lg">Billing summary</title>
  <badge color={annual ? "success" : "secondary"}>{annual ? "Annual plan" : "Monthly plan"}</badge>
</row>
<text color="secondary">
  Your workspace includes unlimited projects, shared dashboards, and version
  history for every team member.
</text>
<row justify="between">
  <text>Annual equivalent</text>
  <text tabularNums>€{(monthly * 12).toFixed(2)}</text>
</row>
<row justify="between">
  <text>Annual billing saves</text>
  <text tabularNums>€{(seats * 29 * 12 * 0.2).toFixed(2)}</text>
</row>
<button variant="outline" onClick={() =>
  GenUI.copy(
    JSON.stringify(
      {
        seats,
        annual,
        monthly,
      },
      null,
      2,
    ),
  )}>Copy configuration</button>`;
