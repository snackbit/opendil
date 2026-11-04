/** The customization example; custom-components.tsx registers the Callout and button it uses. */
export const customizationSource = `# Your components, your theme
{@body const [count, setCount] = DIL.useState(0)}
{@body const [name, setName] = DIL.useState("Alex")}
<Callout>
  OpenDIL can use your own React components. This callout is registered by the
  host.
</Callout>
<button onClick={() => setCount((n) => n + 1)}>Custom increment</button>
<text>Custom count: {count}</text>
<input
  aria-label="Host display name"
  value={name}
  onChange={setName}
/>
<text>Host name: {name}</text>
<button onClick={() => setName("Alex")}>Reset host name</button>`;
