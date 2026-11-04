# GenUI Agent Specification: Full Reference

Use this reference for targeted lookups. Inject [the primary specification](genui.agent.md)
when the smaller instruction set is sufficient. Search `Component: NAME`,
`Composition: NAME`, `Callback: NAME`, or `Task: NAME`. Find complete runnable
recipes in [the example catalog](genui.examples.md). All names are case-sensitive.
The numbered sections and component groups match the primary specification.

## 1. Output format and safety

Generate declarative OpenDIL source. Combine ordinary Markdown with supported
components and directives. Return the source directly when asked to generate UI.
Use a code fence only when the user asks to inspect or copy source rather than
render it. Do not include an explanation of how to install React, a component
module, a package manifest, or a web page around a generated interface.

Treat the supported vocabulary as closed unless the host explicitly supplies a
custom component contract. A familiar HTML, React, Recharts, or SVG API is not
automatically an OpenDIL API. Match every tag, prop, callback name, and data shape
in this reference. A tag being accepted by the parser does not establish that a
renderer exists for it. An unknown prop may be ignored rather than reported.
Generate valid output deliberately instead of depending on fallback behavior.

Use Markdown for prose, real components for controls, and directives for UI
structure. Do not encode an entire interface as a string expression. Strings
returned by expressions are displayed as text, not parsed as nested DIL. Do not
construct HTML strings, use `dangerouslySetInnerHTML`, or request arbitrary CSS.
There is no authorable HTML document, React component function, import statement,
stylesheet, or JavaScript module boundary.

Close elements and control directives in the reverse order in which they open.
Write leaves as self-closing tags. Finish incomplete tokens before ending the
response. Keep the source readable enough that a later agent can locate a binding
or handler. Prefer one declaration per line and modest component trees. Avoid
deep wrappers that add no layout, semantics, or interaction value.

Use only facts supplied by the user or the enclosing application. Label synthetic
examples, estimated totals, and placeholder illustrations appropriately. Do not
present a disconnected chart as live telemetry or a local form as a completed
server submission. Render supplied source titles and URLs accurately. Do not
invent citation IDs, external services, host actions, or automatic data refresh.

Give controls meaningful names. Use visible labels where possible and explicit
`aria-label` on controls that expose it. Keep status text next to status colors.
Provide textual summaries for charts, SVG drawings, and node graphs. An icon is
decorative; it cannot replace the name of an action. Avoid interactive descendants
inside an interactive ancestor, including buttons inside pressable cards.

Keep data transformations bounded. Prefer a short filter, map, or reduce over
recursive traversal or large generated allocations. Do not run arbitrary code
received in a data record. Never use an expression to discover undocumented host
globals or alter the execution environment. Do not use `eval`, `Function`, dynamic
imports, or VM implementation globals in authored output.

Execution boundaries:

| Surface                     | Supported author behavior                                    |
| --------------------------- | ------------------------------------------------------------ |
| Markdown and component tree | Declare content and supported props                          |
| QuickJS worker              | Evaluate expressions, declarations, and supported callbacks  |
| Renderer                    | Present approved widgets and dispatch their supported events |
| Host boundary               | Receive explicitly authorized clipboard requests             |
| Server                      | No generated server code or server action API                |

The document expression environment does not expose browser `window`, `document`,
DOM nodes/events, `fetch`, XMLHttpRequest, WebSocket, localStorage, IndexedDB,
browser timers, or Node facilities. Do not assume that because the renderer uses
these internally, document expressions can call them. Native JavaScript features
such as arrays, objects, functions, and arithmetic remain available inside QuickJS.
The prohibition on `eval` and `Function` is an authoring rule; do not describe it
as a proven removal of those primitives from the VM.

The default renderer uses an opaque-origin frame. Host DOM and Shadow DOM modes
are explicit consumer choices with different containment properties. Shadow DOM
provides styling separation, not iframe containment. Generated source cannot
select a rendering mode or authorize new APIs. Do not tell a user to weaken
containment to make an unsupported feature work.

Resource constraints are bounds, not generation targets. Current VM limits are
64 MiB heap, 64 KiB stack, and an interpreter interrupt after more than 256 polls.
The worker transport also has a 1-second timeout. There is no promised 50 ms
evaluation budget. Execution speed depends on the device and work performed.
Encoded results and dependency metadata are limited to 524,288 characters each;
encoding rejects excessive structural depth. Keep data and calculations small.
Display limits can stop a document even when its JavaScript evaluation succeeds.

#### Task: output-review

Before finishing, check that every used tag and prop appears in this reference,
every named binding is declared before its consumer, each callback accepts the
documented value type, all control branches close, and every displayed claim is
supported by supplied data. Remove inert action buttons unless they intentionally
demonstrate appearance. Do not add an implementation checklist to the generated UI.

## 2. Syntax and parsing

### Markdown

Write paragraphs, headings, ordered/unordered lists, emphasis, blockquotes, code
fences, and GitHub-flavored tables, task lists, and strikethrough. Use Markdown
headings for the overall document outline. A DIL title is a styled h3 and does
not choose an arbitrary heading level. Use ordinary prose when no special layout
or control is needed.

Separate paragraphs and major blocks with blank lines. Keep indentation consistent
within component children; the renderer normalizes Markdown indentation but is
not an MDX compiler. Avoid relying on a large indentation offset to create code
blocks inside a layout. Use explicit fences or CodeBlock for source displays.

Markdown links are deliberately displayed as inert text spans containing their
labels. They do not open their href. Markdown images are suppressed. Use a visible
plain-text URL if the reader needs the destination, and do not promise that
clicking it navigates. There is no DIL anchor or image tag to restore browser
behavior. Bare URLs can be recognized by GFM but still render without navigation.

Task-list checkboxes are Markdown presentation. They do not provide onChange,
state binding, or an action target. Use the checkbox component for user-editable
choices. A Markdown table is useful for ordinary tabular prose; use the DIL table
composition when cells contain components or reactive controls.

Fenced code protects its contents from DIL parsing. Put triple backticks or triple
tildes at the beginning of a line, with no more than three preceding spaces.
Use the same marker to close the fence. Use conventional three-character fences
rather than depending on extended Markdown fence behavior at the DIL boundary.
A `mermaid` language fence renders a Mermaid diagram rather than ordinary code.
Other language labels request display syntax, not code execution.

Inline backticks are processed after the DIL parser. They do not shield braces
or component-shaped source from expression/tag parsing. To show a literal tag or
directive reliably, use fenced code or CodeBlock. To insert a brace in prose,
interpolate a string containing it. Entity spellings can have Markdown-dependent
display behavior; use a string expression when exact text matters.

```dil
# Review summary

**Ready** for review. The sample contains synthetic values.

- Static prose uses Markdown.
- Interactive choices use supported components.

| Item | Value |
| --- | --- |
| Example records | 2 |

<text>A literal brace: {"{"}</text>
```

Markdown expressions are inserted as text after Markdown parsing. Do not expect a
string containing `**bold**` to become emphasis, a string containing a tag to
become a component, or an interpolated URL to become a live link. Put the needed
formatting around the expression in authored source instead.

### JavaScript expressions

Use `{expression}` in text or `property={expression}` in attributes. The outer
braces delimit JavaScript; an object value therefore needs its own object braces,
as in `content={{chartType:"bar",data:[]}}`. Numbers written in quoted attributes
remain strings. Supply numeric props with braces, including slider min/max/step,
layout spacing, dimensions, and SVG numeric coordinates.

Attribute forms:

| Form                                   | Meaning             |
| -------------------------------------- | ------------------- |
| `color="secondary"`                    | String literal      |
| `color='secondary'`                    | String literal      |
| `border`                               | Boolean true        |
| `border={false}`                       | Boolean false       |
| `padding={4}`                          | Number              |
| `value={name}`                         | Evaluated binding   |
| `onChange={setName}`                   | Callback reference  |
| `onClick={() => setCount(n => n + 1)}` | Function expression |

Quoted attributes use a simple delimiter scan. Do not rely on JavaScript-style
backslash escaping inside a quoted attribute. For text containing its surrounding
quote, use a JavaScript string expression. Do not repeat an attribute; the parser
can overwrite earlier entries, which is not a useful generation contract.
Unquoted scalar values, JSX spread syntax, shorthand object props, and arbitrary
attribute fragments are unsupported.

Expressions use ordinary JavaScript arithmetic, comparisons, logical operators,
ternaries, optional chaining, nullish coalescing, property access, computed property
names, string/array/object literals, template strings, and functions. Array
filter/map/reduce/find/some/every and string transformations work as JavaScript
operations. Keep transformations pure and their output JSON-compatible.

```dil
{@body const item = {name:"Ada",hours:3,rate:20}}
{@body const field = "name"}
<text>{item[field]}: {item.hours * item.rate}</text>
<caption>{`Hours: ${item.hours}`}</caption>
<input aria-label="Quoted example" value={'Say "hello"'} disabled/>
```

Interpolation display:

| Evaluated value         | Text output         |
| ----------------------- | ------------------- |
| String or finite number | Its displayed value |
| true / false            | `true` / `false`    |
| null / undefined        | Empty text          |
| Object or array         | `[object Object]`   |

Use `items.join(", ")` for a text list, `JSON.stringify(record)` for intentionally
displayed JSON, or an each directive for repeated UI. Arrays returned by map do
not become React children. JavaScript cannot contain authored JSX elements.
Do not create UI using string concatenation and expect interpolation to parse it.

The bridge serializes data using JSON and represents callback functions with
internal handles. Do not author or inspect those handles. Avoid circular records,
BigInt, sparse data that relies on undefined, Map/Set instances, prototype-based
objects, or objects with behavior in serialization. Non-finite numbers do not
retain useful numeric meaning across JSON serialization. Use plain records,
arrays, strings, booleans, null, and finite numbers.

Keep statements out of expression positions. Assignments and updates may be valid
JavaScript expressions but are forbidden generation patterns during rendering.
Use callback bodies for state changes. A handler may use local const declarations,
an if guard, and a bounded loop, but simpler immutable transformations are preferred.
Do not use top-level await, imports, exports, or async resource work.

`Intl.NumberFormat` is a limited host bridge. Its format operation uses en-US
formatting with maximumFractionDigits=0; supplied locale and options do not
configure the formatter. It is not a full Intl implementation. For fixed decimal
precision, use a bounded numeric expression and `.toFixed(n)`. Do not promise
currency/locale behavior from the bridge that the implementation does not provide.

#### Task: format-values

```dil
{@body const amount = 1234.5}
<text>{new Intl.NumberFormat().format(amount)}</text>
<caption>{amount.toFixed(2)} units</caption>
```

### State declarations

Use one `{@body ...}` directive for each declaration. Place declarations before
the interface. The supported forms are deliberately narrower than a JavaScript
program body:

```text
{@body const [name,setName] = DIL.useState(initialValue)}
{@body const name = expression}
```

An optional final semicolon is accepted. Use names beginning with a letter or
underscore and containing only letters, digits, and underscores. Avoid keywords,
duplicate names, builtin names, DIL, GenUI, and implementation-like double-underscore
names. Though some JavaScript identifiers allow `$` or Unicode, declaration
recognition is narrower; use the stated subset for reliable generation.

Only the exact state-pair destructuring shape is supported. Do not omit the setter,
add a third item, destructure objects, use nested patterns, or declare several
bindings in one directive. Ordinary const declarations create derived expression
bindings. There is no let/var declaration mode, function statement declaration,
class statement, or arbitrary script block. A function can be a const expression.

State initialization is once per state name in the mounted document. An initializer
may be a value or a function returning the initial value. Keep it side-effect-free.
Do not put a clipboard operation or setter call in initialization. State setters
accept either a replacement value or an updater function receiving the previous
value. A function passed to the setter is treated as an updater; do not use state
as a general function store.

Ordinary const bindings are getters. Their expression is recomputed when read;
they are not once-only snapshots and do not memoize expensive work. A getter can
read state and other bindings. Keep dependency order straightforward and avoid
cycles. A derived callback can be declared as a const function expression and
passed to a supported event prop.

```dil
{@body const [quantity,setQuantity] = DIL.useState(() => 2)}
{@body const unitPrice = 15}
{@body const total = quantity * unitPrice}
{@body const addOne = () => setQuantity(previous => previous + 1)}
<button onClick={addOne}>Add one</button>
<text>{quantity} items: {total} units</text>
```

All body declarations belong to the document, even when their source is written
inside a conditional or each block. Parsing collects declarations independently
of which visual branch later renders. A declaration inside a loop does not run
once per item and does not inherit item/index bindings. Generate unconditional
top-level declarations and keep per-item state in a top-level keyed object/array.

Do not rely on duplicate state declarations to reset a value. A matching existing
state name retains state; collisions between state, setter, and derived names can
fail or redefine bindings. Give each state pair and derived binding a unique name.
Use a reset button calling the setter when a reset is required.

No useEffect, useMemo, useCallback, useRef, or useId hook is exposed to DIL source.
The renderer may use React hooks internally; they are not document hooks. Do not
translate a React example into DIL by retaining arbitrary hook calls. Replace
computed values with const getters and user effects with supported event handlers.

### Conditional rendering

Use `{#if condition}`, optional `{:else if condition}` branches, optional
`{:else}`, and `{/if}`. Conditions use JavaScript truthiness. The first matching
branch is selected. With no match and no else, nothing renders. Keep else-if and
else within their enclosing if and close nested branches before outer branches.

```dil
{@body const [level,setLevel] = DIL.useState(0)}
<slider aria-label="Level" min={0} max={10} step={1} value={level} onChange={setLevel}/>
{#if level >= 8}
  <badge color="warning">High</badge>
{:else if level > 0}
  <badge color="success">Active</badge>
{:else}
  <caption>Not started</caption>
{/if}
```

A conditional changes visibility, not declaration scope or document state lifetime.
Hiding an input does not erase its top-level state. If the next interaction needs
a reset, perform that reset explicitly in a callback. Keep data guards before
unsafe property reads inside rendered expressions; the renderer can evaluate
branch conditions while resolving which branch to present.

Repeat with `{#each expression as item}` or
`{#each expression as item,index}` and close with `{/each}`. The expression should
evaluate to an array. Non-arrays currently produce no items rather than a typed
error. Do not depend on that fallback to represent loading or a failed request.
Use an explicit empty-array branch and truthful status text.

Within repeated rendered content, item is the current value and index is its
zero-based position. Nested repeats can read outer scope bindings. Choose
different variable names for outer and inner items to avoid accidental shadowing.
Declare shared transformations outside the repeat only when they do not need an
item binding. Otherwise compute the small expression inline.

Use stable unique string or numeric `id` properties on repeated objects. Without
such an ID, identity falls back to index. Reordering a positional list can attach
local widget state to a different record. The language has no key prop, keyed-each
suffix, or custom key callback. Do not invent one. Allocate IDs when creating new
records, not from the current array position after filtering.

```dil
{@body const groups = [{id:"g1",name:"Review",items:[{id:"a",name:"Alpha"}]}]}
{#each groups as group}
  <box border padding={3}>
    <title>{group.name}</title>
    {#each group.items as entry,index}
      <text>{index + 1}. {entry.name}</text>
    {/each}
  </box>
{/each}
```

Streaming rules:

- Append source suffixes while preserving every previous character.
- Close useful children as they arrive; an enclosing layout may remain open.
- Leave incomplete tokens pending only while more source will follow.
- Close an each block before expecting its repeated template to display.
- End with a complete document; completion converts unfinished syntax into errors.
- Use callbacks and state for interaction; do not patch earlier streamed source.

The parser retains lexical state across chunk boundaries, including quoted strings,
templates, comments, and regular expressions inside braces. There is no need to
align transport chunks with tokens. Generation must still produce conventional,
balanced syntax. Do not count a recoverable partial prefix as valid final output.
Repeat templates wait for their closing directive so the renderer does not mount
large numbers of incomplete copies.

#### Task: incomplete-stream

An unfinished first chunk may be:

```text
<box padding={
```

Append `4}><text>Ready</text></box>` and then signal completion. The finished source is:

```dil
<box padding={4}><text>Ready</text></box>
```

Source replacement, document/message identity changes, and remounting can create a
new document and reset state. Ordinary suffix appends and virtualized offscreen
unmounts retain document-owned state. Do not use internal render timing or viewport
visibility as an authoring lifecycle API.

## 3. Component API

Read each property block literally. `(optional)` means the property may be omitted;
`default` describes the widget's current fallback. `(required for generation)`
means supply a meaningful value even if the permissive renderer has a fallback.
Defaults do not replace type correctness. A string `"false"` is not boolean false.

Children categories: inline = text, inline Markdown, and inline components; generic
= inline or block content; raw = literal source; none = no content. Named children
restrict direct child component types. Whitespace and control directives may
surround named children. These contracts guide generation; the parser is not an
element-specific schema validator. Do not use parser acceptance as evidence of
valid browser structure.

Shared layout props:

```text
padding: number | {x?:number,y?:number} (optional)
gap: number (optional)
radius: "sm" | "md" | "lg" | "xl" | "2xl" | "full" | string (optional)
border: boolean | {size?:number,color?:string} (optional)
background: string (optional)
clip: boolean (optional)
width: number | string (optional)
maxWidth: number | string (optional)
height: number | string (optional)
flex: number | string (optional)
columns: number (optional)
align: string (optional)
justify: string (optional)
wrap: "wrap" (optional)
```

Only components whose Properties block lists `layout` consume these props. A table
does not become a layout container merely because table-cell accepts layout props.
Text, button, input, chart, and other components do not automatically accept them.
Wrap a component in box/row/grid when the surrounding layout needs control.

Numeric padding and gap use four-pixel units: 1=4px, 2=8px, 3=12px, 4=16px.
An x/y padding object sets inline/block padding independently. It does not accept
top/right/bottom/left keys. Numeric width, height, and maxWidth are pixels. String
dimensions may use valid CSS lengths or percentages. Flex follows CSS flex values;
it is not a width unit. Do not emit numeric strings when a number was intended.

Named radii: sm=4px, md=6px, lg=8px, xl=12px, 2xl=16px, full=9999px. A custom
string radius is passed as a CSS border radius; use a simple valid value. The
names are DIL names, not assumptions about another design system's scale.
Border true enables a 1px theme border. An object may change size and color.
Border false/omitted disables this authored border. Keep widths finite and positive.

Use semantic color tokens: default, primary, secondary, tertiary, success, warning,
danger, surface-secondary, surface-tertiary, subtle, strong. A valid CSS color is
also accepted when shorter than 128 characters and free of URL/custom-variable
or declaration syntax. A color object, gradient, arbitrary theme variable, or
stylesheet string is not accepted. Invalid colors are ignored rather than repaired.

Use align start/center/end/stretch for item alignment. Start/end map to flex-start/
flex-end. Use justify start/center/end/between for common distribution; between
maps to space-between. The reader accepts strings beyond these recommendations,
but a browser may reject them. Keep generation to meaningful CSS alignment values.
Use wrap="wrap" only when the layout benefits from wrapping.

Columns sets a responsive grid's requested column count. It is not a general
child-span/placement API. Use a small positive integer. The stock grid reduces
columns on narrow screens. A layout prop can be accepted by a shared reader
without changing a component that does not use the corresponding CSS behavior.
For example, columns does not turn a row into a grid.

### Text components

#### Component: text

```text
Properties:
  color: string (optional; inherited color when omitted)
  size: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" (optional; inherited size)
  weight: "medium" (optional)
  tabularNums: boolean (optional; default false)

Children: inline
```

Render a span-like text value. Use it for a value inside a row, a short reactive
sentence, or a styled phrase. Text does not accept layout props, an arbitrary
style object, href, or a strong prop. Use Markdown emphasis in children when bold
text is needed. Weight medium maps to 500. Other weight strings do not expose a
general font-weight API.

The size scale is xs=12px, sm=14px, md=16px, lg=18px, xl=24px, 2xl=30px at the
normal 16px root. tabularNums requests tabular numeral shapes; it does not format
numbers or align decimal places automatically. Format the expression separately.
Keep nested content inline; use box for a paragraph containing blocks.

```dil
{@body const revenue = 1234.5}
<text size="lg" weight="medium" tabularNums>{revenue.toFixed(2)} units</text>
```

#### Component: title

```text
Properties:
  color: string (optional)
  size: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" (optional; default lg)
  weight: "medium" (optional; consumed but does not override title weight)
  tabularNums: boolean (optional; default false)

Children: inline
```

Render a styled h3 with weight 600, default size 18px, compact line height, and no
default margin. A weight prop is consumed by the shared text branch but the title
keeps weight 600. Do not use it to request a different heading rank. For a document
with h1/h2 hierarchy, use Markdown headings. Use title for a card or panel heading.
An explicit size can change appearance without changing the heading's rank.

Keep controls outside the title; compose title and actions as siblings in a row.
Do not rely on a title prop to associate it with a dialog, table, or input. Those
associations are not exposed by the DIL API. Give the surrounding content a clear
reading order using ordinary source order.

#### Component: caption

```text
Properties:
  color: string (optional; default secondary)
  size: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" (optional; default xs)
  weight: "medium" (optional)
  tabularNums: boolean (optional; default false)

Children: inline
```

Render small secondary text, defaulting to 12px. Use it for units, context, helper
messages, or a short validation message. It is a text span, not a live-region,
tooltip, accessible description binding, or hidden-label mechanism. Keep messages
visible and sufficiently descriptive without claiming automatic announcement.

Use an explicit danger/warning color only when the text explains the state. A
red caption alone is not form validation; derive a validity value and guard the
action. Avoid shrinking essential instructions merely to fit a narrow layout.

#### Component: badge

```text
Properties:
  color: string (optional)

Children: inline
```

Render a compact status label. Success, warning, and danger colors receive related
background treatment. Other accepted colors affect foreground but do not create
arbitrary background variants. There is no variant, size, icon, or onClick prop.
Place an icon in children when needed and keep visible status text beside it.

Do not make a badge look like a selectable control. Use button, checkbox, radio,
or segmented-control for input. For a changing status, render the badge from state
or an if directive. Labels such as Saved must reflect an actual supported action;
copying text is not a saved-server mutation.

#### Component: label

```text
Properties: none

Children: inline
```

Render medium-weight visual label text. It is a styled span and has no for/id
association props. Pair it with input aria-label using the same visible words.
Do not claim that clicking this component focuses a separate input. Checkbox and
radio provide their own clickable label composition through their children.

Use label for a compact field heading or a value-group label. It cannot take
layout, color, or size props. Wrap it in a suitable layout instead of inventing
styling attributes. Keep the visible label stable while validation messages change.

#### Component: CodeBlock

```text
Properties:
  language: string (optional; default empty string)
  editable: boolean (optional; default false)

Children: raw
```

Place source directly between opening and closing tags. Everything is literal
until the exact `</CodeBlock>` delimiter: braces, tags, and directives inside are
not evaluated. The source prop does not exist. Do not nest DIL components to
format the source. The display trims leading/trailing whitespace when no draft
exists, so do not use it for byte-exact whitespace preservation requirements.

Editable true exposes an internal text editor. Edits remain local to this widget's
document draft store. They do not run, update DIL state, call an authored handler,
or create a downloadable file. There is no onChange/value/defaultValue API. Choose
input for an authored string value and CodeBlock for editable source presentation.

The widget provides copy and word-wrap controls. Copy is user-triggered and can
fail due to clipboard permissions. Its built-in feedback reports that outcome.
Do not wrap the code block in another action control or duplicate its copy button
unless the separate action has a distinct task. Code copying is subject to the
65,536-character clipboard limit; source display is limited to 131,072 characters.

```dil
<CodeBlock language="javascript" editable>
const greeting = "Hello";
console.log(greeting);
</CodeBlock>
```

Do not include the exact closing delimiter inside its raw source; it terminates
the component even if it occurs in a quoted source-language string. Use a fenced
code block for examples that need to show the delimiter literally. Language is a
display hint, not a compiler selection or permission to execute code.

### Media components

#### Component: AsyncImage

```text
Properties:
  query: string (required for generation)

Children: none
```

Render an offline, locally constructed placeholder illustration with query as
alt text. The name does not imply remote search, asynchronous model generation,
or retrieval of a verified image. The stock implementation builds a simple SVG
landscape; query text only influences a small set of color choices. Do not use it
as evidence of an actual person, place, product, or event.

The placeholder uses a 16:9 wrapper and built-in rounding. There is no src, alt,
width, height, fit, loading, or onLoad prop. Size the surrounding layout if needed.
If the browser cannot load the constructed image, the widget displays Image
unavailable. Do not set your own loaded flag; no authored load callback exists.

```dil
<box maxWidth={480}>
  <AsyncImage query="Placeholder illustration of a mountain landscape"/>
  <caption>Illustrative placeholder, not a photograph.</caption>
</box>
```

A host may override components under an explicitly supplied contract. That does
not change the stock contract documented here. Do not assume a host override can
search the web or load a supplied URL unless the prompt states that capability.
No stock video, audio player, file preview, or upload component is available.

### Layout components

#### Component: box

```text
Properties:
  layout

Children: generic
```

Use box for vertical flow, panels, and card surfaces. Children retain their source
order. A box with border/padding/radius/background can present a card without
inventing a card component. Keep a card's title, body, and actions as readable
siblings. Set maxWidth when a form or card should remain narrow on a wide screen.

Box participates in document flow and may virtualize long child sequences. Do not
assume every offscreen child is simultaneously mounted. Document state survives
that presentation behavior. Do not use viewport-dependent expression effects or
DOM queries to coordinate children. Use declared state and bindings.

#### Task: static-card

```dil
<box border padding={4} radius="xl" gap={3} maxWidth={480}>
  <title>Release review</title>
  <text>Ready for the next review.</text>
  <badge color="success">Prepared</badge>
</box>
```

#### Component: row

```text
Properties:
  layout

Children: generic
```

Use row for horizontal siblings such as a title and action, icon and value, or a
short control group. Set align for vertical alignment and gap for spacing.
Use wrap="wrap" when labels or controls may exceed available width. Avoid fixed
heights for rows with wrapping content. A narrow display must retain all controls.

Use justify="between" for two groups or spacer for flexible separation. Do not
insert literal spaces to align components. For multi-column data that needs
consistent row/cell relationships, use a table rather than independent rows.

#### Component: grid

```text
Properties:
  layout

Children: generic
```

Use grid for a responsive set of peers. Set columns to a small positive integer
and gap to the desired spacing unit. The stock grid reduces the requested column
count to one at viewport widths of 520px or less. Do not compute viewport breakpoints in document
JavaScript; browser dimensions are not exposed.

Generic children are accepted; grid-item is available when a child needs its own
layout props. There is no template-string API, row-span, column-span, area name,
or media-query prop. A grid-item does not add a missing placement API. Keep the
source order meaningful for a single-column reading order.

#### Component: grid-item

```text
Properties:
  layout

Children: generic
```

Use inside grid when a cell needs padding, border, background, or a nested layout.
It is a generic layout wrapper and does not expose grid coordinates or spanning.
The renderer does not require it around every grid child. Avoid a wrapper when
the child already owns its necessary layout.

#### Composition: grid > grid-item

```dil
<grid columns={2} gap={3}>
  <grid-item border padding={3} radius="lg">
    <title>Alpha</title><text>12 sample units</text>
  </grid-item>
  <grid-item border padding={3} radius="lg">
    <title>Beta</title><text>18 sample units</text>
  </grid-item>
</grid>
```

#### Component: spacer

```text
Properties: none

Children: none
```

Use as a flexible child in a row to consume remaining space. It does not accept a
size, height, width, or direction prop. Use layout gap/padding for fixed spacing.
An isolated spacer in ordinary vertical content does not promise a fixed blank
region. Keep spacing intent on the parent whenever possible.

#### Component: divider

```text
Properties: none

Children: none
```

Render a standard separator. No orientation, thickness, color, or layout props
are exposed. Use it between meaningful groups rather than after every line.
Do not place it directly among table rows or radio children; those parents require
their named child types. Put separation inside a cell/content region if needed.

#### Component: table

```text
Properties: none

Children: table-row
```

The renderer supplies the body element. Do not emit table-section, tbody, thead,
tr, td, or th. DIL table has no column sizing, header, dividers, or caption prop.
Describe the table with nearby text/title and use a first row of readable labels
when using component cells. For ordinary header semantics and prose-only cells,
prefer a Markdown table.

Keep row widths consistent by generating the same number of cells. There is no
colSpan or rowSpan. Use a two-column key/value table instead of inventing spanning
to present irregular data. For empty data, render a caption outside the table
through a conditional rather than inserting arbitrary text directly into it.

#### Component: table-row

```text
Properties: none

Children: table-cell
```

Place directly under table, optionally produced by each/if directives. It has no
selected, header, background, onClick, or layout API. If a row needs an action,
place a button inside a cell. A pressable cannot replace the structural row.
Do not wrap rows in box or grid-item under table.

#### Component: table-cell

```text
Properties:
  layout

Children: generic
```

Place directly under table-row. Cells may contain text, badges, nested layout,
controls, or a small chart. Layout props style the cell; they do not change table
structure. There is no align prop with text-alignment semantics beyond the shared
layout reader, no colSpan/rowSpan, and no header role selection. Use nested rows
or text formatting only when their actual contract meets the task.

#### Composition: table > table-row > table-cell

```text
<table>
  children: table-row
  <table-row>
    children: table-cell
    <table-cell>
      children: generic
```

```dil
{@body const records = [{id:"a",name:"Alpha",amount:12},{id:"b",name:"Beta",amount:18}]}
<table>
  <table-row><table-cell><text weight="medium">Name</text></table-cell><table-cell><text weight="medium">Amount</text></table-cell></table-row>
  {#each records as item}
    <table-row><table-cell>{item.name}</table-cell><table-cell><text tabularNums>{item.amount}</text></table-cell></table-row>
  {/each}
</table>
```

#### Component: popover

```text
Properties: none

Children: popover-trigger | popover-content
```

Compose one trigger region and one content region. Open/close behavior belongs to
the stock overlay. No open/defaultOpen/onOpenChange prop is exposed to DIL. Do not
add state solely to imitate the existing trigger behavior. Place related optional
details or controls in the content and keep the triggering label meaningful.

#### Component: popover-trigger

```text
Properties: none

Children: one button
```

Place exactly one button inside. The trigger context composes that button with
the overlay behavior; it does not make an arbitrary box or text node a trigger.
The button can have normal button props. It needs no onClick to open the popover.
Avoid combining unrelated privileged work with merely opening optional details.

#### Component: popover-content

```text
Properties:
  side: "top" | "bottom" (optional; default bottom)
  align: "end" | "center" (optional; default center)

Children: generic
```

Place directly under popover. The widget bounds content to the viewport. It has
no width, padding, layout, modal, placement-offset, or animation prop. Put a box
inside when the content needs layout. Side values other than top fall back to
bottom; align values other than end fall back to center. Generate only the stated
values. Content can contain inputs or actions as siblings in a normal layout.

#### Composition: popover > popover-trigger + popover-content

```text
<popover>
  children: popover-trigger | popover-content
  <popover-trigger>
    children: one button
  <popover-content>
    children: generic
```

```dil
<popover>
  <popover-trigger><button variant="outline">Details</button></popover-trigger>
  <popover-content side="bottom" align="end">
    <box gap={2}><title>Review notes</title><text>No additional action is required.</text></box>
  </popover-content>
</popover>
```

#### Component: carousel

```text
Properties: none

Children: carousel-item
```

Render a horizontal item collection with built-in previous/next controls. Keep
items as direct children. There is no activeIndex, items data prop, onChange,
autoplay, orientation, or slide-size API. Do not use it to represent a required
stepper whose progression must be controlled by validation.

#### Component: carousel-item

```text
Properties: none

Children: generic
```

Place under carousel. Each slide has a stock width and vertical content wrapper.
Use a box inside for border/padding/background customization. A carousel-item
does not accept layout props itself. Keep items understandable independently and
avoid placing essential instructions only on an undiscovered later slide.

#### Composition: carousel > carousel-item

```text
<carousel>
  children: carousel-item
  <carousel-item>
    children: generic
```

```dil
<carousel>
  <carousel-item><box border padding={4}><title>Alpha</title><text>First option.</text></box></carousel-item>
  <carousel-item><box border padding={4}><title>Beta</title><text>Second option.</text></box></carousel-item>
</carousel>
```

### Input components

#### Component: button

```text
Properties:
  aria-label: string (optional)
  disabled: boolean (optional; default false)
  variant: "outline" | "ghost" | "default" (optional; default default)
  size: "sm" | "xs" | "default" (optional; default default)
  block: boolean (optional; default false)
  onClick: callback () => void (optional)

Children: inline
```

Use for explicit actions. Inline children may include icon and text. Give icon-only
buttons aria-label; keep the name about the action rather than the icon. A label
fallback exists for some stock source patterns, but generation must provide a
clear name instead of depending on those demo-oriented fallbacks.

Default is a filled action, outline is bordered, and ghost is low-chrome. Unknown
variant or size strings fall back to default; do not generate unsupported styles.
Block makes the button full-width. There is no href, type, loading, icon prop,
layout prop set, or arbitrary DOM event forwarding. Buttons are not form submits.

The authored disabled prop and runtime readiness both affect availability. A
streaming or stopped document may keep a control unavailable even when disabled
is false. Do not use enabled appearance as proof that an expression has completed.
Keep handler logic safe independently of a disabled UI guard.

```dil
{@body const [count,setCount] = DIL.useState(0)}
<button variant="outline" onClick={() => setCount(previous => previous + 1)}>
  <icon name="mouse-pointer-click"/> Increment
</button>
<text>{count}</text>
```

#### Component: pressable

```text
Properties:
  layout
  color: string (optional)
  onClick: callback () => void (optional)

Children: generic
```

Render a button-like full-card action whose children may include noninteractive
layout and block content. Keep the action name visible in its content. There is
no authored aria-label or disabled prop. Do not add them just because the backing
element is a browser button. Use button when a task needs authored disabled state.

Never nest buttons, inputs, radio groups, checkbox, links, or another pressable
inside. Place secondary actions beside the pressable, not inside its clickable
surface. Layout props apply to the surface; color affects foreground. The widget
provides the same action clipboard feedback as button for supported copy actions.

#### Component: input

```text
Properties:
  aria-label: string (optional in API; supply for generation)
  value: string (optional; default empty string)
  placeholder: string (optional; default empty string)
  disabled: boolean (optional; default false)
  onChange: callback (value:string) => void (optional)

Children: none
```

Use as a single-line string input. Bind value and onChange to document state when
other content depends on edits. OnChange receives a string, not a DOM event. There
is no type, numeric parsing, email mode, required, pattern, minLength, maxLength,
autoComplete, onBlur, or onKeyDown prop. Use explicit string validation and number
conversion in derived expressions if the task requires them.

Placeholder is a hint, not a persistent accessible label. Provide aria-label and,
when useful, a sibling label with matching words. The visual label component does
not associate itself through an ID. Keep validation messages as visible siblings.

The widget holds immediate local text drafts while worker updates are acknowledged,
including composition input. That does not create a document binding when no
onChange/setter exists. Bind state deliberately rather than reading DOM state.
Avoid assuming that a local field draft is persisted beyond the document.

#### Component: slider

```text
Properties:
  aria-label: string (optional in API; supply for generation)
  min: number (optional; default 0)
  max: number (optional; default 100)
  step: number (optional; default 1)
  value: number (optional; default 0)
  marks: {label:string}[] (optional; default no marks)
  disabled: boolean (optional; default false)
  onChange: callback (value:number) => void (optional)

Children: none
```

Use a finite numeric range with min < max and step > 0. Keep value within the
range and choose an initial value aligned with the intended step. The widget
accepts one numeric value and emits one number; it is not a multi-thumb range
control. There is no defaultValue, orientation, tick-value, format, or value-label
prop. Show a sibling text value when users need the precise current number.

Marks are labels distributed along the control. Records do not accept position,
value, color, or onClick fields. A mark named 50 does not itself place a tick at 50. Use a short set of endpoint/context labels consistent with the range.

```dil
{@body const [level,setLevel] = DIL.useState(40)}
<label>Level</label>
<slider aria-label="Level" min={0} max={100} step={5} value={level} onChange={setLevel} marks={[{label:"Low"},{label:"High"}]}/>
<text tabularNums>{level}%</text>
```

#### Component: checkbox

```text
Properties:
  checked: boolean (optional; default false)
  disabled: boolean (optional; default false)
  lineThrough: boolean (optional; default true)
  onChange: callback (checked:boolean) => void (optional)

Children: inline
```

Children provide the visible clickable label. Bind checked/onChange to state for
reactive output. The callback receives boolean, not the underlying tri-state API
or a DOM event. There is no indeterminate, value, defaultChecked, name, aria-label,
or form-submission prop. Use a separate string field only when the task needs it.

LineThrough controls the checked-label styling. Set it false for settings and
consent-style choices; the default suits checklist completion. The label's checked
styling uses the bound upstream checked value, while the control can show its
immediate draft during worker acknowledgement. Keep binding complete rather than
using local draft behavior as a state-management mechanism.

#### Component: radio-group

```text
Properties:
  aria-label: string (optional in API; supply for generation)
  value: string (optional; default empty string)
  direction: "row" (optional; omitted gives vertical arrangement)
  onChange: callback (value:string) => void (optional)

Children: radio
```

Use for one choice among visible options. Bind value/onChange to state and give
each radio a unique nonempty string value. Use direction="row" for a wrapping
horizontal group. A direction="column" prop is not an additional enum member;
omit the prop for vertical. No authored disabled prop exists for the group or
its radios. Runtime readiness may disable them while source is incomplete.

#### Component: radio

```text
Properties:
  value: string (required for generation)

Children: inline
```

Place directly under radio-group, possibly through each/if. Children supply the
visible label. Selection and callbacks belong to the group; radio has no checked,
onChange, disabled, name, or layout props. Do not use a standalone radio outside
its required group context.

#### Composition: radio-group > radio

```text
<radio-group>
  children: radio
  <radio>
    children: inline
```

```dil
{@body const [billing,setBilling] = DIL.useState("monthly")}
<radio-group aria-label="Billing" value={billing} onChange={setBilling} direction="row">
  <radio value="monthly">Monthly</radio>
  <radio value="annual">Annual</radio>
</radio-group>
<text>Selected: {billing}</text>
```

#### Component: segmented-control

```text
Properties:
  aria-label: string (optional in API; supply for generation)
  value: string (optional; default empty string)
  options: {value:string,label:string}[] (required for generation)
  onChange: callback (value:string) => void (optional)

Children: none
```

Use a short array of distinct nonempty string values and readable labels. Bind
value/onChange to state. The component emits the selected string, ignoring an
empty deselection value. Keep the bound selection among options unless a deliberate
initial unselected state is required. It has no multi-select, disabled, option
icons, per-option callbacks, or arbitrary child composition.

Segmented-control selects a value; it is not an authored tabs/panel component.
Render content for the selection using if directives. Do not invent tab-panel,
onTabChange, or content props. For long choices, prefer radio-group with readable
labels rather than crowded segments.

## 4. Specialized components

### Data-linked components

There is no stock query, remote-data, subscription, provider, entity-card, or
service-connected component. The supported data-bearing visualization props are
Chart.content and NodeGraph.content. Their data shapes are specified under Charts.
Ordinary text, tables, and repeated layouts can also display supplied records.
None of those components fetches facts based on its label or content keys.

When the enclosing task supplies data, include the relevant records as literal
values in a declaration. Keep only fields needed for the interface. Preserve
stable IDs, units, and source labels. If the input is incomplete, show the known
fields with an explicit unknown/empty condition rather than fabricating values.
Do not infer a remote endpoint from a component name.

Separate facts from local interaction state. A const record is a good authoring
representation of read-only supplied facts; it is not a frozen JavaScript object
or an enforced immutable data store. Treat it as read-only by instruction. Use
useState for a selected record, draft, filter, or local edit. Do not claim that
changing that state updates the original external system.

#### Task: supplied-data-summary

```dil
{@body const records = [{id:"a",name:"Alpha",amount:12},{id:"b",name:"Beta",amount:18}]}
{@body const [query,setQuery] = DIL.useState("")}
{@body const visibleRecords = records.filter(item => item.name.toLowerCase().includes(query.toLowerCase()))}
{@body const visibleTotal = visibleRecords.reduce((sum,item) => sum + item.amount,0)}
<input aria-label="Filter records" value={query} onChange={setQuery}/>
<text>{visibleRecords.length} records, {visibleTotal} sample units</text>
{#if visibleRecords.length > 0}
  {#each visibleRecords as item}<text>{item.name}: {item.amount}</text>{/each}
{:else}
  <caption>No matching records.</caption>
{/if}
```

The filter transforms supplied data locally. It does not make a search request.
Use wording such as Filter records rather than Search the database when no database
operation exists. Do not add a refresh button that merely redraws unchanged facts.
A reset-filter button can be truthful because it changes local query state.

### Links and citations

No stock anchor, citation, reference card, source lookup, footnote resolver, or
URL-opening action is available. Markdown recognizes link syntax but displays the
label as an inert text span. It does not preserve the URL as a clickable target.
Markdown images do not load. The renderer's safe behavior must not be described
as browser navigation.

When a source matters, include its supplied title and visible URL in ordinary text.
Keep source numbering local and unambiguous if the input already provides it.
Do not invent a bracketed token that implies a host citation registry. A string
such as [1] is just text unless the surrounding application provides another
explicit contract. Source cards can be composed from box/title/caption, but they
remain informational and do not gain privileged behavior.

#### Task: source-attribution

```dil
<box border padding={3} gap={2}>
  <title>Supplied source</title>
  <text>Example release notes</text>
  <caption>https://example.com/releases</caption>
  <caption>Reference address shown as text.</caption>
</box>
```

If the user requests a navigable link, state the capability limit rather than
inventing GenUI.openUrl or window.open. A copy button may copy the supplied URL
under the documented clipboard contract. Label that action Copy URL, not Open.
Do not automatically copy a URL when displaying its source.

### Embedded application blocks

There is no authored iframe, app, embed, script, external widget, plugin frame,
browser page, or sandbox block. The renderer's own isolation frame is application
infrastructure, not a DIL component that generated source can configure. An
interactive dashboard built from supported components remains one DIL document.

CodeBlock displays or locally edits source. It does not compile an app, install
dependencies, execute a preview, create a file, or host a separate application.
Do not present its editor as a working code runner. If the task needs a mock
application, implement its supported local interactions with state and components
and label any unimplemented server behavior accurately.

Custom components are available only under an explicit host-supplied authoring
contract. That contract must establish exact case-sensitive names, property types,
children, callback arguments, data boundaries, and any host actions. A demo showing
a host component override is not an instruction to generate that component in
another document. Do not guess a custom component because the stock vocabulary
lacks a desired feature.

The stock specification validator cannot establish arbitrary custom host semantics.
If a host contract exists, validate custom examples against that contract and the
real host integration. Keep the distinction visible in the generation instructions.
Without such a contract, use only stock components and state the unsupported part.

## 5. Visualizations

### Images

Use AsyncImage under its Media components contract when a placeholder illustration
fits the task. It cannot display a supplied photograph URL. Do not put a URL in
query and claim the result is the referenced image. Markdown image syntax is
suppressed; there is no stock img/src escape hatch.

For simple authored illustrations, use the presentation-only SVG vocabulary. Put
a text description next to the visual and keep important values available as text.
SVG is useful for a small static schematic, not a replacement for accessible
controls, arbitrary HTML, or a browser canvas application.

#### Component: svg

```text
Properties:
  svg props

Children: SVG elements
```

Shared SVG props:

```text
viewBox: string
width: number | string
height: number | string
x: number | string
y: number | string
cx: number | string
cy: number | string
r: number | string
rx: number | string
ry: number | string
d: string
fill: string
stroke: string
strokeWidth: number | string
fontSize: number | string
fontWeight: number | string
opacity: number | string
id: string
markerWidth: number | string
markerHeight: number | string
refX: number | string
refY: number | string
orient: string
markerEnd: string
```

All SVG props are optional at the reader boundary; choose the subset required for
the selected geometry. Give the root viewBox and practical dimensions so the
image is visible and bounded. Use a simple fill/stroke and finite coordinates.
SVG strings do not use the DIL semantic-color translation; choose literal safe
paint values such as #5e4cff, currentColor, or none where appropriate.

Allowed SVG elements: svg, defs, marker, path, rect, circle, line, polyline,
polygon, g, ellipse, text, tspan, linearGradient, stop. Their names are exact;
linearGradient is not linear-gradient. These descendants are recognized only in
an SVG subtree. A text tag there is an SVG text element, not the DIL text component.
Do not place DIL controls or layouts inside an SVG drawing.

The attribute allowlist is shared, not a complete per-element SVG schema. A prop
being allowed does not mean it has meaning on every element. Use width/height for
rect, cx/cy/r for circle, cx/cy/rx/ry for ellipse, and d for path. The allowlist
does not expose x1/y1/x2/y2 or points; use path for explicit lines and polygons.
Empty line/polyline/polygon elements may parse and render without useful geometry.

Gradient and stop elements are recognized, but offset, stopColor, gradientUnits,
x1/x2, and related full-SVG controls are not exposed. Do not promise an authored
multi-stop gradient with this restricted surface. Choose solid paint for reliable
illustrations. The examples include these recognized elements to show the actual
supported vocabulary and its limits, not to invent the missing attributes.

SVG values are filtered for dangerous/external strings. External http/data targets,
JavaScript URLs, markup-like/declaration strings, and nonlocal URL references are
not accepted. Local references such as `url(#arrow)` are supported for paint or
marker use. Choose simple document-local IDs containing letters, digits, underscores,
or hyphens. Avoid colliding IDs across several authored SVGs in one document.

There is no href, xlink:href, style, className, transform, event handler, aria-label,
role, foreignObject, script, image, a, animate, or arbitrary SVG element/prop API.
Do not add them. An SVG element has no onClick bridge and cannot authorize a host
action. Use a real button next to the drawing if the user needs an action.

#### Composition: svg > defs > marker; svg > g > path + text

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

The tree describes useful combinations for generation; it is not a claim that
the parser validates a complete SVG content model. Keep definitions in defs,
shape groupings in g, and text spans inside text. Use nested tspan only for simple
text positioning supported by x/y; there is no dx/dy/textAnchor API.

```dil
<caption>Flow from Alpha to Beta.</caption>
<svg viewBox="0 0 320 100" width="100%" height={100}>
  <defs>
    <marker id="flow-arrow" markerWidth={10} markerHeight={10} refX={8} refY={3} orient="auto">
      <path d="M0 0 L8 3 L0 6 Z" fill="#5e4cff"/>
    </marker>
  </defs>
  <g>
    <rect x={10} y={20} width={90} height={55} rx={8} fill="#eeeeff"/>
    <rect x={220} y={20} width={90} height={55} rx={8} fill="#eeeeff"/>
    <path d="M105 47 L210 47" stroke="#5e4cff" strokeWidth={2} markerEnd="url(#flow-arrow)"/>
    <text x={25} y={52} fontSize={16} fill="#252838">Alpha</text>
    <text x={235} y={52} fontSize={16} fill="#252838">Beta</text>
  </g>
</svg>
```

### Charts

Use Chart for quantitative plots, NodeGraph for selectable service-style node
diagrams, and Mermaid for declarative diagram text. They have separate contracts;
do not combine their content formats. Each is a leaf component. Place a nearby
title, units, and summary in normal layout siblings.

#### Component: Chart

```text
Properties:
  content: object (required for generation)

Children: none
```

Line/bar/scatter content:

```text
{
  chartType: "line" | "bar" | "scatter",
  data: object[],
  xKey: string,
  series: {dataKey:string,label?:string}[]
}
```

Pie content:

```text
{
  chartType: "pie",
  data: object[],
  nameKey: string,
  valueKey: string
}
```

Supply chartType explicitly. An absent or unrecognized type currently follows
the line rendering branch, but that fallback is not an invitation to generate
other names. Only line, bar, scatter, and pie are supported chart types. Do not
emit area, radar, bubble, candlestick, heatmap, or composed-chart components.

Data is an array of plain records. For line/bar, xKey identifies a category or
numeric x field; each series dataKey identifies a finite numeric y field. Label
is optional and falls back to dataKey. Keep field keys and series keys stable and
distinct. Supply units in nearby text rather than inventing axis-formatting props.
Do not place React components, functions, or expression strings inside content.

Scatter uses numeric x data and the first series' dataKey for the shared numeric
y-axis configuration. Use one series for the clearest contract. If several series
are used, keep numeric fields and units compatible; there is no per-series axis
or arbitrary domain configuration. Line/bar may display several series from the
same data rows. Missing numeric values are not a defined missing-data policy;
preprocess supplied data deliberately and explain unknown values in text.

Pie uses nameKey for labels and valueKey for quantitative slices. Prefer unique
nonempty string names and nonnegative finite values with a positive total. It
renders a ring-style pie using stock radii. There is no innerRadius, label
formatter, custom sector, selectedSlice, or click callback API.

Stock chart dimensions, palette, axes, tooltip, marks, and legend are internal.
No DIL width/height/layout, color, onSelect, onClick, tooltip, axis, domain, or
legend prop is exposed. A wrapper can constrain available width but cannot set a
new chart-content schema. Do not infer the full Recharts API from the underlying
implementation.

Multi-series line/bar legends support internal visibility selection. This widget
state is not exposed as a DIL binding and does not invoke an authored callback.
Scatter and pie legends do not offer the same multi-series selection contract.
Hover/focus emphasis is presentation behavior, not data selection available to
other document components.

#### Task: line-chart

```dil
<title>Sample trend</title>
<Chart content={{chartType:"line",data:[{month:"Jan",actual:10,plan:12},{month:"Feb",actual:15,plan:14}],xKey:"month",series:[{dataKey:"actual",label:"Actual"},{dataKey:"plan",label:"Plan"}]}}/>
<caption>Synthetic units. Actual rises from 10 to 15.</caption>
```

#### Task: pie-chart

```dil
<Chart content={{chartType:"pie",data:[{name:"Alpha",amount:30},{name:"Beta",amount:70}],nameKey:"name",valueKey:"amount"}}/>
<caption>Synthetic shares: Alpha 30%, Beta 70%.</caption>
```

When chart data is empty, show an explicit empty-state caption instead of claiming
the absence of marks means a zero result. Use a small textual table when values
matter more than the visual. Do not fabricate enough points to make a supplied
dataset appear more complete. If a transformation drops records, explain why.

#### Component: NodeGraph

```text
Properties:
  content: object (required for generation)
  selectedId: string (optional; no selected node when omitted)
  onSelect: callback (id:string) => void (optional)

Children: none
```

Content:

```text
{
  nodes: {id:string,label:string,sub?:string,x?:number,y?:number}[],
  edges: {id?:string,source:string,target:string,label?:string}[]
}
```

Use unique nonempty string node IDs. Label is the main node text and sub is an
optional secondary line. x/y are optional finite positioning hints. Without
positions, nodes are arranged in a simple multi-column layout. The renderer
adjusts columns and vertical placement to keep nodes readable, so positions are
not a pixel-exact canvas contract.

Edges refer to existing node IDs by source and target. Give edges stable IDs when
supplied; otherwise the renderer uses positional IDs. Invalid endpoints are
filtered. Only the first 200 nodes and first 400 edges are considered; an edge
to a truncated node will not appear. Keep author output within the limits and
summarize oversized supplied networks rather than silently claiming full coverage.

SelectedId controls visible node selection. OnSelect receives the clicked node's
string ID. Bind the pair to state if selection should update another panel or
remain visibly selected. Without that binding, a callback alone does not update
the selectedId prop. There is no selected-node record argument or DOM event.

Node dragging and connection creation are disabled. Pan/zoom controls are built
in; no DIL camera, zoom, connect, drag, edge click, node style, node type, handle,
or custom action prop exists. Treat the graph as a navigable selection display,
not an editable diagramming application. State changes must use supported callbacks.

```dil
{@body const [selectedId,setSelectedId] = DIL.useState("api")}
{@body const graph = {nodes:[{id:"api",label:"API",sub:"Entry"},{id:"db",label:"Database",sub:"Storage"}],edges:[{id:"api-db",source:"api",target:"db",label:"reads"}]}}
<NodeGraph content={graph} selectedId={selectedId} onSelect={setSelectedId}/>
<text>Selected service: {selectedId}</text>
```

#### Component: Mermaid

```text
Properties:
  source: string (required for generation)

Children: none
```

Pass Mermaid diagram text as a string expression. A fenced mermaid block is an
alternative Markdown representation using the same diagram renderer. Do not put
raw children between Mermaid tags; the component reads its source prop only.
Use a simple flowchart or another valid Mermaid diagram syntax without app-level
configuration.

The renderer uses strict security, neutral theme, no HTML labels, maximum text
size 8,192 characters, and maximum 100 edges. Authored configuration directives,
frontmatter at the start, classDef, style/linkStyle lines, click actions, and
HTML-like source are rejected. Output is sanitized to remove unsafe SVG content,
including links, scripts, and foreignObject. Do not depend on a sanitized link to
become navigable.

Invalid or incomplete source can display a diagram error. Keep Mermaid source
small and syntactically complete. There is no authored callback, theme, config,
download, source editor, or node-selection API. Use NodeGraph if the task requires
supported selection state rather than attempting Mermaid click handlers.

```dil
<Mermaid source={"flowchart LR\n  Request --> Review\n  Review --> Ready"}/>
```

### Maps

No map component, map adapter, tiles, geocoder, geographic marker, route engine,
or map selection callback exists. Do not emit Map, GeoMap, map, marker, or arbitrary
HTML embeds. A node graph is not a geographic coordinate system. SVG can show a
small authored schematic, but that does not establish a map-data integration.

Present supplied places as text, a table, or local filtering over records. Preserve
given coordinates as values rather than inventing geocoding results. If location
names lack coordinates, do not claim a computed distance or route. Show the
capability limit when an interactive map is central to the request.

#### Task: location-table

```dil
{@body const places = [{id:"berlin",name:"Berlin",latitude:52.52,longitude:13.405}]}
<title>Supplied locations</title>
<table>
  {#each places as place}
    <table-row>
      <table-cell>{place.name}</table-cell>
      <table-cell>{place.latitude}, {place.longitude}</table-cell>
    </table-row>
  {/each}
</table>
<caption>Coordinates are shown as supplied; no map or geocoding service is connected.</caption>
```

## 6. Interactivity

### State management

Only `DIL.useState(initialValue)` is supported. It is recognized by the declaration
syntax and does not expose the React hook object. Use one unique state pair per
declaration. A lazy initializer runs when that state name is first initialized.
Do not call hooks in interpolation, handler bodies, derived const expressions,
conditional branches, or repeated templates.

Setters accept a replacement value or a function mapping previous state to next
state. Use an updater whenever a new value depends on the previous value and
several actions may be queued. Keep the updater pure. It may build a new array
or object using ordinary JavaScript expressions; do not mutate previous state.

```dil
{@body const [count,setCount] = DIL.useState(0)}
<row gap={2} align="center">
  <button onClick={() => setCount(previous => previous + 1)}>Increment</button>
  <button variant="outline" onClick={() => setCount(0)}>Reset</button>
  <text tabularNums>{count}</text>
</row>
```

Replace arrays with map/filter/spread and replace changed records with object
spread. Mutation such as items.push, record.done=true, or sort in place does not
establish the intended setter/dependency contract. Use a copied array before sort.
Keep source facts separate from editable state so an agent can tell which values
are user drafts.

State is document-owned. It persists across appends, conditional visibility, and
virtualized presentation within that document. A new message/document identity or
replacement can reset it. There is no storage or cross-message state API. Do not
promise reload persistence, multi-user synchronization, browser-tab sharing, or
server write-back.

Repeated source shares top-level state. Represent per-record edits with an array
of records or an object keyed by stable ID. Never create a body declaration inside
each expecting an independent state instance. Use the repeated item ID in the
handler's immutable update instead.

#### Task: repeated-record-state

```dil
{@body const [tasks,setTasks] = DIL.useState([{id:"a",label:"Review Alpha",done:false},{id:"b",label:"Review Beta",done:false}])}
{@body const completeCount = tasks.filter(task => task.done).length}
<text>{completeCount} of {tasks.length} complete</text>
{#each tasks as task}
  <checkbox checked={task.done} onChange={checked => setTasks(previous => previous.map(entry => entry.id === task.id ? {...entry,done:checked} : entry))}>
    {task.label}
  </checkbox>
{/each}
```

Ordinary const getters are sufficient for derived count, totals, filtered arrays,
validity, and selected-record lookup. They are not a caching API. Do not generate
useMemo or useCallback to optimize a DIL document. Keep expensive transformations
small and reuse a readable binding when it improves correctness.

Widget-local state has a different contract. Input/slider/checkbox keep immediate
drafts while worker callbacks complete. CodeBlock retains editable source drafts.
Chart legends hold visibility internally. Popover/carousel maintain their own
interaction state. Only documented bindings expose values back to authored DIL.
Do not try to read internal widget state through refs, DOM, hidden props, or globals.

### Event callbacks

Callback values may be setter references, derived function bindings, or function
expressions. Pass the function; do not invoke it while assigning the prop. For
example, onChange={setName} is a callback, while onChange={setName("Ada")} performs
work during evaluation and does not supply a valid handler.

#### Callback: button.onClick and pressable.onClick

Signature: `() => void`. Ignore the undefined argument supplied by the generic
invocation path. There is no MouseEvent, target, currentTarget, preventDefault,
stopPropagation, or coordinates. Use captured declared values to determine the
action. A user activation on these supported action controls can authorize a
synchronous GenUI.copy request; arbitrary callbacks do not gain that authority.

#### Callback: input.onChange

Signature: `(value:string) => void`. Receive the complete current input string.
Use a setter directly for simple controlled input. For a transform, use a function
that calls the setter with the transformed value. Keep the value prop a string.
Do not read event.target.value or depend on an input-type conversion API.

#### Callback: slider.onChange

Signature: `(value:number) => void`. Receive the scalar numeric value, not an array
of thumb values or a browser event. Bind the number directly and derive formatted
text separately. Do not put a clipboard request in this handler; slider changes
are not privileged action-control activations.

#### Callback: checkbox.onChange

Signature: `(checked:boolean) => void`. Receive true or false. The underlying UI
library's indeterminate representation is normalized; it is not exposed as a DIL
value. Bind checked to boolean state. Keep the callback about changing local choice
state, and use a separate action button for copying or other explicitly supported
privileged work.

#### Callback: radio-group.onChange and segmented-control.onChange

Signature: `(value:string) => void`. Receive the selected option's value, not its
label or a record. Resolve a record with a derived lookup if the UI needs more
fields. Selection does not submit a form. Segmented-control ignores an empty
deselection value; do not use empty option strings as ordinary choices.

#### Callback: NodeGraph.onSelect

Signature: `(id:string) => void`. Receive the node ID. Bind selectedId to state
and derive the selected node from content.nodes if needed. There is no graph
event object, coordinates, edge ID, or selection array. Selection callbacks do
not authorize clipboard requests.

Keep callback bodies synchronous and bounded. A callback can update several local
state values in order, but it is not a lifecycle effect or an asynchronous task
runner. Do not depend on a Promise return value, timer, network response, or host
callback completion. State setters have no success receipt available to authored
source. Derive updated UI from state, not from guessed render timing.

Control readiness is managed by the runtime. Open/incomplete source, unresolved
expressions, or a stopped document can make controls temporarily unavailable.
Do not add a fake loading hook or artificial timer to work around that state.
Generate complete source and let the existing renderer manage readiness.

There are no onSubmit, onInput, onBlur, onFocus, onKeyDown, onLoad, onError,
onOpenChange, onValueChange, onDrag, or arbitrary DOM callbacks in the author API.
Do not copy underlying React primitive names into DIL. Use the event names listed
here, including the capitalized NodeGraph component name.

#### Task: validation-form

There is no form tag or browser validation contract. Compose a field, derived
validity, visible error text, and guarded action. A disabled button is useful
feedback; a handler guard ensures the action itself also checks validity.

```dil
{@body const [name,setName] = DIL.useState("")}
{@body const trimmedName = name.trim()}
{@body const valid = trimmedName.length >= 2 && trimmedName.length <= 80}
<box gap={3} maxWidth={420}>
  <label>Name</label>
  <input aria-label="Name" value={name} onChange={setName} placeholder="At least two characters"/>
  {#if !valid}<caption color="danger">Enter a name between 2 and 80 characters.</caption>{/if}
  <button disabled={!valid} onClick={() => { if (valid) GenUI.copy(trimmedName); }}>Copy name</button>
</box>
```

This copies a valid local draft. It does not submit, save, create a user, or email
anyone. If the requested outcome requires an absent host action, state that limit
and do not substitute a misleading success message. Do not call the copy result
a successful form submission.

### Data bindings

There is no predefined external-data variable, provider registry, props object,
context hook, request result, subscription, or remote mutation API. Embed supplied
JSON-compatible records in a top-level const declaration. A host can supply a
separate custom contract, but stock generated source must not guess one.

Read fields with dot access, optional chaining, and computed keys. Use pure array
and string operations to transform data for display. Computed property names are
supported JavaScript expressions, not a remote query language. Only access fields
present in the supplied data or created by the document. Use explicit null/empty
checks when the input permits absent values.

Use const bindings as read-only source facts by instruction. This is not an
enforced Object.freeze guarantee. Use state for drafts and preserve source IDs.
Do not change source data in place to imitate a two-way binding. A state change
updates dependent expressions; it does not write back to an external origin.

Binding scope:

| Binding               | Visible where                                               | Lifetime                    |
| --------------------- | ----------------------------------------------------------- | --------------------------- |
| Top-level const/state | Same document's expressions and callbacks                   | Mounted document            |
| each item/index       | Rendered subtree of that iteration, including nested scopes | Corresponding item instance |
| Callback parameter    | Its function body                                           | Callback invocation         |
| Code editor draft     | Internal CodeBlock only                                     | Document draft identity     |
| Chart legend state    | Internal Chart only                                         | Widget presentation state   |

A body declaration is always document-scoped and never captures a loop binding.
An event function expression inside a repeated rendered subtree can capture its
item/index scope. Use the stable item ID in updates rather than a potentially
stale position. Keep source declarations outside the repeated template.

```dil
{@body const supplied = [{id:"a",name:"Alpha",amount:12},{id:"b",name:"Beta",amount:18}]}
{@body const [selected,setSelected] = DIL.useState("a")}
{@body const current = supplied.find(item => item.id === selected)}
{#each supplied as item}
  <button variant="outline" onClick={() => setSelected(item.id)}>{item.name}</button>
{/each}
{#if current}<text>{current["name"]}: {current.amount}</text>{:else}<caption>No selection.</caption>{/if}
```

Use the same principle for chart data: derive a plain content object or use bound
arrays within content. The chart does not subscribe to the originating dataset;
it re-renders from the supplied prop. An empty array is an empty dataset, not a
loading indication. Loading and failed-request states require explicit supplied
facts or a separate host contract; do not fabricate asynchronous phases.

### Host actions

Only `GenUI.copy(text:string): undefined` is exposed. It requests a clipboard
write of at most 65,536 characters. It does not read the clipboard or create a
file. Pass an actual string; serialize records deliberately if the requested
task is to copy JSON. A nonempty request is required for a dispatched copy;
empty text currently produces no clipboard operation.

Invoke copy synchronously in a button or pressable onClick after explicit user
activation. The renderer carries an action intent through the host boundary and
associates the clipboard outcome with that initiating control. A valid-looking
call in initialization, interpolation, a getter, a value-change handler, or a
node-selection callback cannot confer the required authorization.

Do not defer copy through Promise.then, async/await, timers, or an automatic
effect. Those are not documented action paths. Do not forge internal receipt or
gesture fields. Copy authorization and browser/platform permission are separate:
the platform can deny a correctly invoked request.

```dil
{@body const report = "Review complete: Alpha and Beta checked."}
<button onClick={() => GenUI.copy(report)}><icon name="copy"/> Copy report</button>
```

Call once per action. The VM tracks one copy value for an execution; several copy
calls do not establish an ordered batch of clipboard writes. Keep the requested
payload below the limit and construct it before invocation with a pure binding.
If copying a selected record, validate that selection exists in the handler.

The call returns undefined. It is not a Promise and does not return success or
failure to authored source. Do not branch on its return value or set copied=true
immediately after calling it. Button/pressable display Copied or Copy failed using
the actual host outcome. CodeBlock's built-in copy control has its own feedback.
Use that behavior rather than duplicate success flags or guessed timeouts.

Clipboard denial should leave the existing content and local draft available.
Users can retry the same explicit action after resolving platform permissions.
Do not clear the input merely because copy was requested. Do not promise a
clipboard read-back or automatic retry; neither is an author API.

Unsupported host operations include openUrl, issueNewTurn, download, export,
file creation, printing, network requests, storage, browser navigation, arbitrary
postMessage, and server mutations. Mention an unavailable capability when it is
essential to the requested task. Never replace it with an invented GenUI method.
The renderer's own transport and widget-internal browser calls are not privileges
granted to authored expressions.

#### Task: host-action-review

Check the control, event, payload type, payload length, and execution timing.
A copy button with a string payload and synchronous onClick is supported. A
slider onChange that calls copy, a const getter that calls copy while rendering,
or an automatic initialization call is unsupported even if the text is harmless.
Keep copy requests intentional and visible to the person activating the control.

## 7. Assets

### Icons

#### Component: icon

```text
Properties:
  name: string (required for generation)
  size: "xs" | "lg" (optional; default 17px)
  color: string (optional)

Children: none
```

Supported names:

```text
chart-no-axes-combined
circle-check
check-circle-2
circle
wallet
trending-up
users
rotate-ccw
copy
sliders-horizontal
ellipsis
sparkles
mouse-pointer-click
x
git-merge
package-check
shield-check
settings-2
info
code-2
alert-triangle
```

Use exactly these names. An unknown name falls back to circle, which can conceal
a generation mistake rather than raise an error. Do not request an external
Lucide name because the renderer internally uses Lucide. The allowlist is the
author API. There is no arbitrary SVG path, icon URL, upload, sprite, or library
import prop.

Size xs=13px, omitted=17px, lg=22px. There is no explicit md size enum; omit size
for the normal icon. Color uses the same semantic token/CSS color reader as DIL
text. It does not accept a CSS class, style object, or custom variable. Icons are
inline decorative elements; put them beside meaningful text.

Icons are aria-hidden in the stock renderer. They cannot carry an authored
aria-label or title prop. An icon-only button needs its own aria-label. A badge
or status line needs visible words even when its icon seems recognizable. Do not
communicate critical state using icon shape/color alone.

#### Composition: button > icon + inline text

```dil
<button onClick={() => GenUI.copy("Review complete")}>
  <icon name="copy" size="xs"/> Copy review
</button>
```

#### Composition: button > icon with accessible action name

```dil
{@body const [count,setCount] = DIL.useState(0)}
<button aria-label="Reset count" variant="ghost" onClick={() => setCount(0)}>
  <icon name="rotate-ccw"/>
</button>
<text>{count}</text>
```

Use the example catalog's icon gallery to locate all allowed names. Icons do not
create host operations: a download-looking symbol would not add a download API,
and the copy icon itself has no onClick. Put the supported action on the containing
button or pressable and obey the host-action contract.
