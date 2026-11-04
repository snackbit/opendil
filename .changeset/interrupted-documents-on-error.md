---
"@snackbit/opendil": minor
---

Keep interrupted answers readable and report rendering problems to the host.

- A document that is finalized while some of its structure is still open, for
  example after the reader presses Stop, the model reaches its output limit, or
  the stream fails, keeps everything it completed. Open elements such as a
  `<grid>` render their finished children instead of being replaced by
  "Unfinished grid at character 1437". An unfinished opening tag (including a
  cut-off name such as `<butt` or a lone `<`), expression, closing tag
  (including a cut-off `</CodeBlock>`), or `{#each}` template is left out. A
  short note, "This response ended before it was finished.", follows the
  content, also when `showStatus` is `false`. With `showStatus` on, the status
  label reads "Incomplete" instead of "Complete". The element that carries
  `data-complete` also carries `data-incomplete="true"`, and `onCommit`
  receives `incomplete: true`.
- Only unfinished DIL structure marks a document incomplete. A response cut off
  in the middle of plain prose still reads "Complete", because the text alone
  does not show that it was interrupted.
- Malformed DIL now shows readers "This part of the response couldn't be
  shown." instead of developer messages with character offsets such as
  "Expected quoted value or expression for max at character 124".
- The new `onError` prop receives each distinct problem once, in every mode, as
  a `DilRenderError` with `kind` (`"incomplete"`, `"syntax"`, `"runtime"`,
  `"limit"`, or `"source"`), a developer-facing `message`, and, for parse
  problems, the `offset` in `text`. The iframe mode forwards errors from its
  frame through the private message channel, and the host validates them before
  calling `onError`. Problems with a source position and incomplete documents
  are also logged with `console.warn`, including their positions. Runtime and
  limit failures of the whole message keep their existing message on the page.
  One message reports at
  most 20 problems, then a single `limit` error saying later ones are not
  reported; the `incomplete` report still arrives, and messages are capped at
  2000 characters. The iframe host enforces the same bound on what its frame
  sends. An exception thrown by `onError` is rethrown asynchronously instead of
  interrupting rendering.
- Once a message is final, problems that readers see in one part of it also
  reach `onError` and `console.warn` with the part's `offset`: an inline
  expression that cannot be evaluated (readers still see "Cannot evaluate this
  value.") and a component whose attributes cannot be evaluated or that fails
  to render are `runtime` errors whose message includes the expression or
  component and the reason. A component name that is neither a stock component
  nor one passed in `components`, such as `<Foo>`, is a `syntax` error. These
  components show readers "This part of the response couldn't be shown."
  instead of the evaluation error or "Unsupported DIL component: Foo". While
  the message streams, nothing is reported, because later source can still
  define a missing binding.
- A finished message without content, such as an answer whose request failed
  before any text arrived, no longer shows the "Complete" status label.
- A message that exceeds the parser's node limit now reports a `limit` error,
  shows "Rendering stopped: this message has more parts than the renderer
  supports." instead of asking the reader to remount, and finishes as
  complete instead of staying at "Receiving document".
- Finalizing does not need new text: switching `isStreaming` to `false` with the
  same `text` finalizes the message. With the AI SDK, a text part's `state` can
  stay `"streaming"` after `stop()` or a stream error, so derive `isStreaming`
  from the chat `status` as well, for example
  `part.state === "streaming" && status === "streaming"`.
- `RendererMetrics` has a new `incomplete` field. Copy the runtime assets again
  after upgrading so the iframe mode reports errors and the incomplete flag;
  frames copied from earlier releases still work but report neither.
