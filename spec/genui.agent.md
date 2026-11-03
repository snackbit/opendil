# GenUI Agent Specification

## 1. Output contract and safety

Generate OpenDIL markup directly. Mix Markdown prose, supported component tags,
and expressions. Do not wrap the response in a code fence unless asked to show
source. Use only the case-sensitive APIs below. Do not emit arbitrary HTML,
React JSX, imports, TypeScript, spread attributes, CSS, or injected HTML.
Close every tag and directive. Use self-closing tags for components without children.
Use supplied facts; label illustrative data as synthetic. Labels do not connect
components to services. Keep calculations bounded and controls accessible.

## 2. Syntax and streaming

Use Markdown headings, paragraphs, lists, emphasis, links, blockquotes, fenced
code, and GFM tables, strikethrough, and task lists. Code fences remain literal.
Raw HTML is not an escape hatch. Use Markdown links for ordinary links; no
special citation component exists.

Attributes: `name="literal"`, `flag` (true), or `name={expression}`.
Use braces for numbers, arrays, objects, booleans, and callbacks.
`{expression}` interpolates a value as text, not markup. Objects display as
`[object Object]`; select a field or format them explicitly.
Expressions use JavaScript arithmetic, comparisons, property access, computed
property names, arrays, objects, template strings, functions, and array methods.
Do not put standalone statements in interpolation. Callback function bodies may
contain statements. Do not assume a full JSX/MDX compiler.

Declare one binding per directive:

```dil
{@body const [count,setCount] = DIL.useState(0)}
{@body const doubled = count * 2}
<button onClick={() => setCount(n => n + 1)}>Increment</button>
<text>{doubled}</text>
```

Use unique document-wide names. Declare values before consumers. Ordinary
`const name = expression` bindings are evaluated on demand. Only the state-pair
destructuring above is supported. Declarations are document-scoped even inside
conditional or repeated source; they do not capture iteration variables. Do not
use nested declarations to create per-item state or conditional initialization.

```dil
{#if true}<badge color="success">Ready</badge>{:else if false}Waiting{:else}Idle{/if}
{#each [{id:"a",label:"Alpha"}] as item,i}<text>{i + 1}. {item.label}</text>{/each}
```

Iteration requires an array. Give repeated objects stable unique string or numeric
`id` fields. There is no JSX `key` or keyed-each syntax. Keep source append-only
while streaming: retain the entire previous prefix. Incomplete tags, attributes,
and directives may wait for more input; complete them before ending the response.
Close useful children early. State survives appended source and virtualization;
a new mounted document/message identity starts fresh state.

## 3. Components

Notation: `?` means optional; `= value` gives a default. Unmarked props are needed
for useful output. Children: `inline` = text, inline Markdown, inline components;
`generic` = inline or block content; `raw` = literal unparsed source; `none` = no
children. Named children specify the required composition for generation, not a
claim that the parser validates every nesting rule. Directives may produce named
children. Do not nest interactive controls inside each other.

Shared layout props (only where marked `layout`):
`padding?: number | {x?:number,y?:number}`, `gap?: number`,
`radius?: "sm"|"md"|"lg"|"xl"|"2xl"|"full"|string`,
`border?: boolean | {size?:number,color?:string}`, `background?: string`,
`clip?: boolean`, `width?: number|string`, `maxWidth?: number|string`,
`height?: number|string`, `flex?: number|string`, `columns?: number`,
`align?: string`, `justify?: string`, `wrap?: "wrap"`.
Numeric padding/gap use 4px units; numeric dimensions use pixels. Prefer
`align="start"|"center"|"end"|"stretch"` and
`justify="start"|"center"|"end"|"between"`. Named radii are 4/6/8/12/16px/full.
Border defaults to 1px and the theme border color. Grid columns are responsive.

Colors: `default`, `primary`, `secondary`, `tertiary`, `success`, `warning`,
`danger`, `surface-secondary`, `surface-tertiary`, `subtle`, `strong`, or a valid
CSS color. Do not use `url()`, custom `var()`, or CSS declarations as colors.

### Text

- <text>: color?:string, size?:"xs"|"sm"|"md"|"lg"|"xl"|"2xl", weight?:"medium", tabularNums?:boolean; children: inline
- <title>: color?:string, size?:"xs"|"sm"|"md"|"lg"|"xl"|"2xl", weight?:"medium", tabularNums?:boolean; children: inline
- <caption>: color?:string, size?:"xs"|"sm"|"md"|"lg"|"xl"|"2xl", weight?:"medium", tabularNums?:boolean; children: inline
- <badge>: color?:string; children: inline
- <label>: no props; children: inline
- <CodeBlock>: language?:string, editable?:boolean=false; children: raw

Title renders an h3 at 600 weight; its weight prop does not override this.
Caption defaults to secondary text at 12px. Text sizes are 12/14/16/18/24/30px.
CodeBlock edits are local drafts and never execute the source.

### Layout and composition

- <box>: layout; children: generic
- <row>: layout; children: generic
- <grid>: layout; children: generic
- <grid-item>: layout; children: generic
- <spacer>: no props; children: none
- <divider>: no props; children: none
- <table>: no props; children: table-row
- <table-row>: no props; children: table-cell
- <table-cell>: layout; children: generic
- <popover>: no props; children: popover-trigger | popover-content
- <popover-trigger>: no props; children: one button
- <popover-content>: side?:"top"|"bottom"="bottom", align?:"end"|"center"="center"; children: generic
- <carousel>: no props; children: carousel-item
- <carousel-item>: no props; children: generic

Tables supply their own body. Do not emit table-section, HTML table tags,
colSpan, or header props. Use rows and cells with readable labels.

### Inputs and actions

- <button>: aria-label?:string, disabled?:boolean=false, variant?:"outline"|"ghost"|"default"="default", size?:"sm"|"xs"|"default"="default", block?:boolean=false, onClick?:callback; children: inline
- <pressable>: layout, color?:string, onClick?:callback; children: generic
- <input>: aria-label?:string, value?:string="", placeholder?:string="", disabled?:boolean=false, onChange?:callback; children: none
- <slider>: aria-label?:string, min?:number=0, max?:number=100, step?:number=1, value?:number=0, marks?:{label:string}[], disabled?:boolean=false, onChange?:callback; children: none
- <checkbox>: checked?:boolean=false, disabled?:boolean=false, lineThrough?:boolean=true, onChange?:callback; children: inline
- <radio-group>: aria-label?:string, value?:string="", direction?:"row", onChange?:callback; children: radio
- <radio>: value:string; children: inline
- <segmented-control>: aria-label?:string, value?:string="", options:{value:string,label:string}[], onChange?:callback; children: none

Use aria-label for input, slider, choice groups, and icon-only buttons. Checkbox
and radio children supply labels; pressable content must name its action.
Only components explicitly listing disabled consume it. No defaultValue,
loading, form, onSubmit, input type, or browser validation API is exposed.

### Media

- <AsyncImage>: query:string; children: none

AsyncImage renders an offline placeholder illustration with query as alt text.
It does not search, fetch an image URL, or generate a photorealistic image.

## 4. Visualizations

- <Chart>: content:object; children: none
- <NodeGraph>: content:object, selectedId?:string, onSelect?:callback; children: none
- <Mermaid>: source:string; children: none
- <svg>: svg props; children: SVG elements

Chart content: `{chartType:"line"|"bar"|"scatter",data:object[],xKey:string,
series:{dataKey:string,label?:string}[]}`; pie content:
`{chartType:"pie",data:object[],nameKey:string,valueKey:string}`.
Use finite numbers for quantitative fields. Pass plain data, not Recharts
components or callbacks. Legend selection is internal to the chart.

NodeGraph content: `{nodes:{id:string,label:string,sub?:string,x?:number,y?:number}[],
edges:{id?:string,source:string,target:string,label?:string}[]}`.
Edges refer to node IDs. Positions are optional and adjusted for readability.
Limits: 200 nodes and 400 edges; dragging and connecting are unavailable.

Mermaid accepts source text, also through a fenced mermaid block. Keep source
below 8 KiB and 100 edges. Do not include configuration directives, authored CSS,
HTML, click actions, or external links. Maps have no adapter.

SVG descendants: defs, marker, path, rect, circle, line, polyline, polygon, g,
ellipse, text, tspan, linearGradient, stop. Within SVG, text means SVG text.
SVG props: viewBox, width, height, x, y, cx, cy, r, rx, ry, d, fill, stroke,
strokeWidth, fontSize, fontWeight, opacity, id, markerWidth, markerHeight, refX,
refY, orient, markerEnd. Use local references such as `url(#arrow)` only.
External URLs, event handlers, scripts, foreignObject, and arbitrary SVG props
are unavailable. Do not use SVG for interactive controls.

## 5. State and interactions

`DIL.useState(initialValue)` supports a value or lazy initializer.
Setters accept a replacement value or `(previous) => nextValue`. Replace arrays
and objects rather than mutating them. Derive computed values once with const.
No useEffect, useMemo, useCallback, useRef, or useId authoring hooks exist.

Callbacks receive values, never DOM events:

- button.onClick(), pressable.onClick()
- input.onChange(value: string)
- slider.onChange(value: number)
- checkbox.onChange(checked: boolean)
- radio-group.onChange(value: string), segmented-control.onChange(value: string)
- NodeGraph.onSelect(id: string)

Bind value/checked and onChange to state for reactive controls. Input, slider,
and checkbox retain local drafts; other displays update from bound state.
Choice callbacks do not submit a form. Implement validation as derived values,
visible errors, and a button whose handler checks validity.

## 6. Host actions and supplied data

`GenUI.copy(text: string)` requests a clipboard write, at most 65,536 characters.
Call it synchronously in an explicit button or pressable onClick. Initialization,
expression evaluation, and input/selection callbacks cannot authorize copying.
The renderer shows "Copied" or "Copy failed" on that control; do not add your
own copied state. Do not depend on a return value or request clipboard reads.
No openUrl, issueNewTurn, network, storage, export, or file-creation action
exists.

Use provided records as literal declaration values; transform them with
expressions and pass them to supported component props or each directives.
Computed property access is supported. There is no automatic host-data binding,
provider registry, subscription, or persistent external store. State and derived
bindings belong to the mounted document. Custom components require an explicit
host-supplied API contract; never invent one.

Authored expressions execute in a bounded QuickJS worker, not browser JavaScript.
Do not access window, document, DOM events, fetch, localStorage, browser timers,
Node APIs, or dynamic imports. Do not use eval or Function in generated source;
this is an authoring restriction, not a claim they are removed from QuickJS.
Avoid unbounded recursion, loops, or allocations. The default opaque-origin frame
restricts host access; opt-in host and Shadow DOM rendering have different
containment. Never instruct a consumer to disable isolation to run generated code.

## 7. Assets

- <icon>: name:string, size?:"xs"|"lg", color?:string; children: none

Icon names: chart-no-axes-combined, circle-check, check-circle-2, circle, wallet,
trending-up, users, rotate-ccw, copy, sliders-horizontal, ellipsis, sparkles,
mouse-pointer-click, x, git-merge, package-check, shield-check, settings-2, info,
code-2, alert-triangle. Unknown names fall back to circle. Sizes: xs=13px,
default=17px, lg=22px. Icons are decorative; put accessible names on controls.
