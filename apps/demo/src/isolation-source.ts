export const isolationSource = `# Isolation checks
The resource tests intentionally stop this message. Restart the demo to run another test; the independent message stays usable.
{@body const [flood, setFlood] = DIL.useState(false)}
{@body const floodItems = Array(1000).fill(1)}

<text>
  DOM access: {typeof document === "undefined" ? "Blocked" : "Unexpectedly available"}
</text>
<text>
  Network access: {typeof fetch === "undefined" ? "Blocked" : "Unexpectedly available"}
</text>
<text>
  Host global access: {({}).constructor.constructor("return typeof window")() === "undefined"
    ? "Blocked"
    : "Unexpectedly available"}
</text>
<button onClick={() => { while (true) {} }}>Test execution limit</button>
<button onClick={() => setFlood(true)}>Test rendering limit</button>
<Mermaid source={${JSON.stringify("flowchart TD\n A[Source] --> B[Worker]\n B --> C[Message]")}}/>
{#if flood}
  <svg viewBox="0 0 10 10">
    {#each floodItems as outer}
      {#each floodItems as inner}
        <circle cx="1" cy="1" r="1" />
      {/each}
    {/each}
  </svg>
{/if}
`;
