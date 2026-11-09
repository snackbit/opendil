# GenUI Agent Specification

## 1. Output format and safety

Generate OpenDIL markup: Markdown, supported component tags, expressions, and
directives. Mix prose and UI directly. Do not enclose the response in a code
fence unless asked to show source. Match component and property names exactly.
Close every tag and directive before finishing. Use self-closing tags for leaves.

Use only the APIs below. Do not emit arbitrary HTML, React JSX, imports,
TypeScript, CSS, spread attributes, DOM handlers, or injected HTML. Render supplied
facts faithfully; label invented example data. Do not imply that a label connects
a component to a service. Provide readable labels and visible validation messages.
Avoid nested interactive controls. Keep calculations and output bounded.

Expressions execute in an isolated QuickJS worker. Browser globals, DOM access,
network clients, storage, browser timers, Node APIs, and dynamic module loading
are unavailable as authoring APIs. Do not use `eval` or `Function`; this is an
authoring rule, not a claim that QuickJS removes those JavaScript primitives.
Do not probe VM internals or overwrite globals. Host operations require the
explicit API and invocation rules in section 6. Do not request weaker containment.

## 2. Syntax and parsing

### Markdown

Use headings, paragraphs, lists, emphasis, blockquotes, fenced code, and GFM
tables, strikethrough, and task lists. Markdown task lists are presentation, not
state-bound inputs. Links render their labels as inert text; Markdown images are
suppressed. Use a visible URL as text when the destination matters. A host may
state that links or images work in its renderer; follow its instructions. No
authored HTML link or image tag is supported. Mermaid fences render diagrams.

Keep fences on separate lines with at most three leading spaces. Fences and
inline code spans protect their contents from DIL parsing: braces, tags, and
directives inside them display literally and never evaluate. A code span ends at
a blank line or at a line that starts a list item, heading, blockquote,
component tag, or block directive; an unmatched backtick protects nothing.
Lowercase HTML-like tags that are not DIL tags, such as `<div>` or `<br>`,
display as plain text; capitalized unknown tags are unsupported components. For
a literal brace in ordinary prose, use an expression such as `{"{"}`.

### JavaScript expressions

Attributes accept `name="literal"`, `name='literal'`, `flag` (true), or
`name={expression}`. Use braces for numbers, booleans, arrays, objects, and
callbacks. Unquoted scalar values, spread attributes, and JSX children inside
JavaScript are unsupported. For a quote inside a string prop, use a JavaScript
string expression rather than escaped quoted-attribute syntax.

`{expression}` interpolates text; it never parses returned strings as markup.
Strings and numbers display directly; null/undefined display empty, booleans as
text, and objects/arrays as `[object Object]`. Select fields, join arrays, or
format explicitly. Expressions support JavaScript operators, property/computed
access, optional chaining, literals, template strings, functions, and array
methods. Use directives to create UI trees, not `.map()` returning JSX.

Do not put statements in interpolation. Callback function bodies may contain
bounded statements. Keep rendered expressions and derived bindings pure; perform
state changes only in callbacks. Use plain JSON-compatible data across bindings;
avoid cycles, class instances, BigInt, and non-finite numbers. Functions are
callback values, not data records. `Intl.NumberFormat` is a limited bridge that
formats en-US numbers with zero maximum fractional digits; locale/options are
not a general formatting API. Use explicit string formatting for other needs.

### State declarations

Declare one binding per `{@body ...}` directive, before UI:

```dil
{@body const [count,setCount] = DIL.useState(0)}
{@body const doubled = count * 2}
{@body const increment = () => setCount(previous => previous + 1)}
<button onClick={increment}>Increment</button>
<text>{doubled}</text>
```

Supported declaration forms: `const [name,setName] = DIL.useState(initial)` and
`const name = expression`. An optional trailing semicolon is accepted. Use
unique document-wide names beginning with a letter or underscore and containing
letters, digits, or underscores. No `let`, `var`, function declarations, multiple
declarations in one directive, arbitrary destructuring, or other hooks exist.

State initializes once per document; a lazy initializer is supported. Ordinary
const bindings are getters evaluated on demand, not once-only snapshots. Keep
initializers and getters side-effect-free. Declarations are document-scoped even
when their source appears inside a conditional or loop. Declare them
unconditionally at the top level; they cannot capture iteration variables or
create item-local state.

### Conditional rendering

```dil
{@body const status = "ready"}
{#if status === "ready"}
  <badge color="success">Ready</badge>
{:else if status === "waiting"}
  <caption>Waiting</caption>
{:else}
  <text>Unavailable</text>
{/if}
```

Use JavaScript truthiness. The first matching branch renders. Else-if and else
are optional; close the enclosing if. Directives can produce required named
children without extra wrappers.

Repeat arrays with `{#each items as item,index}...{/each}`; index is optional
and zero-based. Non-arrays render no items; generate arrays deliberately. Give
repeated records stable unique string or number `id` values. Without such IDs,
identity falls back to position. There is no JSX `key` or keyed-each syntax.
Nested each scopes can read outer variables; declarations still cannot.

```dil
{@body const items = [{id:"a",label:"Alpha"},{id:"b",label:"Beta"}]}
{#each items as item,index}
  <text>{index + 1}. {item.label}</text>
{/each}
```

Stream append-only source: keep the full previous prefix and append suffixes.
Incomplete tags, attributes, and directives wait for more input; complete them
before ending. Close useful children early. A repeated template waits for
`{/each}` before rendering. Streaming does not authorize actions. State survives
appends and virtualized unmounts within the document; a fresh document resets it.
Do not rewrite previous source to update state.

## 3. Component API

Notation: `?` = optional; `=value` = default. Unmarked props must be supplied for
the intended output; the parser does not enforce a complete prop schema.
`callback` signatures are listed in section 6. Unknown props are not extensions.

Children categories:

- `inline`: text, inline Markdown, and inline components, including icons.
- `generic`: inline and block content.
- `raw`: unparsed source, with no expressions or component children.
- `none`: no children.
- Named children: only the listed direct component types; whitespace is allowed.
  If/each directives may produce those children. `one` means exactly one.

These are generation contracts. The parser accepts a wider tree than valid UI
composition. Never nest buttons, pressables, inputs, or choice controls inside
another action control. Do not put block content inside inline text.

Shared layout props (only entries marked `layout`):
`padding?:number|{x?:number,y?:number}`, `gap?:number`,
`radius?:"sm"|"md"|"lg"|"xl"|"2xl"|"full"|string`,
`border?:boolean|{size?:number,color?:string}`, `background?:string`,
`clip?:boolean`, `width?:number|string`, `maxWidth?:number|string`,
`height?:number|string`, `flex?:number|string`, `columns?:number`,
`align?:string`, `justify?:string`, `wrap?:"wrap"`.

Numeric padding/gap use 4px units. Numeric width/maxWidth/height use pixels;
string dimensions use valid CSS lengths or percentages. Flex numbers are flex
values, not pixel dimensions. Named radii are 4/6/8/12/16px and full rounding.
Border defaults to 1px in the theme border color when enabled. Unspecified layout
props retain component styling. Prefer positive integer columns; grids reduce
columns responsively. `columns` has no useful grid effect on a row.

Prefer `align="start"|"center"|"end"|"stretch"` and
`justify="start"|"center"|"end"|"between"`. Use `wrap="wrap"` for wrapping rows.
Use `spacer` to consume remaining row space. Clipping may hide content; avoid it
around controls and long text unless deliberate.

Color values: `default`, `primary`, `secondary`, `tertiary`, `success`, `warning`,
`danger`, `surface-secondary`, `surface-tertiary`, `subtle`, `strong`, or a valid
CSS color shorter than 128 characters. Do not supply `url`, custom `var()`, CSS
declarations, or style objects as color values. Use semantic colors and readable
text; color alone must not communicate status.

### Text components

- <text>: color?:string, size?:"xs"|"sm"|"md"|"lg"|"xl"|"2xl", weight?:"medium", tabularNums?:boolean; children: inline
- <title>: color?:string, size?:"xs"|"sm"|"md"|"lg"|"xl"|"2xl", weight?:"medium", tabularNums?:boolean; children: inline
- <caption>: color?:string, size?:"xs"|"sm"|"md"|"lg"|"xl"|"2xl", weight?:"medium", tabularNums?:boolean; children: inline
- <badge>: color?:string; children: inline
- <label>: no props; children: inline
- <CodeBlock>: language?:string="", editable?:boolean=false; children: raw
- <Markdown>: no props; children: raw

Text sizes xs/sm/md/lg/xl/2xl are 12/14/16/18/24/30px at the normal root size.
Title renders h3, defaults to 18px/600, and ignores weight overrides. Caption
defaults to secondary color and 12px. Use Markdown headings for document
hierarchy. `weight="medium"` means 500 on text/caption; use Markdown emphasis
for bold. `label` is visual text, not an input association; name inputs explicitly.

CodeBlock reads literal children until the exact `</CodeBlock>` delimiter.
No `source`, `value`, or `onChange` prop exists. Editable code is a local draft,
never executed and not readable from DIL state. Its copy/wrap controls are built
in. Avoid embedding its closing delimiter in its raw source; use fenced code
instead. Keep source below 131,072 characters and copyable content at 65,536 or
fewer characters. Fenced code is another display option, not a runnable program.

Markdown renders its raw children as Markdown only, up to the exact
`</Markdown>` delimiter: braces, tags, and directives inside display literally
and never evaluate. Use it to quote supplied Markdown. Inside it, a `<` followed
by one or more backslashes and `/Markdown` displays with one backslash fewer, so
write `<\/Markdown>` to show the delimiter.

### Media components

- <AsyncImage>: query:string; children: none

AsyncImage renders an offline placeholder illustration. Query is its alt text;
it is not an image URL, search request, or image-generation call. Provide a
descriptive query and do not claim the illustration depicts verified evidence.
No stock audio, video, file viewer, or external image-source prop exists.

### Layout components

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

Use box for vertical content, row for horizontal groups, grid for responsive
columns, and grid-item for a grid child. Grid-item has no span/placement API.
Table supplies its own body; no table-section, header, colSpan, or rowSpan exists.
Use a first row of clear labels or a Markdown table when headers matter.

Composition contracts:

```text
<table>
  children: table-row
  <table-row>
    children: table-cell
    <table-cell>
      children: generic

<popover>
  children: popover-trigger | popover-content
  <popover-trigger>
    children: one button
  <popover-content>
    children: generic

<carousel>
  children: carousel-item
  <carousel-item>
    children: generic
```

Use one trigger and one content region per popover. The trigger button opens it
without an authored handler; content may contain controls. Keep carousel items
direct children. Carousel navigation is built in; no authored active-index prop
or navigation callback exists. Avoid carousels for required sequential form steps.

### Input components

- <button>: aria-label?:string, disabled?:boolean=false, variant?:"outline"|"ghost"|"default"="default", size?:"sm"|"xs"|"default"="default", block?:boolean=false, onClick?:callback; children: inline
- <pressable>: layout, color?:string, onClick?:callback; children: generic
- <input>: aria-label?:string, value?:string="", placeholder?:string="", disabled?:boolean=false, onChange?:callback; children: none
- <slider>: aria-label?:string, min?:number=0, max?:number=100, step?:number=1, value?:number=0, marks?:{label:string}[], disabled?:boolean=false, onChange?:callback; children: none
- <checkbox>: checked?:boolean=false, disabled?:boolean=false, lineThrough?:boolean=true, onChange?:callback; children: inline
- <radio-group>: aria-label?:string, value?:string="", direction?:"row", onChange?:callback; children: radio
- <radio>: value:string; children: inline
- <segmented-control>: aria-label?:string, value?:string="", options:{value:string,label:string}[], onChange?:callback; children: none

Give input, slider, radio-group, and segmented-control an explicit aria-label.
Checkbox/radio children supply visible labels. Name icon-only buttons with
aria-label. Pressable's noninteractive content must name its action. Only the
components listing `disabled` accept authored disabled state.

Bind controlled values and callbacks to state. Keep slider min < max, step > 0,
and value within range; marks are evenly distributed labels, not tick positions.
Use unique nonempty strings for choice values; keep selection among options.
Radio-group is vertical by default; direction="row" wraps horizontally.

```text
<radio-group>
  children: radio
  <radio>
    children: inline
```

No defaultValue, loading, type, minLength, required, pattern, form, submit event,
select, textarea, or arbitrary DOM event prop exists. Validate using derived
values, visible messages, disabled buttons, and a guard inside the handler.

## 4. Specialized components

### Data-linked components

No stock remote-data, query, subscription, or provider component exists. Pass
supplied arrays/records to Chart and NodeGraph content or render them with each.
See Visualizations for their exact data shapes and section 6 for binding rules.
Labels such as "live" do not establish a connection or refresh behavior.

### Links and citations

No link, citation, footnote lookup, source registry, or URL-opening action is
exposed. Markdown link labels display without navigation. Preserve source titles
and visible supplied URLs as text; do not invent reference IDs or destinations.
A button cannot open a URL through an undocumented browser operation.

### Embedded application blocks

No iframe, app block, script, embed, or independently running application is
authorable. CodeBlock displays source only. Custom components require an explicit
host-supplied contract specifying names, props, children, and actions; absent that
contract, use stock components. Do not infer custom capabilities from site demos.

## 5. Visualizations

### Images

Use AsyncImage only with its documented placeholder semantics. Markdown images
do not display. For authored diagrams or illustrations, use presentation-only SVG:

- <svg>: svg props; children: SVG elements

SVG elements: svg, defs, marker, path, rect, circle, line, polyline, polygon, g,
ellipse, text, tspan, linearGradient, stop. Names are case-sensitive. SVG text is
SVG content inside an SVG subtree, not the DIL text component.

Shared SVG props: viewBox, width, height, x, y, cx, cy, r, rx, ry, d, fill, stroke,
strokeWidth, fontSize, fontWeight, opacity, id, markerWidth, markerHeight, refX,
refY, orient, markerEnd. Use suitable number/string values. Give the root a
viewBox and bounded dimensions. SVG has no layout-prop inheritance from DIL.

```text
<svg>
  children: SVG elements
  <defs>
    children: marker | linearGradient
    <marker>
      children: SVG shapes
    <linearGradient>
      children: stop
  <g>
    children: SVG shapes | g | text
  <text>
    children: text content | tspan
```

These are useful SVG compositions, not a complete element-specific schema.
Use only local references such as `url(#arrow)`. No href, external image, script,
foreignObject, style, event handler, transform, points, offset, or stopColor prop
is exposed. In particular, polyline/polygon and gradient elements have a limited
attribute API; use path/rect/circle for reliable geometry. Do not invent missing
SVG attributes. Give diagrams a nearby text description; no SVG aria-label prop
is exposed. Never simulate interactive controls with SVG.

### Charts

- <Chart>: content:object; children: none
- <NodeGraph>: content:object, selectedId?:string, onSelect?:callback; children: none
- <Mermaid>: source:string; children: none

Chart content for line/bar/scatter:
`{chartType:"line"|"bar"|"scatter",data:object[],xKey:string,
series:{dataKey:string,label?:string}[],title?:string,description?:string,
xLabel?:string,yLabel?:string}`.
For pie: `{chartType:"pie",data:object[],nameKey:string,valueKey:string,
title?:string,description?:string}`. title names the chart above it;
description is a short caption; axis labels carry units, as in "Revenue (USD)".
Supply chartType explicitly; omission currently falls back to line. Series keys
must identify numeric fields. Scatter xKey is numeric; line/bar may use category
strings. Keep values finite, units consistent, and keys/labels distinct. Pie
values should be nonnegative and names unique. No palette, size, tick, domain,
tooltip, legend, or callback customization props exist. Legend selection for multi-series
line/bar charts is internal; it is not DIL state. Supply a nearby textual summary.

NodeGraph content:
`{nodes:{id:string,label:string,sub?:string,x?:number,y?:number}[],
edges:{id?:string,source:string,target:string,label?:string}[]}`.
Use unique node IDs and valid edge endpoints. Coordinates are optional hints;
layout adjusts them to avoid overlap. Maximum 200 nodes and 400 edges; excess
entries are truncated and invalid endpoints filtered. Graph selection can bind
selectedId/onSelect; dragging and connecting are unavailable. Pan/zoom controls
are built in. No custom node types, styles, or edge handlers are authorable.

Mermaid accepts source text as a string, also through a fenced mermaid block.
Keep it within 8,192 characters and 100 edges. Do not include configuration
directives, frontmatter, authored CSS, HTML, click actions, external links, or
`@{...}` metadata nodes (including image and icon nodes).
Output is sanitized. Mermaid is a diagram display, not an interaction surface.

### Maps

No map, geocoding, tile, marker, or geographic layer API exists. Present supplied
locations as text/table data. Use a supplied URL as visible text; do not imply an
interactive map or fabricate geographic results.

## 6. Interactivity

### State management

Only `DIL.useState(initialValue)` exists. Pass a value or lazy initializer.
Setters accept a replacement or `(previous) => nextValue`. Replace arrays and
objects; never mutate them in place. Use functional setters for repeated updates
that depend on the previous value. Derive totals/filtering with const getters.
No useEffect, useMemo, useCallback, useRef, useId, lifecycle, or async data hook
is exposed. Do not perform work merely because a component renders.

State belongs to the mounted document, not the server, browser storage, or a
global app store. Keep state for repeated records in a top-level array/object
keyed by ID. Hiding a branch does not reset document state. Code editor drafts
and chart legend state are internal widget state, not author-visible bindings.

### Event callbacks

| Component callback                               | Argument                            |
| ------------------------------------------------ | ----------------------------------- |
| button.onClick, pressable.onClick                | none; ignore the undefined argument |
| input.onChange                                   | value: string                       |
| slider.onChange                                  | value: number                       |
| checkbox.onChange                                | checked: boolean                    |
| radio-group.onChange, segmented-control.onChange | value: string                       |
| NodeGraph.onSelect                               | id: string                          |

Callbacks receive values, never DOM events. Pass a setter directly or a function
expression; do not call it while assigning the prop. Keep handlers synchronous
and bounded. Input/slider/checkbox keep immediate local drafts while worker state
updates; bind state to update other views. Choice controls require upstream state
for persistent selection. NodeGraph selection likewise needs a binding. No
onSubmit, onBlur, onKeyDown, onInput, or propagation-control API exists.

### Data bindings

Embed supplied JSON-compatible records in top-level const declarations; no
automatic external binding name exists. Read fields with dot or computed access,
derive filtered/mapped arrays using pure expressions, and pass them to props or
each. Treat supplied facts as read-only; use separate state for edits. Expressions
can read loop item/index names only within that loop's rendered subtree.

```dil
{@body const records = [{id:"a",name:"Alpha",amount:12}]}
{@body const total = records.reduce((sum,item) => sum + item.amount,0)}
<text>Total: {total}</text>
{#each records as item}<text>{item["name"]}: {item.amount}</text>{/each}
```

Bindings live only within the document. There is no host-data injection prop
visible to authored expressions, subscription, persistence, write-back channel,
or fetch operation. A displayed edit is not a saved server mutation.

### Host actions

`GenUI.copy(text: string): undefined` requests a clipboard write, up to 65,536
characters. Call it synchronously from a button or pressable onClick following
explicit user activation. A value-change/selection callback, initialization,
derived getter, interpolation, or automatic execution cannot authorize copying.
Do not defer it through promises or timers, depend on a return value, or attempt
clipboard reads. Empty text does not produce a clipboard request.

```dil
{@body const [name,setName] = DIL.useState("")}
{@body const valid = name.trim().length > 0}
<input aria-label="Name" value={name} onChange={setName}/>
{#if !valid}<caption>Enter a name.</caption>{/if}
<button disabled={!valid} onClick={() => { if (valid) GenUI.copy(name); }}>Copy name</button>
```

The initiating control reports Copied or Copy failed. Do not set a success flag
before browser confirmation or add duplicate feedback. The platform may deny a
valid request. Make one copy request per action; multiple calls do not create a
batch. No openUrl, issueNewTurn, network, export, file creation, or storage action
exists. Runtime resource and display limits can stop oversized/runaway documents;
do not approach them deliberately. The default renderer uses an opaque-origin
frame; opt-in host/Shadow DOM modes differ in containment, and Shadow DOM is a
styling boundary. These modes do not grant generated source new APIs.

## 7. Assets

### Icons

- <icon>: name:string, size?:"xs"|"lg", color?:string; children: none

Names: chart-no-axes-combined, circle-check, check-circle-2, circle, wallet,
trending-up, users, rotate-ccw, copy, sliders-horizontal, ellipsis, sparkles,
mouse-pointer-click, x, git-merge, package-check, shield-check, settings-2, info,
code-2, alert-triangle.

Sizes: xs=13px, omitted=17px, lg=22px. Unknown names fall back to circle; choose
listed names instead. Icons are decorative and cannot carry authored accessible
labels. Pair them with visible text or name the containing button. No external
icon library, asset upload, or arbitrary icon URL exists.
