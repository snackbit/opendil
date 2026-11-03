export const customizationDocsSource = `{@body const [count, setCount] = DIL.useState(0)}
{@body const [locked, setLocked] = DIL.useState(false)}

<Callout>
  This tag renders a React component registered by the application.
  The button below replaces the stock button adapter.
</Callout>

<row gap={3} align="center" wrap="wrap">
  <button disabled={locked} onClick={() => setCount(value => value + 1)}>
    Custom increment
  </button>
  <text>Custom count: {count}</text>
</row>

<checkbox checked={locked} onChange={setLocked} lineThrough={false}>
  Disable custom action
</checkbox>`;

export const customizationStyles = `.od-docs-output {
  padding: 16px;
  border-radius: 8px;
}
.od-docs-output .od-custom-callout {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius);
  background: var(--muted);
}
.od-docs-output .od-custom-title {
  font-size: 14px;
  font-weight: 600;
}
.od-docs-output .od-custom-title-strong {
  font-size: 18px;
  color: var(--primary);
}
.od-docs-output .od-custom-body {
  font-size: 14px;
  line-height: 1.6;
}
.od-docs-output .od-custom-body p {
  margin: 0;
}
.od-docs-output .od-custom-action {
  border-radius: 999px;
  padding-inline: 20px;
}
`;
