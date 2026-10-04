import { shallowReactive } from "vue";
import type { GenesisHistoryPage } from "@/api/genesis-history-pages";

export function createGenesisActivityPager<T>(
  read: (cursor: string) => Promise<GenesisHistoryPage<T>>,
  id: (item: T) => string = (item) => (item as { orderNo: string }).orderNo,
) {
  const state = shallowReactive({ items: [] as T[], cursor: null as string | null, busy: false, error: false });
  let generation = 0;
  const seen = new Set<string>();
  function reset(items: T[], cursor: string | null) {
    generation++;
    seen.clear();
    state.items = [...items];
    state.cursor = cursor;
    state.busy = false;
    state.error = false;
  }
  async function more() {
    if (state.busy || !state.cursor) return;
    const requestGeneration = generation;
    const cursor = state.cursor;
    state.busy = true;
    state.error = false;
    try {
      const page = await read(cursor);
      if (generation !== requestGeneration) return;
      if (page.nextCursor && (page.nextCursor === cursor || seen.has(page.nextCursor))) throw new Error("CURSOR_CYCLE");
      const byId = new Map(state.items.map((item) => [id(item), item]));
      for (const item of page.items) byId.set(id(item), item);
      state.items = [...byId.values()];
      seen.add(cursor);
      state.cursor = page.nextCursor;
    } catch {
      if (generation === requestGeneration) state.error = true;
    } finally {
      if (generation === requestGeneration) state.busy = false;
    }
  }
  return { state, reset, more };
}
