/**
 * Keeps each published-how view scoped to its latest content key and locale.
 * A duplicate retry never starts another request; a superseded request may not
 * mutate the visible document, error state, or loading state when it settles.
 */
export class PublishedContentRequestFence {
  private generation = 0;
  activeKey: string | null = null;

  begin(key: string): number | null {
    if (this.activeKey === key) return null;
    this.activeKey = key;
    this.generation += 1;
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  settle(generation: number): void {
    if (this.isCurrent(generation)) this.activeKey = null;
  }

  invalidate(): void {
    this.generation += 1;
    this.activeKey = null;
  }
}
