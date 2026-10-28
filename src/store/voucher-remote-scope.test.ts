import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, disposePinia, setActivePinia } from "pinia";
import { computed } from 'vue';
import ts from 'typescript';
import storePage from '@/pages/store/store.vue?raw';
import { ApiError } from '@/api/errors';
import { voucherSupportsSurface } from '@/lib/voucher-sheet-authority';

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  apiRuntimeConfig: {environment:"dev",baseUrl:"https://test.invalid"},
  voucherApi: {
    state: vi.fn(),
    popupSeen: vi.fn(),
    claim: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useVoucher } = await import("./voucher");
const { advanceRuntimeRevision } = await import("@/api/order-api");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function voucher(account: string, grantStatus: "UNCLAIMED" | "AVAILABLE" | "USED" | "EXPIRED" | "REVOKED" = "AVAILABLE") {
  return {
    id: `${account}-voucher`,
    name: `Voucher ${account}`,
    type: "fixed",
    amountUSD: 10,
    minPurchaseUSD: 0,
    applicableSkus: [],
    audience: "all",
    startAt: 0,
    endAt: 0,
    claimSurfaces: ["home"],
    popupEnabled: false,
    stackWithTrial: false,
    stackWithOthers: false,
    splittable: false,
    status: "active",
    definitionDeleted: false,
    grantId: grantStatus === "UNCLAIMED" ? null : `${account}-grant`,
    grantStatus,
    usedOrderNo: null,
    claimable: grantStatus === "UNCLAIMED",
    audienceEligible: true,
    popupCadence: {
      enabled: false, delayMs: 0, cooldownHours: 0, maxPerSession: 1,
      nextEligibleAt: 0, popupEligible: false, source: "nx_growth_voucher",
      sourceEnvironment: "PRODUCTION", runId: "",
    },
  };
}

function snapshot(account: string, grantStatus: "UNCLAIMED" | "AVAILABLE" | "USED" | "EXPIRED" | "REVOKED" = "AVAILABLE") {
  return { vouchers: [voucher(account, grantStatus)], source: "test" };
}

function claimReceipt(voucherId: string) {
  return {
    voucherId,
    grantId: `${voucherId}-grant`,
    status: "AVAILABLE" as const,
    replay: false,
    serverCanonical: true as const,
    source: "nx_growth_voucher",
    sourceEnvironment: "PRODUCTION" as const,
    runId: "" as const,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function createStore() {
  remote.voucherApi.state.mockResolvedValue({ vouchers: [], source: "test" });
  const store = useVoucher();
  await flush();
  remote.voucherApi.state.mockReset();
  remote.voucherApi.popupSeen.mockReset();
  remote.voucherApi.claim.mockReset();
  return store;
}

let activePinia: ReturnType<typeof createPinia>;
beforeEach(() => {
  activePinia = createPinia();
  setActivePinia(activePinia);
  remote.voucherApi.state.mockReset();
  remote.voucherApi.popupSeen.mockReset();
  remote.voucherApi.claim.mockReset();
});

afterEach(() => {
  disposePinia(activePinia);
  advanceRuntimeRevision(null);
});

describe("voucher remote account scope", () => {
  it.each([0,2_000,undefined])('all voucher reads respect Retry-After %s across ordinary runtime invalidation',async delay=>{
    const store=await createStore(),now=vi.spyOn(Date,'now').mockReturnValue(100_000);remote.voucherApi.state.mockResolvedValueOnce(snapshot('A'));store.bindAccount('A');await flush();
    remote.voucherApi.state.mockRejectedValueOnce(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:delay}));expect(await store.refreshRemote()).toBe(false);
    const calls=remote.voucherApi.state.mock.calls.length,wait=delay??30_000;
    if(wait>0){
      advanceRuntimeRevision();await flush();expect(store.remoteStatus).toBe('error');expect(store.remoteError).toBe('limited');expect(store.claimedUnused).toEqual([]);expect(store.presentationOffers).toHaveLength(1);
      expect(await Promise.all([store.refreshRemote(),store.revalidateRemote(),store.refreshRemote(),store.claimRemote('A-voucher','store')])).toEqual([false,false,false,false]);
      expect(remote.voucherApi.state).toHaveBeenCalledTimes(calls);expect(remote.voucherApi.claim).not.toHaveBeenCalled();now.mockReturnValue(100_000+wait-1);expect(await store.refreshRemote()).toBe(false);
    }
    now.mockReturnValue(100_000+wait);remote.voucherApi.state.mockResolvedValueOnce(snapshot('new'));expect(await store.refreshRemote()).toBe(true);expect(remote.voucherApi.state).toHaveBeenCalledTimes(calls+1);now.mockRestore();
  });
  it('a successful popup POST updates its canonical snapshot without clearing an active GET cooldown',async()=>{
    const store=await createStore(),now=vi.spyOn(Date,'now').mockReturnValue(100_000);remote.voucherApi.state.mockRejectedValueOnce(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:60_000}));await store.refreshRemote();
    remote.voucherApi.popupSeen.mockResolvedValueOnce(snapshot('confirmed'));expect(await store.markPopupSeen('confirmed-voucher')).toBe(true);expect(store.presentationOffers.map(v=>v.id)).toEqual(['confirmed-voucher']);
    expect(await store.refreshRemote()).toBe(false);expect(await store.revalidateRemote()).toBe(false);expect(await store.claimRemote('confirmed-voucher','store')).toBe(false);expect(remote.voucherApi.state).toHaveBeenCalledTimes(1);expect(remote.voucherApi.claim).not.toHaveBeenCalled();now.mockRestore();
  });
  it('binding a new voucher scope clears an active HTTP cooldown',async()=>{
    const store=await createStore();remote.voucherApi.state.mockRejectedValueOnce(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:60_000}));await store.refreshRemote();remote.voucherApi.state.mockResolvedValueOnce(snapshot('new'));store.bindAccount('new');await flush();expect(store.remoteStatus).toBe('ready');expect(store.presentationOffers.map(v=>v.id)).toEqual(['new-voucher']);
  });
  it('preserves the actual Store ticket through runtime invalidation without permitting a cached claim',async()=>{
    const store=await createStore();remote.voucherApi.state.mockResolvedValueOnce({vouchers:[{...voucher('A','UNCLAIMED'),claimSurfaces:['store']},voucher('B')],source:'test'});store.bindAccount('A');await flush();
    const script=storePage.split('<script setup lang="ts">')[1].split('</script>')[0],source=ts.createSourceFile('store.ts',script,ts.ScriptTarget.Latest,true);
    const names=['voucherClaimable','voucherOffers','openStoreVouchers'];const declarations=source.statements.filter(s=>ts.isVariableStatement(s)?s.declarationList.declarations.some(d=>names.includes(d.name.getText(source))):ts.isFunctionDeclaration(s)&&names.includes(s.name?.text??''));
    const js=ts.transpileModule(declarations.map(s=>s.getText(source)).join('\n')+'\nreturn {voucherClaimable,voucherOffers,openStoreVouchers};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const show=vi.fn(),navTo=vi.fn();const view=new Function('computed','remoteApiEnabled','voucher','voucherSupportsSurface','voucherClaimSheet','navTo',js)(computed,true,store,voucherSupportsSurface,{show},navTo);
    expect(view.voucherOffers.value).toHaveLength(2);view.openStoreVouchers();expect(show).toHaveBeenCalledOnce();show.mockClear();
    const next=deferred<any>();remote.voucherApi.state.mockReturnValueOnce(next.promise);advanceRuntimeRevision();
    expect(store.catalog).toEqual([]);expect(store.bestVoucherFor('sku',100)).toBeNull();expect(view.voucherOffers.value).toHaveLength(2);
    view.openStoreVouchers();expect(show).not.toHaveBeenCalled();expect(navTo).toHaveBeenCalledWith('/pages/me/rewards-list?cat=voucher');
    next.resolve({vouchers:[],source:'test'});await flush();expect(view.voucherOffers.value).toEqual([]);
  });
  it.each([401,403])('clears ticket presentation on exact HTTP %s and binding changes',async status=>{
    const store=await createStore();remote.voucherApi.state.mockResolvedValueOnce(snapshot('A'));await store.refreshRemote();expect(store.presentationOffers).toHaveLength(1);
    remote.voucherApi.state.mockRejectedValueOnce(new ApiError({kind:'http',status,message:'denied'}));await store.refreshRemote();expect(store.presentationOffers).toEqual([]);
    remote.voucherApi.state.mockResolvedValueOnce(snapshot('new'));store.bindAccount('B');expect(store.presentationOffers).toEqual([]);await flush();expect(store.presentationOffers.map(v=>v.id)).toEqual(['new-voucher']);
  });
  it('joins passive voucher reads, shares one activation and reads normal reentry fresh, and retains presentation through 429 cooldown',async()=>{
    const store=await createStore();const now=vi.spyOn(Date,'now').mockReturnValue(100_000);
    remote.voucherApi.state.mockResolvedValueOnce(snapshot('A'));await store.refreshRemote();await store.revalidateRemote();expect(remote.voucherApi.state).toHaveBeenCalledTimes(1);
    const {notifyPageActivation}=await import('@/lib/passive-tab-read');notifyPageActivation('voucher-reentry');now.mockReturnValue(101_000);const pending=deferred<any>();remote.voucherApi.state.mockReturnValueOnce(pending.promise);const first=store.revalidateRemote(),second=store.revalidateRemote();expect(remote.voucherApi.state).toHaveBeenCalledTimes(2);
    pending.reject(new ApiError({kind:'http',status:429,message:'limited',retryAfterMs:2_000}));expect(await Promise.all([first,second])).toEqual([false,false]);expect(store.presentationOffers).toHaveLength(1);
    now.mockReturnValue(102_999);notifyPageActivation('voucher-during-cooldown');await store.revalidateRemote();expect(remote.voucherApi.state).toHaveBeenCalledTimes(2);
    now.mockReturnValue(103_000);notifyPageActivation('voucher-after-cooldown');remote.voucherApi.state.mockResolvedValueOnce(snapshot('new'));await store.revalidateRemote();expect(remote.voucherApi.state).toHaveBeenCalledTimes(3);now.mockRestore();
  });
  it("advertises unrestricted offers across all valid entry surfaces using current server eligibility", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValueOnce({ vouchers: [{ ...voucher("any", "UNCLAIMED"), claimSurfaces: [] }], source: "test" });
    await store.refreshRemote();
    for (const surface of ["home", "store", "me", "earn"] as const) expect(store.hasClaimableForSurface(surface)).toBe(true);
    remote.voucherApi.state.mockResolvedValueOnce({ vouchers: [{ ...voucher("any", "UNCLAIMED"), claimSurfaces: [], claimable: false }], source: "test" });
    await store.refreshRemote();
    for (const surface of ["home", "store", "me", "earn"] as const) expect(store.hasClaimableForSurface(surface)).toBe(false);
  });
  it("removes the previous runtime's selectable vouchers before the replacement catalog arrives", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValueOnce({
      vouchers: [voucher("old-owned"), voucher("old-claimable", "UNCLAIMED")], source: "test",
    });
    store.bindAccount("A");
    await flush();
    expect(store.claimedUnused).toHaveLength(1);
    expect(store.claimableVouchers).toHaveLength(1);
    expect(store.bestVoucherFor("sku", 100)).not.toBeNull();
    const replacement = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state.mockReturnValueOnce(replacement.promise);
    advanceRuntimeRevision("replacement-voucher-run");
    expect(store.remoteStatus).toBe("loading");
    expect(store.catalog).toEqual([]);
    expect(store.claimed).toEqual([]);
    expect(store.claimedUnused).toEqual([]);
    expect(store.claimableVouchers).toEqual([]);
    expect(store.bestVoucherFor("sku", 100)).toBeNull();
    replacement.resolve(snapshot("new-runtime"));
    await flush();
    expect(store.remoteStatus).toBe("ready");
    expect(store.claimedUnused.map((item) => item.id)).toEqual(["new-runtime-voucher"]);
  });

  it("stops runtime-triggered reads when the voucher store is disposed", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValue(snapshot("A"));
    store.bindAccount("A");
    await flush();
    store.$dispose();
    const calls = remote.voucherApi.state.mock.calls.length;
    advanceRuntimeRevision("disposed-voucher-run");
    await flush();
    expect(remote.voucherApi.state).toHaveBeenCalledTimes(calls);
  });

  it("keeps an initial remote read unknown and records a recoverable failure without promoting it to a reward empty state", async () => {
    const store = await createStore();
    const pending = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state.mockReturnValueOnce(pending.promise);

    const read = store.refreshRemote();
    expect(store.remoteStatus).toBe("loading");
    // Existing popup arbitration may already have a settled catalog; Rewards
    // uses remoteStatus rather than reinterpreting that signal as fresh data.
    expect(store.catalogReady).toBe(true);

    pending.reject(new Error("voucher unavailable"));
    await expect(read).resolves.toBe(false);
    expect(store.remoteStatus).toBe("error");
    // Popup arbitration still receives the historical "read settled" signal;
    // reward pages use remoteStatus, not this signal, for their empty state.
    expect(store.catalogReady).toBe(true);
  });

  it("keeps an old voucher snapshot visible as stale when the newest read fails", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValueOnce(snapshot("known"));
    await expect(store.refreshRemote()).resolves.toBe(true);
    remote.voucherApi.state.mockRejectedValueOnce(new Error("read unavailable"));

    await expect(store.refreshRemote()).resolves.toBe(false);
    expect(store.remoteStatus).toBe("error");
    expect(store.catalog.map((item) => item.id)).toEqual(["known-voucher"]);
  });

  it("recovers a current voucher read when a popup acknowledgement supersedes it then fails", async () => {
    const store = await createStore();
    const staleRead = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state.mockReturnValueOnce(staleRead.promise).mockResolvedValueOnce(snapshot("recovered"));
    remote.voucherApi.popupSeen.mockRejectedValueOnce(new Error("popup unavailable"));

    const reading = store.refreshRemote();
    await expect(store.markPopupSeen("voucher-1")).resolves.toBe(false);
    await vi.waitFor(() => expect(store.remoteStatus).toBe("ready"));

    expect(remote.voucherApi.state).toHaveBeenCalledTimes(2);
    expect(store.catalog.map((item) => item.id)).toEqual(["recovered-voucher"]);
    staleRead.resolve(snapshot("stale"));
    await expect(reading).resolves.toBe(false);
    expect(store.catalog.map((item) => item.id)).toEqual(["recovered-voucher"]);
  });

  it("recovers a current voucher read when a claim command fails after superseding it", async () => {
    const store = await createStore();
    const staleRead = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state.mockReturnValueOnce(staleRead.promise).mockResolvedValueOnce(snapshot("recovered"));
    remote.voucherApi.claim.mockRejectedValueOnce(new Error("claim unavailable"));

    const reading = store.refreshRemote();
    await expect(store.claimRemote("voucher-1", "home")).resolves.toBe(false);
    await vi.waitFor(() => expect(store.remoteStatus).toBe("ready"));

    expect(remote.voucherApi.state).toHaveBeenCalledTimes(2);
    expect(store.catalog.map((item) => item.id)).toEqual(["recovered-voucher"]);
    staleRead.resolve(snapshot("stale"));
    await expect(reading).resolves.toBe(false);
    expect(store.catalog.map((item) => item.id)).toEqual(["recovered-voucher"]);
  });

  it("drops a late state success after switching accounts", async () => {
    const store = await createStore();
    const stale = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue(snapshot("B"));

    store.bindAccount("A");
    store.bindAccount("B");
    await flush();
    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher B"]);

    stale.resolve(snapshot("A"));
    await flush();

    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher B"]);
  });

  it("drops a late state failure without clearing the next account", async () => {
    const store = await createStore();
    const stale = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue(snapshot("B"));

    store.bindAccount("A");
    store.bindAccount("B");
    await flush();
    stale.reject(new Error("account A failed"));
    await flush();

    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher B"]);
  });

  it("does not let a stale popup failure restart a read for the next account", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValue(snapshot("A"));
    store.bindAccount("A");
    await flush();

    const popup = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.popupSeen.mockReturnValueOnce(popup.promise);
    const pending = store.markPopupSeen("A-voucher");
    remote.voucherApi.state.mockResolvedValue(snapshot("B"));
    store.bindAccount("B");
    await flush();
    const stateCallsAfterRebind = remote.voucherApi.state.mock.calls.length;

    popup.reject(new Error("account A popup failed"));
    await expect(pending).resolves.toBe(false);
    await flush();
    expect(remote.voucherApi.state).toHaveBeenCalledTimes(stateCallsAfterRebind);
    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher B"]);
  });

  it("does not read back a stale claim after switching accounts", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValue(snapshot("A"));
    store.bindAccount("A");
    await flush();

    const claim = deferred<ReturnType<typeof claimReceipt>>();
    remote.voucherApi.claim.mockReturnValue(claim.promise);
    remote.voucherApi.state.mockResolvedValue(snapshot("B"));
    const pending = store.claimRemote("A-voucher", "home");

    store.bindAccount("B");
    await flush();
    const stateCallsAfterRebind = remote.voucherApi.state.mock.calls.length;
    claim.resolve(claimReceipt("A-voucher"));

    await expect(pending).resolves.toBe(false);
    await flush();
    expect(remote.voucherApi.state).toHaveBeenCalledTimes(stateCallsAfterRebind);
    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher B"]);
  });

  it("drops a stale claim failure without clearing the next account", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValue(snapshot("A"));
    store.bindAccount("A");
    await flush();

    const claim = deferred<ReturnType<typeof claimReceipt>>();
    remote.voucherApi.claim.mockReturnValue(claim.promise);
    remote.voucherApi.state.mockResolvedValue(snapshot("B"));
    const pending = store.claimRemote("A-voucher", "home");

    store.bindAccount("B");
    await flush();
    const stateCallsAfterRebind = remote.voucherApi.state.mock.calls.length;
    claim.reject(new Error("account A failed"));

    await expect(pending).resolves.toBe(false);
    await flush();
    expect(remote.voucherApi.state).toHaveBeenCalledTimes(stateCallsAfterRebind);
    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher B"]);
  });

  it("keeps the newest refresh for the same account", async () => {
    const store = await createStore();
    const older = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state.mockReturnValueOnce(older.promise).mockResolvedValue(snapshot("new"));
    const first = store.refreshRemote();
    const second = store.refreshRemote();
    await second;
    older.resolve(snapshot("old"));
    await first;
    expect(store.catalog.map((item) => item.name)).toEqual(["Voucher new"]);
  });

  it("drops a catalog when the sandbox RunID changes", async () => {
    advanceRuntimeRevision("voucher-run-a");
    const store = await createStore();
    const stale = deferred<ReturnType<typeof snapshot>>();
    remote.voucherApi.state.mockReturnValueOnce(stale.promise);
    store.bindAccount("A");

    remote.voucherApi.state.mockReset();
    remote.voucherApi.state.mockResolvedValue({ vouchers: [], source: "test" });
    advanceRuntimeRevision("voucher-run-b");
    await vi.waitFor(() => expect(store.remoteStatus).toBe("ready"));
    expect(store.catalog).toEqual([]);

    stale.resolve(snapshot("run-a"));
    await flush();
    expect(store.catalog).toEqual([]);
  });

  it("never exposes expired or revoked grants as redeemable checkout vouchers", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValue({
      vouchers: [voucher("expired", "EXPIRED"), voucher("revoked", "REVOKED")],
      source: "test",
    });
    await store.refreshRemote();

    expect(store.claimedUnused).toEqual([]);
    expect(store.bestVoucherFor("any-sku", 100)).toBeNull();
  });

  it.each([false, true])("keeps a paused definition's AVAILABLE grant usable, including deleted=%s, without reopening claims", async definitionDeleted => {
    const store = await createStore();
    const owned = { ...voucher("paused"), status: "paused", definitionDeleted, startAt: Date.now() - 60_000, endAt: Date.now() + 60_000 };
    remote.voucherApi.state.mockResolvedValue({ vouchers: [owned], source: "test" });
    await store.refreshRemote();
    expect(store.claimedUnused.map(item => item.id)).toEqual([owned.id]);
    expect(store.expiredVouchers).toEqual([]);
    expect(store.bestVoucherFor("any-sku", 100)?.def.id).toBe(owned.id);
    expect(store.claimableVouchers).toEqual([]);
    expect(store.autoPopupCadence).toBeNull();
  });

  it.each(["EXPIRED", "REVOKED", "USED", "UNCLAIMED"] as const)("never restores a paused %s grant as usable", async grantStatus => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValue({ vouchers: [{ ...voucher("paused", grantStatus), status: "paused", claimable: false }], source: "test" });
    await store.refreshRemote();
    expect(store.claimedUnused).toEqual([]);
    expect(store.bestVoucherFor("any-sku", 100)).toBeNull();
    expect(store.expiredVouchers).toHaveLength(grantStatus === "EXPIRED" ? 1 : 0);
    expect(store.claimableVouchers).toEqual([]);
  });

  it("retains time-window checks without classifying a future-start grant as expired", async () => {
    const store = await createStore(), now = Date.now();
    remote.voucherApi.state.mockResolvedValue({ vouchers: [
      { ...voucher("past"), status: "paused", endAt: now - 60_000 },
      { ...voucher("future"), status: "paused", startAt: now + 60_000, endAt: now + 120_000 },
    ], source: "test" });
    await store.refreshRemote();
    expect(store.claimedUnused).toEqual([]);
    expect(store.bestVoucherFor("any-sku", 100)).toBeNull();
    expect(store.expiredVouchers.map(item => item.id)).toEqual(["past-voucher"]);
  });

  it("reads paused grant reservation and cancellation state without changing its identity", async () => {
    const store = await createStore();
    for (const grantStatus of ["AVAILABLE", "USED", "AVAILABLE"] as const) {
      remote.voucherApi.state.mockResolvedValue({ vouchers: [{ ...voucher("paused", grantStatus), status: "paused" }], source: "test" });
      await store.refreshRemote();
      expect(store.claimedUnused.map(item => item.id)).toEqual(grantStatus === "AVAILABLE" ? ["paused-voucher"] : []);
      expect(store.expiredVouchers).toEqual([]);
      expect(store.catalog).toMatchObject([{ id: "paused-voucher", grantId: "paused-grant", grantStatus }]);
    }
  });

  it("passes the visible entry surface to the canonical claim command", async () => {
    const store = await createStore();
    remote.voucherApi.claim.mockResolvedValue(claimReceipt("store-voucher"));
    remote.voucherApi.state.mockResolvedValue({ vouchers: [], source: "test" });

    await store.claimRemote("store-voucher", "store");

    expect(remote.voucherApi.claim).toHaveBeenCalledWith(
      "store-voucher",
      "store",
      "h7-voucher-claim:store-voucher",
    );
  });

  it.each(["AVAILABLE", "USED", "REVOKED", "EXPIRED"] as const)("uses fresh %s state after an old AVAILABLE claim receipt", async status => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValue(snapshot("receipt",status));
    await store.refreshRemote();
    remote.voucherApi.claim.mockResolvedValue({...claimReceipt("receipt-voucher"),replay:true});
    await expect(store.claimRemote("receipt-voucher","store")).resolves.toBe(status === "AVAILABLE");
    expect(store.catalog).toMatchObject([{id:"receipt-voucher",grantStatus:status}]);
    expect(store.claimedUnused.map(item=>item.id)).toEqual(status === "AVAILABLE" ? ["receipt-voucher"] : []);
    if(status === "USED")expect(store.claimed).toMatchObject([{id:"receipt-voucher",usedAt:0}]);
  });

  it("does not promote an old AVAILABLE receipt when its follow-up GET fails", async () => {
    const store = await createStore();
    remote.voucherApi.state.mockResolvedValueOnce(snapshot("receipt", "UNCLAIMED"));
    await expect(store.refreshRemote()).resolves.toBe(true);
    remote.voucherApi.claim.mockResolvedValue(claimReceipt("receipt-voucher"));
    remote.voucherApi.state.mockRejectedValueOnce(new Error("readback unavailable"));

    await expect(store.claimRemote("receipt-voucher", "me")).resolves.toBe(false);

    expect(store.claimed).toEqual([]);
    expect(store.catalog).toMatchObject([{ id: "receipt-voucher", grantStatus: "UNCLAIMED" }]);
    expect(store.claimedUnused).toEqual([]);
    expect(store.remoteStatus).toBe("error");
  });
});
