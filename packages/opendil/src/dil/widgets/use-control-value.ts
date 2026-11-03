import { useCallback, useContext, useState } from "react";
import { ControlRevisionContext } from "./control-revision";
import { synchronizeDraft, editDraft } from "./control-state";
/** Retain immediate native feedback while the execution worker acknowledges updates. */
export function useControlValue<T extends string | number | boolean>(
  upstream: T,
  action: unknown,
) {
  const revision = useContext(ControlRevisionContext);
  const [state, setState] = useState({
    upstream,
    value: upstream,
    revision,
    pending: 0,
  });
  const synchronized = synchronizeDraft(state, upstream, revision);
  if (synchronized !== state) setState(synchronized);
  const change = useCallback(
    (value: T, commit = true) => {
      const result: unknown =
        commit && typeof action === "function" ? action(value) : undefined;
      setState((previous) => editDraft(previous, value, result, commit));
    },
    [action],
  );
  return [state.value, change] as const;
}
