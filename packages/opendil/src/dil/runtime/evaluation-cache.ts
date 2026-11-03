export type Scope = Readonly<Record<string, unknown>>;
export interface EvaluationEntry {
  source: string;
  scope: Scope;
  owners: number;
  oneShot: boolean;
  ready: boolean;
  dirty: boolean;
  value: unknown;
  dependencies?: readonly string[];
  revision: number;
  invalidated: number;
  handles: readonly number[];
}
export class EvaluationCache {
  readonly entries = new Map<string, EvaluationEntry>();
  key(source: string, scope: Scope) {
    return JSON.stringify([source, scope]);
  }
  ensure(source: string, scope: Scope) {
    const key = this.key(source, scope);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        source,
        scope,
        owners: 0,
        oneShot: false,
        ready: false,
        dirty: true,
        value: undefined,
        revision: 0,
        invalidated: 0,
        handles: [],
      };
      this.entries.set(key, entry);
    }
    return { key, entry };
  }
  touch(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
  }
  prune(
    busy: (key: string) => boolean,
    evict: (key: string, entry: EvaluationEntry) => void,
  ) {
    let inactive = [...this.entries.values()].filter(
      (entry) => entry.owners === 0,
    ).length;
    for (const [key, entry] of this.entries) {
      if (inactive <= 2048) break;
      if (entry.owners || entry.oneShot || busy(key)) continue;
      this.entries.delete(key);
      evict(key, entry);
      inactive--;
    }
  }
}
