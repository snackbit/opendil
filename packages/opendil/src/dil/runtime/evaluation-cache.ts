export type Scope = Readonly<Record<string, unknown>>;
export interface EvaluationEntry {
  source: string;
  scope: Scope;
  owners: number;
  oneShot: boolean;
  ready: boolean;
  dirty: boolean;
  /** A view withheld rendering until this entry became fresh again. */
  awaitingFreshness: boolean;
  value: unknown;
  /** The result as the worker encoded it, to recognize an unchanged value. */
  raw?: string;
  /** Shown from a snapshot until the worker evaluates it once. */
  provisional?: boolean;
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
  /** The source and scope a key names, or undefined for a malformed key. */
  parseKey(key: string): [string, Scope] | undefined {
    const parsed = parseJson(key);
    return Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      parsed[1] &&
      typeof parsed[1] === "object" &&
      !Array.isArray(parsed[1])
      ? [parsed[0], parsed[1] as Scope]
      : undefined;
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
        awaitingFreshness: false,
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

/** JSON literals read without QuickJS; see ExpressionEngine.literal(). */
export const NOT_JSON = Symbol("not JSON");
// What a JSON text can start with. Most expressions are names and calls;
// refusing them here costs less than the exception JSON.parse would throw.
const JSON_START = /^[\s[{"\-\dtfn]/;
export function parseJson(source: string): unknown {
  if (!JSON_START.test(source)) return NOT_JSON;
  try {
    return JSON.parse(source);
  } catch {
    return NOT_JSON;
  }
}
const RESERVED_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "$dilHandler",
]);
/** Past revive's nesting limit the value is refused anyway, so the walk stops there. */
export function hasReservedKey(value: unknown, depth: number): boolean {
  if (!value || typeof value !== "object" || depth > 65) return false;
  if (Array.isArray(value))
    return value.some((entry) => hasReservedKey(entry, depth + 1));
  return Object.entries(value).some(
    ([key, entry]) =>
      RESERVED_KEYS.has(key) || hasReservedKey(entry, depth + 1),
  );
}
