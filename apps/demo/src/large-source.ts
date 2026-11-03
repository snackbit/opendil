export function largeSource(count = 5000): string {
  const intro =
    '# Large streaming document\n\n{@body const [selected, setSelected] = DIL.useState(-1)}\n{@body const [note, setNote] = DIL.useState("")}\n';
  return (
    intro +
    Array.from(
      { length: count },
      (_, index) =>
        `<box border padding={4} radius="xl" gap={2}>
  <title size="lg">Record ${index + 1}</title>
  <text color="secondary">
    A streamed document block with independent identity. Scroll, select a
    record, and return to it while more content arrives. Existing controls
    retain their state and focus throughout the stream.
  </text>
  <button variant="outline" onClick={() => setSelected(${index})}>
    Select record ${index + 1}
  </button>
  {#if selected === ${index}}
    <badge color="success">Selected record ${index + 1}</badge>
  {/if}
${index === 0 ? '  <input value={note} onChange={setNote}\n    placeholder="A note that survives scrolling" />\n' : ""}</box>

`,
    ).join("")
  );
}
export function repeatedSource(table = false): string {
  const opening =
    "# Virtualized " +
    (table ? "table" : "list") +
    "\n\n{@body const entries = Array.from({ length: 5000 }, (_, index) => ({\n  id: index,\n  name: `Entry ${index + 1}`\n}))}\n{@body const [selected, setSelected] = DIL.useState(-1)}\n";
  const item = table
    ? `<table-row>
    <table-cell>{entry.name}</table-cell>
    <table-cell>
      <button variant="outline" onClick={() => setSelected(entry.id)}>
        Inspect {entry.name}
      </button>
      {#if selected === entry.id}<badge>Selected</badge>{/if}
    </table-cell>
  </table-row>`
    : `<box border radius="xl" padding={4} gap={2}>
    <title>{entry.name}</title>
    <button variant="outline" onClick={() => setSelected(entry.id)}>
      Inspect {entry.name}
    </button>
    {#if selected === entry.id}<badge>Selected</badge>{/if}
  </box>`;
  return (
    opening +
    (table ? "<table>" : "<box gap={3}>") +
    "\n{#each entries as entry, index}\n  " +
    item +
    "\n{/each}\n" +
    (table ? "</table>" : "</box>")
  );
}
