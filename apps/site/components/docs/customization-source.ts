/** The document and stylesheet behind <CustomizationPlayground>; its Markdown output shows the document. */
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
  position: relative;
  display: grid;
  gap: 4px;
  padding: 12px 12px 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  color: var(--card-foreground);
}
.od-docs-output .od-custom-callout::before {
  content: "";
  position: absolute;
  inset: 12px auto 12px 4px;
  width: 2px;
  border-radius: 2px;
  background: var(--primary);
  opacity: 0.5;
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
  color: var(--muted-foreground);
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
