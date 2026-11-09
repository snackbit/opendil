/** Coalesce measurement corrections after layout; discard them if the reader moved meanwhile. */
export function viewportScroller(
  viewport: { readonly revision: number; readonly offset: number },
  send: (offset: number, revision: number) => void,
) {
  let frame = 0;
  let pending:
    { offset: number; revision: number; readingOffset: number } | undefined;
  return {
    scroll(offset: number) {
      pending = {
        offset,
        revision: viewport.revision,
        readingOffset: viewport.offset,
      };
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          const target = pending;
          pending = undefined;
          if (target && target.readingOffset === viewport.offset)
            send(target.offset, target.revision);
        });
    },
    dispose() {
      cancelAnimationFrame(frame);
      frame = 0;
      pending = undefined;
    },
  };
}
