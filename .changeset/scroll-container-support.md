---
"@snackbit/opendil": minor
---

Support chat layouts that scroll a message list instead of the page.

- Renderers now find the element that scrolls them: the nearest ancestor with
  `overflow-y: auto`, `scroll` or `overlay` whose content overflows by more than
  a few pixels, crossing Shadow DOM boundaries, or the window when there is
  none. The body counts when the root element clips its own overflow (app
  shells with `html { overflow: hidden }` and a scrolling body). Renderers check
  again when they resize, the window resizes, or the reader scrolls an ancestor,
  including one inside a shadow root, so a message list that starts short and
  overflows later is picked up. In such
  a list, long flows, repeated lists and repeated table rows (more than 100
  items) now mount their rows as the list scrolls in iframe, host and Shadow DOM
  modes; before, they stayed blank. `autoScroll` follows inside the list,
  `padding` uses the space below the message in the list, and `onFollowChange`
  reports `false` when the reader pauses there, so a "Jump to latest" button
  appears. Before, following did nothing in a scrolling list while still
  reporting `true`. Page-scrolled layouts behave as before.
- New `scrollContainer` prop, in every mode: `"auto"` (default) detects the
  scroller as above, `"window"` always uses the page, and an element or a React
  ref to one names it directly; `null` and a ref that is still empty behave like
  `"auto"`. A ref is read again after the commit that mounts the renderer, so a
  pane that mounts together with it is used from the first frame, and on every
  later check, so a remounted pane is picked up. Other values throw. The `ScrollContainer` type is
  exported. Pass `"window"` if detection picks a wrapper that should not scroll.
- Reading gestures pause following only when they happen in the renderer's
  scroller: the wheel, touch, middle-click and link presses inside it, a press
  on its own scrollbar, and scrolling keys pressed inside it or with nothing
  focused. With a scroll container, wheeling a sidebar or another pane no longer
  pauses following. With the window as scroller, every gesture on the page
  still counts.
- After the stream ends, `autoScroll` keeps late layout such as charts in view
  only until something else scrolls the view relative to the message's end.
  An app that scrolls to an earlier row of a finished answer, for example with
  `scrollIntoView` or by setting `scrollTop`, now stays there and
  `onFollowChange` reports `false`. Before, re-measured content pulled the view
  back to the answer's end. Scroll corrections that keep the end in place, such
  as a virtualized list adjusting for measured rows, keep following. While
  streaming, only reading gestures pause following, as before.
- While following, the renderer sets `overflow-anchor: none` on the scroller it
  follows (the scroll container's inline style, or the root element for the
  page) and restores the previous value when following pauses.
- Progressive reveal in host and Shadow DOM modes treats the scroller's visible
  area, not the whole window, as on screen.
- The frame runtime changed internally; its messages did not. Copy the runtime
  assets again with `npx opendil copy-assets` to silence the version warning.
