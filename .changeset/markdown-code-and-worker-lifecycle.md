---
"@snackbit/opendil": minor
---

Render ordinary Markdown answers reliably and use fewer workers per message.

- Inline code spans are now literal DIL source, like fenced code. `` `{ leading: false }` ``
  renders as code instead of "Cannot evaluate this value.", and `` `<div>` `` no longer
  opens a component that ends in "Unfinished div". Spans follow Markdown: a run of one
  or more backticks closes at the next run of the same length. A span ends at a blank
  line or at a line that starts a list item, heading, blockquote, fence, component tag,
  or block directive, so a stray backtick cannot hide the components after it. An
  escaped or unmatched backtick protects nothing. While streaming, the text of an open
  span appears once its closing backticks arrive or its block ends. Expressions inside
  backticks, such as `` `{user.id}` ``, no longer evaluate; put an expression outside
  the backticks to show its value.
- Fences follow Markdown more closely: longer fences (for example four backticks) can
  contain three-backtick lines, and fences inside list items, blockquotes, or right after
  a tag are recognized. A closing fence must be alone on its line, except that a
  component closing tag or block directive may follow it, as in ` ```</box> `.
- Lowercase HTML-like tags in prose that are not DIL tags, such as `<div>`, `</span>`, or
  `<br/>`, and autolinks such as `<https://example.com>` now display as plain text
  instead of producing "Unexpected closing tag" or "Unfinished ..." errors that hid the
  rest of the message. Braces in their quoted or braced attribute values stay text; any
  other brace is an expression, so `a<b then {total}` still shows the value. Capitalized
  unknown tags still render the "Unsupported DIL component" error. Lowercase names
  registered through `components` remain components.
- Each message now stops its parser worker once the final text (`isStreaming={false}`) is
  parsed and committed, and starts its QuickJS worker only when the document first needs
  an expression, state, or action. Messages of plain Markdown no longer keep a QuickJS
  worker alive. Set `isStreaming` to `false` when a response ends so its parser can stop.
  Final text stays final: if the same renderer later streams more text, it shows the
  "Start a new renderer instance" error instead of continuing; render a new instance
  (for example with a new `key`) to continue a response.
- The WebAssembly-blocked Content Security Policy error now appears only when a document
  needs the expression runtime. Check a CSP with an interactive document, not plain
  Markdown. Jobs sent while QuickJS is still starting get a longer first deadline, so a
  slow start no longer stops the document with a time-limit error.
