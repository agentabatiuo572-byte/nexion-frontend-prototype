import { describe, expect, it, vi } from "vitest";
import { createGenesisActivityPager } from "./genesis-activity-pager";

describe("Genesis activity paging", () => {
  it("loads exactly one page and deduplicates overlap", async () => {
    const read = vi.fn().mockResolvedValue({ items: [{ orderNo: "a" }, { orderNo: "b" }], nextCursor: "5" });
    const pager = createGenesisActivityPager<{ orderNo: string }>(read);
    pager.reset([{ orderNo: "a" }], "10");
    await pager.more();
    expect(read).toHaveBeenCalledTimes(1);
    expect(pager.state.items.map((x) => x.orderNo)).toEqual(["a", "b"]);
    expect(pager.state.cursor).toBe("5");
  });
  it("discards an old request after refresh and keeps the new request busy", async () => {
    let finish!: (page: {items: {orderNo: string}[]; nextCursor: null}) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValue({ items: [{ orderNo: "new" }], nextCursor: null });
    const pager = createGenesisActivityPager<{orderNo: string}>(read);
    pager.reset([], "10");
    const old = pager.more();
    pager.reset([], "8");
    await pager.more();
    finish({ items: [{ orderNo: "old" }], nextCursor: null });
    await old;
    expect(pager.state.items).toEqual([{ orderNo: "new" }]);
  });
  it("retains the page and cursor on failure or a repeated cursor", async () => {
    const pager = createGenesisActivityPager(vi.fn().mockResolvedValue({ items: [], nextCursor: "10" }));
    pager.reset([{ orderNo: "a" }], "10");
    await pager.more();
    expect(pager.state.error).toBe(true);
    expect(pager.state.items).toEqual([{ orderNo: "a" }]);
    expect(pager.state.cursor).toBe("10");
  });
});
