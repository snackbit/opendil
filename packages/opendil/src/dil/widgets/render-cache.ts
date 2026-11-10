/**
 * Derived output kept for the next renderer of the same content: a finished
 * answer mounts again whenever a virtualized list scrolls it back into view,
 * and rendering its prose and diagrams again was a large part of that mount.
 * Entries are bounded by count and by the size of their source, least
 * recently used first.
 */
export class RenderCache<Value> {
  private readonly entries = new Map<string, { value: Value; size: number }>();
  private size = 0;
  constructor(
    private readonly limit: number,
    private readonly sizeLimit: number,
  ) {
    caches.add(this);
  }
  get(key: string): Value | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: Value, size: number) {
    if (size > this.sizeLimit) return;
    this.size += size - (this.entries.get(key)?.size ?? 0);
    this.entries.delete(key);
    this.entries.set(key, { value, size });
    for (const [oldest, entry] of this.entries) {
      if (this.entries.size <= this.limit && this.size <= this.sizeLimit) break;
      this.entries.delete(oldest);
      this.size -= entry.size;
    }
  }
  clear() {
    this.entries.clear();
    this.size = 0;
  }
}
const caches = new Set<RenderCache<unknown>>();
/** Drops everything derived from document content, as clearDocumentCache does. */
export function clearRenderCaches() {
  for (const cache of caches) cache.clear();
}
