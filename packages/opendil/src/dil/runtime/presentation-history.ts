export type PresentationPhase = "ready" | "revealing" | "visible";
/** Logical message state survives view replacement and virtualization. */
export class PresentationHistory {
  private phases = new Map<string, PresentationPhase>();
  private attributes = new Map<string, Record<string, unknown>>();
  private virtual = new Set<string>();
  phase(key: string) {
    return this.phases.get(key);
  }
  set(key: string, phase: PresentationPhase) {
    this.phases.set(key, phase);
  }
  last(key: string) {
    return this.attributes.get(key);
  }
  remember(key: string, value: Record<string, unknown>) {
    this.attributes.set(key, value);
  }
  visited(key: string) {
    return this.virtual.has(key);
  }
  visit(key: string) {
    this.virtual.add(key);
  }
  forget(prefix: string) {
    for (const collection of [this.phases, this.attributes, this.virtual])
      for (const key of collection.keys())
        if (key.startsWith(prefix)) collection.delete(key);
  }
}
