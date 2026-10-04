import { describe, expect, it, vi } from "vitest";
import { runRemoteOrdersRefresh, type RemoteOrdersRefreshState } from "./remote-orders-refresh";

describe("remote Me orders refresh", () => {
  it("exposes loading then ready after the server snapshot resolves", async () => {
    const states: RemoteOrdersRefreshState[] = [];
    const refresh = vi.fn().mockResolvedValue(undefined);

    await expect(runRemoteOrdersRefresh(refresh, (state) => states.push(state))).resolves.toBe(true);

    expect(states).toEqual([
      { loading: true, failed: false },
      { loading: false, failed: false },
    ]);
  });

  it("keeps the failure visible and returns false when the server refresh rejects", async () => {
    const states: RemoteOrdersRefreshState[] = [];
    const refresh = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(runRemoteOrdersRefresh(refresh, (state) => states.push(state))).resolves.toBe(false);

    expect(states).toEqual([
      { loading: true, failed: false },
      { loading: false, failed: true },
    ]);
  });
});
