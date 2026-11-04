/** Coalesce measurement corrections after layout; discard them if the reader moved meanwhile. */
export function viewportScroller(
  viewport: { readonly revision: number },
  send: (offset: number, revision: number) => void,
) {
  let frame = 0;
  let pending: { offset: number; revision: number } | undefined;
  return {
    scroll(offset: number) {
      pending = { offset, revision: viewport.revision };
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          const target = pending;
          pending = undefined;
          if (target && target.revision === viewport.revision)
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
