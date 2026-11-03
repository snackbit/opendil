import { ActionReceipt } from "../runtime/action-receipt";
export interface ControlDraft<T> {
  upstream: T;
  value: T;
  revision: number;
  pending: number;
}
export function synchronizeDraft<T>(
  state: ControlDraft<T>,
  upstream: T,
  revision: number,
): ControlDraft<T> {
  return revision >= state.pending &&
    (!Object.is(state.upstream, upstream) || revision !== state.revision)
    ? { upstream, value: upstream, revision, pending: 0 }
    : state;
}
export function editDraft<T>(
  state: ControlDraft<T>,
  value: T,
  result: unknown,
  commit: boolean,
): ControlDraft<T> {
  return {
    ...state,
    value,
    pending: !commit
      ? Infinity
      : result instanceof ActionReceipt
        ? result.revision
        : 0,
  };
}
