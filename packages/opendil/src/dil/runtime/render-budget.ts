/** Bounds mounted presentation work, including multiplicative repeated templates. */
export class RenderBudget {
  private leases = new Map<string, number>();
  private total = 0;
  constructor(readonly limit = 2000) {}
  get used() {
    return this.total;
  }
  reserve(id: string, cost: number): boolean {
    if (!Number.isFinite(cost) || cost < 0) return false;
    const next = this.total - (this.leases.get(id) ?? 0) + cost;
    if (next > this.limit) return false;
    this.total = next;
    this.leases.set(id, cost);
    return true;
  }
  release(id: string) {
    this.total -= this.leases.get(id) ?? 0;
    this.leases.delete(id);
  }
}
