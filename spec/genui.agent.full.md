# GenUI extended reference

Inject [the compact specification](genui.agent.md) into generation prompts.
Use [the examples](genui.examples.md) for representative tasks. See
[DIL-SPEC.md](../DIL-SPEC.md) for runtime architecture rather than generation instructions.

## Semantics and limits

State declarations are recognized by the VM's declaration parser. They are not
calls to React hooks. An ordinary const creates a getter, so evaluate only pure
expressions in derived bindings. Declarations do not inherit iteration scope.
Duplicate names can redefine getters or collide with state. Use unique names.

Stream suffixes into the parser and retain the previous source prefix at the
renderer boundary. Completion turns unfinished syntax into localized errors;
temporary incompleteness is not a successful finished document. Virtualized
unmounts do not destroy document-owned state.

QuickJS currently limits heap memory to 64 MiB, stack to 64 KiB, and each
execution to 50ms. Serialized results are bounded to 524,288 characters and
structural depth is bounded. These limits are implementation constraints, not
budgets an author should approach. Browser globals are absent; JavaScript's own
language primitives remain available. Do not claim a ban on eval is enforced.

Clipboard requests require a gesture receipt from a supported action control.
The VM's gesture flag alone is not the browser authorization boundary. Calling
copy from a value-change handler does not confer permission. Browser permission
or platform failures may still deny a valid request.

## Composition

Generate table > table-row > table-cell. The renderer supplies table body markup.
Generate radio-group > radio, carousel > carousel-item, and popover containing
popover-trigger and popover-content. A popover trigger must contain a single
button. Whitespace and control directives can surround these children.
These are authoring constraints; the parser accepts a wider syntactic tree.

## Verification

Run `npm run check:agent-spec` after building the package. The verifier reads the
renderer switch through the TypeScript AST and compares stock names and consumed
attribute names with the compact specification. Explicit widget-owner mappings
cover delegated controls and shared layout readers. SVG and icons use their
implementation allowlists. Runtime-only presentation/configuration attributes
are not authoring props.

This is not a complete schema inference engine: types, defaults, object shapes,
CSS value semantics, and child categories require source review and behavioral
tests. A new helper or indirect attribute access must be added to the extraction
mapping. Custom host components cannot be checked without their host contract.

Executable `dil` fences in all three files are parsed using the real parser.
Expressions and declarations execute in the production VM during example tests.
Browser tests prove the copy workflow and interactive examples. No remote model
is invoked. To inspect a generated response, set `GENUI_RESPONSE_FILE` to a local
file when running the focused check. Diagnostics cover the known contract;
passing does not prove every possible execution path safe or semantically useful.
