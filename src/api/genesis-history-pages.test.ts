import { describe, expect, it, vi } from "vitest";
import { readGenesisHistoryPages } from "./genesis-history-pages";
describe("complete Genesis keyset history", () => {
  it("reads beyond one hundred rows without dropping earlier history", async () => {
    const request = vi.fn().mockResolvedValueOnce({ items: Array.from({ length: 100 }, (_, id) => id), nextCursor: "101" })
      .mockResolvedValueOnce({ items: [100, 101], nextCursor: null });
    expect(await readGenesisHistoryPages(request)).toHaveLength(102);
    expect(request).toHaveBeenNthCalledWith(2, "101");
  });
  it("rejects repeated cursors and does not silently return incomplete records", async () => {
    await expect(readGenesisHistoryPages(async () => ({ items: [1], nextCursor: "101" }))).rejects.toThrow();
  });
  it("propagates a later page failure instead of disguising it as complete", async () => {
    const request = vi.fn().mockResolvedValueOnce({ items: [1], nextCursor: "101" }).mockRejectedValueOnce(new Error("offline"));
    await expect(readGenesisHistoryPages(request)).rejects.toThrow("offline");
  });
});
