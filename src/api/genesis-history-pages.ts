import { ApiError } from "./errors";
export interface GenesisHistoryPage<T> { items: T[]; nextCursor: string | null }
/** Existing screens need complete arrays (including release totals), never a truncated first page. */
export async function readGenesisHistoryPages<T>(request: (cursor?: string) => Promise<GenesisHistoryPage<T>>): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await request(cursor);
    items.push(...page.items);
    if (page.nextCursor === null) return items;
    if (seen.has(page.nextCursor) || seen.size >= 1000)
      throw new ApiError({ kind: "protocol", message: "GENESIS_HISTORY_PAGINATION_INVALID" });
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}
