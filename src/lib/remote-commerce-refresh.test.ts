import { describe, expect, it } from "vitest";
import {
  createRemoteOrdersRefresh,
  isInitialOrderReadLoading,
  orderListPanels,
  orderSourceAvailability,
  orderListPresentation,
  refreshWalletAfterCommittedExchange,
  remoteCommerceRequestCurrent,
  shouldRefreshWalletAfterExchange,
} from "./remote-commerce-refresh";

describe("remote commerce refresh presentation", () => {
  it("keeps a successful source visible when the other source is unavailable", () => {
    expect(orderSourceAvailability({ commerce: true, genesis: false })).toBe("partial");
    expect(orderSourceAvailability({ commerce: false, genesis: true })).toBe("partial");
  });

  it("only treats the list as unavailable when neither source returned data", () => {
    expect(orderSourceAvailability({ commerce: true, genesis: true })).toBe("ready");
    expect(orderSourceAvailability({ commerce: false, genesis: false })).toBe("unavailable");
  });

  it("rejects a completed old-account refresh", () => {
    const request = { accountKey: "user:old", epoch: 4 };
    expect(remoteCommerceRequestCurrent(request, { accountKey: "user:old", epoch: 4 })).toBe(true);
    expect(remoteCommerceRequestCurrent(request, { accountKey: "user:new", epoch: 5 })).toBe(false);
  });

  it("refreshes the wallet only after a completed exchange, without recategorising queued work", () => {
    expect(shouldRefreshWalletAfterExchange("COMPLETED")).toBe(true);
    expect(shouldRefreshWalletAfterExchange("SUCCESS")).toBe(true);
    expect(shouldRefreshWalletAfterExchange("QUEUED")).toBe(false);
  });

  it("does not render a global empty state while the first remote read is loading or partial", () => {
    expect(orderListPresentation({ loading: true, availability: "ready", orderCount: 0 })).toBe("loading");
    expect(orderListPresentation({ loading: false, availability: "partial", orderCount: 0 })).toBe("partial");
    expect(orderListPresentation({ loading: false, availability: "ready", orderCount: 0 })).toBe("empty");
    expect(orderListPresentation({
      loading: isInitialOrderReadLoading({ loading: true, hasResolved: true }),
      availability: "partial",
      orderCount: 0,
    })).toBe("partial");
  });

  it("renders successful rows beside a partial-source outage", () => {
    const panels = orderListPanels({ loading: false, availability: "partial", orderCount: 1 });

    expect(panels.mainPresentation).toBe("list");
    expect(panels.showSourceOutage).toBe(true);
  });

  it("keeps the source-outage panel and order rows independently wired in the page", async () => {
    const ordersPage = await import("../pages/store/orders.vue?raw");

    expect(ordersPage.default).toContain('v-if="orderPanels.showSourceOutage"');
    expect(ordersPage.default).toContain("v-if=\"orderPanels.mainPresentation === 'list'\"");
  });

  it("returns per-source partial data and never applies it after the page scope expires", async () => {
    const refresh = createRemoteOrdersRefresh({
      commerce: async () => { throw new Error("commerce unavailable"); },
      genesis: async () => true,
      genesisAccountUnavailable: () => false,
      isCurrent: () => true,
    });
    await expect(refresh()).resolves.toMatchObject({ availability: "partial", commerceUnavailable: true, genesisUnavailable: false });

    const stale = createRemoteOrdersRefresh({
      commerce: async () => undefined,
      genesis: async () => true,
      genesisAccountUnavailable: () => false,
      isCurrent: () => false,
    });
    await expect(stale()).resolves.toMatchObject({ availability: "stale" });
  });

  it("keeps a committed exchange successful when the optional wallet read-back fails", async () => {
    const refreshWallet = async () => { throw new Error("temporary read failure"); };
    await expect(refreshWalletAfterCommittedExchange({
      status: "COMPLETED",
      isCurrent: () => true,
      refreshWallet,
    })).resolves.toBe("unavailable");
    await expect(refreshWalletAfterCommittedExchange({
      status: "COMPLETED",
      isCurrent: () => false,
      refreshWallet,
    })).resolves.toBe("stale");

    await expect(refreshWalletAfterCommittedExchange({
      status: "COMPLETED",
      isCurrent: () => true,
      // refreshRemoteFleet intentionally resolves false for failed reads.
      refreshWallet: async () => false,
    })).resolves.toBe("unavailable");

    let current = true;
    await expect(refreshWalletAfterCommittedExchange({
      status: "COMPLETED",
      isCurrent: () => current,
      refreshWallet: async () => {
        current = false;
        return false;
      },
    })).resolves.toBe("stale");
  });

  it("invokes the wallet projection after a committed exchange", async () => {
    let refreshCalls = 0;
    await expect(refreshWalletAfterCommittedExchange({
      status: "SUCCESS",
      isCurrent: () => true,
      refreshWallet: async () => { refreshCalls += 1; },
    })).resolves.toBe("refreshed");
    expect(refreshCalls).toBe(1);
  });
});
