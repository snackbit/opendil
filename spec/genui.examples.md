# Minimal GenUI examples

## Static card

```dil
<box border padding={4}><title>Release</title><text>Ready for review.</text></box>
```

## Controlled counter and conditional status

```dil
{@body const [count,setCount] = DIL.useState(0)}
<button onClick={() => setCount(n => n + 1)}>Increment</button>
<text>{count}</text>
{#if count > 0}<badge>Started</badge>{:else}<caption>Waiting</caption>{/if}
```

## Supplied records and dynamic list

```dil
{@body const [rows,setRows] = DIL.useState([{id:"a",name:"Alpha"}])}
<button onClick={() => setRows(old => [...old,{id:"b",name:"Beta"}])}>Add Beta</button>
{#each rows as row,i}<text>{i + 1}. {row.name}</text>{/each}
```

## Validation and host action

```dil
{@body const [name,setName] = DIL.useState("")}
{@body const valid = name.trim().length > 0}
<input aria-label="Name" value={name} onChange={setName}/>
{#if !valid}<caption>Enter a name.</caption>{/if}
<button disabled={!valid} onClick={() => { if (valid) GenUI.copy(name); }}>Copy name</button>
```

## Streaming

Send `<box padding={` as an unfinished prefix, then append
`4}><text>Ready</text></box>` before marking completion. The combined executable
document is:

```dil
<box padding={4}><text>Ready</text></box>
```
