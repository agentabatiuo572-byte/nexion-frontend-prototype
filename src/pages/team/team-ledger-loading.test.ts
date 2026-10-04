import { computed, reactive } from "vue";
import { describe, expect, it } from "vitest";
import source from "./team.vue?raw";

function page() {
  const network = reactive({ remoteStatus: "idle", hasRemoteSnapshot: false });
  const commission = reactive({ eventsStatus: "idle", eventsEvidence: null as object | null });
  const start = source.indexOf("const ledgerFailed = computed(");
  const end = source.indexOf("const pool =", start);
  if (start < 0 || end < start) throw new Error("Missing actual team ledger presentation");
  const state = new Function("computed", "network", "commission", "remoteApiEnabled",
    source.slice(start, end) + ";return { ledgerFailed, ledgerLoading, ledgerVisible };")(
    computed, network, commission, true);
  return { network, commission, state };
}

describe("team ledger loading presentation", () => {
  it("shows initial loading without asserting failure or zero confirmed balances", () => {
    const h = page();
    expect(h.state.ledgerLoading.value).toBe(true);
    expect(h.state.ledgerFailed.value).toBe(false);
    expect(h.state.ledgerVisible.value).toBe(false);
  });
  it("keeps a confirmed zero snapshot visible while either same-account projection refreshes", () => {
    const h = page(); h.network.hasRemoteSnapshot = true; h.commission.eventsEvidence = { totalUSDT: 0 };
    h.network.remoteStatus = "loading"; h.commission.eventsStatus = "ready";
    expect(h.state.ledgerVisible.value).toBe(true); expect(h.state.ledgerLoading.value).toBe(true);
    h.network.remoteStatus = "ready"; h.commission.eventsStatus = "loading";
    expect(h.state.ledgerVisible.value).toBe(true); expect(h.state.ledgerFailed.value).toBe(false);
  });
  it.each(["network", "commission"])("shows retry only on a real %s error, without retaining an authoritative card", (side) => {
    const h = page(); h.network.hasRemoteSnapshot = true; h.commission.eventsEvidence = {};
    h.network.remoteStatus = side === "network" ? "error" : "ready";
    h.commission.eventsStatus = side === "commission" ? "error" : "ready";
    expect(h.state.ledgerFailed.value).toBe(true); expect(h.state.ledgerLoading.value).toBe(false);
    expect(h.state.ledgerVisible.value).toBe(false);
  });
  it("cannot display the old card after either scoped snapshot is cleared", () => {
    const h = page(); h.network.hasRemoteSnapshot = true; h.commission.eventsEvidence = {};
    h.network.remoteStatus = h.commission.eventsStatus = "ready";
    expect(h.state.ledgerVisible.value).toBe(true);
    h.network.hasRemoteSnapshot = false; expect(h.state.ledgerVisible.value).toBe(false);
    h.network.hasRemoteSnapshot = true; h.commission.eventsEvidence = null;
    expect(h.state.ledgerVisible.value).toBe(false);
  });
});
