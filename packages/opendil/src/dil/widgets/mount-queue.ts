import { useEffect, useLayoutEffect, useState } from "react";

/**
 * Charts and graphs take 10-30 ms each to mount. A document that shows
 * several of them when its values arrive, or when a virtualized list mounts
 * it again, would mount them in one long task. Widgets that appear after the
 * document's first commit, or whose measured height is known, mount one per
 * task instead, each after the previous one committed, holding their
 * placeholders meanwhile.
 */
const waiting = new Set<() => void>();
let mounting: (() => void) | null = null;
let scheduled = false;
function pump() {
  if (mounting || scheduled || !waiting.size) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    if (mounting) return;
    const [next] = waiting;
    if (!next) return;
    waiting.delete(next);
    mounting = next;
    next();
  }, 0);
}
function finish(turn: () => void) {
  if (mounting !== turn) return;
  mounting = null;
  pump();
}
/**
 * Whether the widget may mount. `immediate` widgets, as in a document's first
 * commit and in server rendering, mount at once.
 */
export function useMountTurn(immediate: boolean): boolean {
  const [ready, setReady] = useState(immediate);
  const [turn] = useState(() => () => setReady(true));
  useEffect(() => {
    if (ready) return;
    waiting.add(turn);
    pump();
    return () => {
      waiting.delete(turn);
      finish(turn);
    };
  }, [ready, turn]);
  // Committed: the next widget's turn starts in a later task.
  useLayoutEffect(() => {
    if (ready) finish(turn);
  }, [ready, turn]);
  return ready;
}
