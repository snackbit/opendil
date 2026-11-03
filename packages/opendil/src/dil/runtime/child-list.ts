// Persistent pages avoid copying an ever-growing sibling array on each append.
const PAGE_SIZE = 128;
export class ChildList {
  readonly length: number;
  private readonly pages: readonly (readonly number[])[];
  constructor(pages: readonly (readonly number[])[] = [], length = 0) {
    this.pages = pages;
    this.length = length;
  }
  get(index: number): number {
    const value =
      this.pages[Math.floor(index / PAGE_SIZE)]?.[index % PAGE_SIZE];
    if (value === undefined)
      throw new Error(`Child index ${index} is out of bounds`);
    return value;
  }
  append(values: readonly number[]): ChildList {
    if (!values.length) return this;
    const pages = [...this.pages];
    let tail = [...(pages.pop() ?? [])];
    for (const value of values) {
      if (tail.length === PAGE_SIZE) {
        pages.push(tail);
        tail = [];
      }
      tail.push(value);
    }
    pages.push(tail);
    return new ChildList(pages, this.length + values.length);
  }
  toArray(): number[] {
    return this.pages.flat();
  }
}
