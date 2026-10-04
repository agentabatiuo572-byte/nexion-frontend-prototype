import ts from "typescript";
import nativeRuntime from "@dcloudio/uni-app-plus/dist/uni.runtime.esm.js?raw";
import * as vue from "vue";
import { initPreContext, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import source from "./profile.vue?raw";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import * as runtimeRevision from "@/api/order-api";
import { profileVRankProjection } from "@/lib/profile-vrank-display";
import { rankName } from "@/lib/v-rank-copy";
import { createP318AccountPageFence } from "./p3-18-account-page-fence";
import { reconcileProfileEdit } from "@/lib/profile-save-flow";
import { nexGridBrandText } from "@/lib/brand-copy";
import { ApiError } from "@/api/errors";

const remote = vi.hoisted(() => ({ remoteApiEnabled: true, vRankApi: { ladder: vi.fn(), current: vi.fn() } }));
vi.mock("@/api/runtime", () => remote);
const { useVRank } = await import("@/store/v-rank");
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); });
const flush = async () => { await vue.nextTick(); for (let n = 0; n < 8; n++) await Promise.resolve(); };

// Runs the actual page worker and Pinia V-rank store. All network edges are synthetic.
function mount(localeCode: "zh" | "en" | "vi" = "zh", platform: "app" | "h5" = "app") {
  setActivePinia(createPinia()); runtimeRevision.advanceRuntimeRevision(null);
  const reads: Array<{ ladder: ReturnType<typeof deferred>; current: ReturnType<typeof deferred> }> = [];
  remote.vRankApi.ladder.mockReset().mockImplementation(() => {
    const row = { ladder: deferred(), current: deferred() }; reads.push(row); return row.ladder.promise;
  });
  remote.vRankApi.current.mockReset().mockImplementation(() => reads[reads.length - 1].current.promise);
  const rank = useVRank();
  const app = vue.reactive({ accountKey: "A", accountBindingEpoch: 1, user: { tier: "L5", joinedAt: 1 } });
  const auth = vue.reactive({ accountId: "A", email: "" });
  const profile = vue.reactive({ displayName: "Confirmed", phoneE164: "", nicknameCandidates: [],
    refreshNicknameCandidates: vi.fn(async () => true),
    setDisplayName: vi.fn(async () => true),
    projectServerNickname: vi.fn((nickname: string) => { profile.displayName = nickname; }),
  });
  const payout = vue.reactive({ hasAnyAddress: false, provenance: null as unknown, currentFor: () => undefined,
    refreshRemote: vi.fn(async () => false),
  });
  const profileReads: Array<ReturnType<typeof deferred>> = [];
  const profileRead = vi.fn(() => { const request = deferred(); profileReads.push(request); return request.promise; });
  const hooks: Record<string, Array<() => void>> = { mount: [], show: [], hide: [], unmount: [] };
  const toast = { error: vi.fn(), success: vi.fn(), info: vi.fn() };
  const chooseImage = vi.fn();
  const uploadAvatar = vi.fn();
  const cryptoUuid = vi.fn(() => "avatar-fixture-id");
  const modules: Record<string, unknown> = {
    vue: { ...vue, onMounted: (fn: () => void) => hooks.mount.push(fn), onUnmounted: (fn: () => void) => hooks.unmount.push(fn) },
    "@dcloudio/uni-app": { onShow: (fn: () => void) => hooks.show.push(fn), onHide: (fn: () => void) => hooks.hide.push(fn) },
    "@/api/runtime": { remoteApiEnabled: true, profileApi: { profile: profileRead, uploadAvatar } },
    "@/lib/route": { navTo: vi.fn() }, "@/i18n/use-t": { useT: () => vue.ref({ zh, en, vi: vietnamese }[localeCode]) },
    "@/i18n/format": { dateLocale: () => "zh-CN" }, "@/store/app": { useApp: () => app },
    "@/store/auth": { useAuth: () => auth }, "@/store/profile": { useProfile: () => profile },
    "@/store/payout-address": { usePayoutAddress: () => payout }, "@/store/quest": { useQuest: () => ({}) },
    "@/store/v-rank": { useVRank: () => rank }, "@/store/locale": { useLocaleStore: () => ({ code: localeCode }) },
    "@/store/payout-address-core": { PAYOUT_NETWORKS: ["usdt-trc20"], maskAddressMid: (address: string) => address },
    "@/store/ui": { toast }, "@/lib/account-scope": {
      captureAccountScope: () => ({ account: app.accountKey, epoch: app.accountBindingEpoch }),
      isCurrentAccountScope: (scope: { account: string; epoch: number }) => scope.account === app.accountKey && scope.epoch === app.accountBindingEpoch,
    },
    "@/lib/remote-profile-quest": { claimSetupProfileQuest: () => { throw Error("No reward writes in read fixture"); } },
    "@/lib/profile-save-flow": { reconcileProfileEdit }, "@/lib/secure-command-id": { requireCryptoUuid: cryptoUuid },
    "@/lib/profile-date": { formatJoinedDate: () => "" }, "@/lib/profile-vrank-display": { profileVRankProjection },
    "@/lib/v-rank-copy": { rankName },
    "@/lib/brand-copy": { nexGridBrandText },
    "@/api/order-api": runtimeRevision, "./p3-18-account-page-fence": { createP318AccountPageFence },
  };
  const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
  initPreContext(platform);
  const output = ts.transpileModule(preJs(script, "profile.vue"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const scope = vue.effectScope();
  const page = scope.run(() => new Function("require", "exports", "uni", output + ";return {refreshVRankForCurrentAccount,loadRemoteProfile,handleRegen,tierLabel,tierProgressLine,walletSub,walletAction,name,dirty,displayName,avatarUrl,avatarRevision,avatarUploading};")((id: string) => {
    if (id.endsWith(".vue")) return {};
    if (!(id in modules)) throw Error(`Unexpected dependency ${id}`);
    return modules[id];
  }, {}, { chooseImage }));
  const fire = (event: string) => hooks[event].forEach(fn => fn());
  cleanups.push(() => { fire("unmount"); scope.stop(); });
  const accept = (index: number, value: number, published = false) => {
    reads[index].ladder.resolve({ ranks: Array.from({ length: 13 }, (_, v) => {
      const title = published && v < 2 ? ["注册会员", "活跃新星"][v] : `级别${v}`;
      return { v, title: published ? title : `Rank ${v}`, cnTitle: title, rewards: [] };
    }) });
    reads[index].current.resolve({ rankCode: `V${value}`, progress: { selfBuyUSD: 0, directRefs: 0, teamVolumeUSD: 0, vDownlineCounts: {} } });
  };
  return { page, rank, reads, accept, app, auth, payout, profile, profileReads, toast, fire, chooseImage, uploadAvatar, cryptoUuid };
}

// Execute the installed native chooser's actionSheet cancel and its real failure
// wrapper. Native/UI edges are synthetic; no picker, photo, or HTTP request runs.
function installedNativeCancel(): unknown {
  const runtime = nativeRuntime;
  const wrapper = runtime.match(/function warpPlusErrorCallback\([\s\S]+?\n}/)![0];
  const failure = runtime.match(/function invokeFail\([\s\S]+?\n}/)![0];
  const chooser = runtime.slice(runtime.indexOf("const chooseImage = defineAsyncApi("), runtime.indexOf("const chooseVideo = defineAsyncApi("));
  let result: unknown;
  const native = { nativeUI: { actionSheet: (_options: unknown, callback: (event: { index: number }) => void) => callback({ index: 0 }) } };
  const factory = new Function("plus", "extend", "invokeCallback", `
    const API_CHOOSE_IMAGE = 'chooseImage', ChooseImageProtocol = {}, ChooseImageOptions = {};
    const initI18nChooseImageMsgsOnce = () => {}, useI18n = () => ({t: key => key});
    const defineAsyncApi = (_name, worker) => options => worker(options, {
      resolve: () => { throw Error('Cancel must not select a file'); },
      reject: (message, detail) => invokeFail(0, 'chooseImage', message, detail),
    });
    ${wrapper}\n${failure}\n${chooser}\nreturn chooseImage;
  `);
  const choose = factory(native, Object.assign, (_id: number, value: unknown) => { result = value; });
  choose({ count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"] });
  return result;
}

describe("profile avatar picker cancellation", () => {
  const pickFile = (h: ReturnType<typeof mount>) => h.chooseImage.mockImplementation((options: { success: (result: unknown) => void }) => options.success({ tempFilePaths: ["fixture-only.png"] }));
  const assertSilent = (h: ReturnType<typeof mount>) => {
    expect(h.toast.error).not.toHaveBeenCalled(); expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.uploadAvatar).not.toHaveBeenCalled(); expect(h.cryptoUuid).not.toHaveBeenCalled();
    expect(h.profileReads).toHaveLength(0); expect(h.profile.setDisplayName).not.toHaveBeenCalled();
    expect(h.page.name.value).toBe("Confirmed"); expect(h.page.dirty.value).toBe(false);
    expect(h.page.avatarUrl.value).toBe(""); expect(h.page.avatarUploading.value).toBe(false);
  };
  it("silently cancels the installed native source actionSheet", async () => {
    const cause = installedNativeCancel();
    expect(cause).toEqual({ errMsg: "chooseImage:fail", code: 0 });
    const h = mount(); h.chooseImage.mockImplementation((options: { fail: (cause: unknown) => void }) => options.fail(cause));
    await h.page.handleRegen(); assertSilent(h);
  });
  it.each(["app", "h5"] as const)("silently cancels explicit picker errors on %s", async platform => {
    for (const cause of [new Error("chooseImage:fail cancel"), new Error("cancelled"), { errMsg: "chooseImage:fail cancel" }]) {
      const h = mount("en", platform); h.chooseImage.mockImplementation((options: { fail: (cause: unknown) => void }) => options.fail(cause));
      await h.page.handleRegen(); assertSilent(h);
    }
  });
  it.each([
    { errMsg: "chooseImage:fail permission denied", code: 0 },
    { errMsg: "chooseImage:fail permission denied: cannot cancel operation", code: 0 },
    { errMsg: "chooseImage:fail file read failed", code: 0 },
    { errMsg: "chooseImage:fail", code: 12 },
    { errMsg: "chooseImage:fail", code: "0" },
    { errMsg: "chooseImage:fail", code: 0, detail: "IO_FAILURE" },
    { errMsg: "chooseImage:fail", code: 0, message: "Permission denied" },
    Object.defineProperty({ errMsg: "chooseImage:fail", code: 0 }, "message", { value: "IO_FAILURE", enumerable: false }),
    Object.assign(Error("Permission denied"), { errMsg: "chooseImage:fail", code: 0 }),
    { errMsg: "upload:fail", code: 0 },
    { errMsg: "chooseImage:fail" },
  ])("keeps a genuine picker failure visible: %j", async cause => {
    const h = mount(); h.chooseImage.mockImplementation((options: { fail: (cause: unknown) => void }) => options.fail(cause));
    await h.page.handleRegen(); expect(h.toast.error).toHaveBeenCalledWith(zh.profile.serverMutationFailed);
    expect(h.uploadAvatar).not.toHaveBeenCalled(); expect(h.cryptoUuid).not.toHaveBeenCalled();
  });
  it.each([{ errMsg: "chooseImage:fail", code: 0 }, { errMsg: "chooseImage:fail" }])("does not treat a bare failure as cancellation in H5: %j", async cause => {
    const h = mount("en", "h5"); h.chooseImage.mockImplementation((options: { fail: (cause: unknown) => void }) => options.fail(cause));
    await h.page.handleRegen(); expect(h.toast.error).toHaveBeenCalledWith(en.profile.serverMutationFailed);
  });
  it.each([
    new Error("upload cancelled by transport"), { errMsg: "chooseImage:fail", code: 0 },
    new ApiError({ kind: "auth", message: "AUTH_REQUIRED", status: 401 }),
    new ApiError({ kind: "business", message: "AVATAR_PERMISSION_DENIED", code: 403 }),
  ])("keeps post-selection upload failures visible: %j", async cause => {
    const h = mount(); pickFile(h); h.uploadAvatar.mockRejectedValue(cause);
    const work = h.page.handleRegen(); await flush();
    expect(h.profileReads).toHaveLength(1); h.profileReads[0].resolve({ avatarUrl: "", avatarRevision: "" }); await work;
    expect(h.toast.error).toHaveBeenCalledWith(zh.profile.serverMutationFailed); expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.page.avatarUploading.value).toBe(false); expect(h.page.avatarUrl.value).toBe("");
  });
  it.each([new Error("crypto cancelled"), { errMsg: "chooseImage:fail", code: 0 }])("keeps crypto failures visible without uploading: %j", async cause => {
    const h = mount(); pickFile(h); h.cryptoUuid.mockImplementation(() => { throw cause; });
    await h.page.handleRegen(); expect(h.toast.error).toHaveBeenCalledWith(zh.profile.serverMutationFailed);
    expect(h.uploadAvatar).not.toHaveBeenCalled(); expect(h.page.avatarUploading.value).toBe(false);
  });
  it("keeps failed authoritative recovery visible even when it contains cancel", async () => {
    const h = mount(); pickFile(h); h.uploadAvatar.mockRejectedValue(Error("upload cancelled"));
    const work = h.page.handleRegen(); await flush(); h.profileReads[0].reject(Error("profile request cancelled")); await work;
    expect(h.toast.error).toHaveBeenCalledWith(zh.profile.serverMutationFailed); expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.page.avatarUrl.value).toBe(""); expect(h.page.avatarUploading.value).toBe(false);
  });
  it("returns without mutations for an empty selection and allows a later retry", async () => {
    const h = mount(); h.chooseImage.mockImplementation((options: { success: (result: unknown) => void }) => options.success({ tempFilePaths: [] }));
    await h.page.handleRegen(); assertSilent(h);
    pickFile(h); h.uploadAvatar.mockResolvedValue({ avatarUrl: "retry.png", avatarRevision: "r1" });
    await h.page.handleRegen(); expect(h.page.avatarUrl.value).toBe("retry.png"); expect(h.uploadAvatar).toHaveBeenCalledTimes(1);
  });
  it("allows a real choice after repeated cancellation without a stale busy flag", async () => {
    const h = mount(); h.chooseImage.mockImplementation((options: { fail: (cause: unknown) => void }) => options.fail(installedNativeCancel()));
    await h.page.handleRegen(); await h.page.handleRegen(); assertSilent(h);
    pickFile(h); h.uploadAvatar.mockResolvedValue({ avatarUrl: "after-cancel.png", avatarRevision: "r1" });
    await h.page.handleRegen(); expect(h.page.avatarUrl.value).toBe("after-cancel.png"); expect(h.uploadAvatar).toHaveBeenCalledTimes(1);
    expect(h.page.avatarRevision.value).toBe("r1"); expect(h.page.avatarUploading.value).toBe(false);
  });
  it("preserves successful uploads and authoritative read recovery", async () => {
    const h = mount(); pickFile(h); h.uploadAvatar.mockResolvedValue({ avatarUrl: "saved.png", avatarRevision: "r1" });
    await h.page.handleRegen(); expect(h.page.avatarUrl.value).toBe("saved.png"); expect(h.toast.success).toHaveBeenCalledWith(zh.profile.avatar, zh.profile.avatarHint);
    expect(h.uploadAvatar).toHaveBeenCalledWith("fixture-only.png", "app-profile:avatar:avatar-fixture-id");
    h.uploadAvatar.mockRejectedValue(Error("upload result lost")); const recovery = h.page.handleRegen(); await flush();
    h.profileReads[0].resolve({ avatarUrl: "recovered.png", avatarRevision: "r2" }); await recovery;
    expect(h.page.avatarUrl.value).toBe("recovered.png"); expect(h.toast.error).not.toHaveBeenCalled();
  });
  it.each(["hide", "account", "rebind", "unmount"])("discards a late selected file after %s", async event => {
    const h = mount(); let selected!: (value: unknown) => void;
    h.chooseImage.mockImplementation((options: { success: (value: unknown) => void }) => { selected = options.success; });
    const work = h.page.handleRegen();
    if (event === "hide" || event === "unmount") h.fire(event);
    else { if (event === "account") { h.app.accountKey = "B"; h.auth.accountId = "B"; } h.app.accountBindingEpoch++; }
    await flush(); selected({ tempFilePaths: ["fixture-only.png"] }); await work;
    expect(h.uploadAvatar).not.toHaveBeenCalled(); expect(h.cryptoUuid).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled(); expect(h.toast.success).not.toHaveBeenCalled();
  });
  it.each(["hide", "account", "rebind", "unmount"])("discards late picker errors after %s", async event => {
    const h = mount(); let fail!: (value: unknown) => void;
    h.chooseImage.mockImplementation((options: { fail: (value: unknown) => void }) => { fail = options.fail; });
    const work = h.page.handleRegen();
    if (event === "hide" || event === "unmount") h.fire(event);
    else { if (event === "account") { h.app.accountKey = "B"; h.auth.accountId = "B"; } h.app.accountBindingEpoch++; }
    await flush(); fail({ errMsg: "chooseImage:fail permission denied", code: 0 }); await work;
    expect(h.uploadAvatar).not.toHaveBeenCalled(); expect(h.toast.error).not.toHaveBeenCalled(); expect(h.toast.success).not.toHaveBeenCalled();
  });
  for (const failed of [false, true]) {
    it.each(["hide", "account", "rebind", "unmount"])(`discards late upload ${failed ? "failure" : "success"} after %s`, async event => {
      const h = mount(); pickFile(h); const response = deferred(); h.uploadAvatar.mockReturnValue(response.promise);
      const work = h.page.handleRegen(); await flush(); expect(h.page.avatarUploading.value).toBe(true);
      if (event === "hide" || event === "unmount") h.fire(event);
      else { if (event === "account") { h.app.accountKey = "B"; h.auth.accountId = "B"; } h.app.accountBindingEpoch++; }
      await flush();
      if (failed) {
        response.reject(Error("upload cancelled")); await flush();
        h.profileReads[h.profileReads.length - 1].resolve({ avatarUrl: "old.png", avatarRevision: "old" });
      } else response.resolve({ avatarUrl: "old.png", avatarRevision: "old" });
      await work; expect(h.page.avatarUrl.value).toBe(""); expect(h.page.avatarRevision.value).toBe("");
      expect(h.toast.error).not.toHaveBeenCalled(); expect(h.toast.success).not.toHaveBeenCalled();
    });
  }
  it("does not clear a new account's busy flag when an old failed upload settles", async () => {
    const h = mount(); pickFile(h); const old = deferred(), current = deferred();
    h.uploadAvatar.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const stale = h.page.handleRegen(); await flush(); h.app.accountKey = "B"; h.auth.accountId = "B"; h.app.accountBindingEpoch++; await flush();
    const latest = h.page.handleRegen(); await flush(); expect(h.page.avatarUploading.value).toBe(true);
    await h.page.handleRegen(); expect(h.uploadAvatar).toHaveBeenCalledTimes(2);
    old.reject(Error("upload cancelled")); await flush(); h.profileReads[h.profileReads.length - 1].resolve({ avatarUrl: "old.png", avatarRevision: "old" }); await stale;
    expect(h.page.avatarUploading.value).toBe(true); expect(h.page.avatarUrl.value).toBe(""); expect(h.toast.error).not.toHaveBeenCalled();
    current.resolve({ avatarUrl: "current.png", avatarRevision: "current" }); await latest;
    expect(h.page.avatarUrl.value).toBe("current.png"); expect(h.page.avatarUploading.value).toBe(false); expect(h.toast.success).toHaveBeenCalledTimes(1);
  });
});

describe("profile authoritative read lifecycle", () => {
  it("brands the nickname row for an untouched historical default without saving a renamed value", async () => {
    const h = mount();
    const oldBrand = "Nexi" + "on";
    const read = h.page.loadRemoteProfile();
    h.profileReads[0].resolve({ nickname: `${oldBrand} 3778`, avatarUrl: "", avatarRevision: "" });
    await read;
    expect(h.page.name.value).toBe(`${oldBrand} 3778`);
    expect(h.page.displayName.value).toBe("UVEL 3778");
    expect(h.page.dirty.value).toBe(false);
    expect(source).toContain("{{ nexGridBrandText(name) }}");
    expect(nexGridBrandText(h.page.name.value)).toBe("UVEL 3778");
    expect(h.profile.setDisplayName).not.toHaveBeenCalled();
  });
  it.each([
    ["en", "Registered Member", "Rising Star"],
    ["vi", "Thành viên đã đăng ký", "Ngôi sao mới"],
  ] as const)("renders the published current and next rank in %s", async (localeCode, current, next) => {
    const h = mount(localeCode);
    const read = h.page.refreshVRankForCurrentAccount();
    h.accept(0, 0, true);
    await read;
    expect(h.page.tierLabel.value).toBe(`V0 · ${current}`);
    expect(h.page.tierProgressLine.value).toContain(`V1 · ${next}`);
  });
  it("does not render a locally seeded tier or unset wallet while reads are unconfirmed", () => {
    const h = mount();
    expect(h.page.tierLabel.value).toBe("—"); expect(h.page.tierProgressLine.value).toBe("—");
    expect(h.page.walletSub.value).toBe(zh.profile.walletUnknown);
    expect(h.page.walletAction.value).toBe(zh.profile.walletPaired);
  });
  it("keeps failed rank unknown and recovers to configured current and next names", async () => {
    const h = mount(); const first = h.page.refreshVRankForCurrentAccount();
    h.reads[0].current.reject(Error("offline")); await first;
    expect(h.rank.remoteError).toBeTruthy(); expect(h.page.tierLabel.value).toBe("—");
    const retry = h.page.refreshVRankForCurrentAccount(); h.accept(1, 4); await retry;
    expect(h.rank.remoteError).toBeNull(); expect(h.page.tierLabel.value).toBe("V4 · 级别4");
    expect(h.page.tierProgressLine.value).toContain("V5 · 级别5");
  });
  for (const event of ["runtime", "account", "rebind", "hide-show"]) {
    for (const failed of [false, true]) {
      it(`ignores old rank ${failed ? "error" : "success"} after ${event}`, async () => {
        const h = mount(); const old = h.page.refreshVRankForCurrentAccount();
        if (event === "runtime") runtimeRevision.advanceRuntimeRevision("profile-fixture");
        else if (event === "hide-show") { h.fire("hide"); h.fire("show"); }
        else { if (event === "account") { h.app.accountKey = "B"; h.auth.accountId = "B"; } h.app.accountBindingEpoch++; h.rank.bindAccount(h.app.accountKey); }
        await flush(); const latest = h.reads.length - 1; expect(latest).toBeGreaterThan(0);
        h.accept(latest, 8); await flush();
        if (failed) h.reads[0].current.reject(Error("late")); else h.accept(0, 2);
        await old;
        expect(h.page.tierLabel.value).toBe("V8 · 级别8"); expect(h.rank.remoteError).toBeNull();
      });
    }
  }
  it("does not launch runtime reads while hidden and unsubscribes on unmount", async () => {
    const h = mount(); h.fire("hide"); runtimeRevision.advanceRuntimeRevision("hidden");
    await h.page.refreshVRankForCurrentAccount(); expect(h.reads).toHaveLength(0);
    h.fire("show"); expect(h.reads).toHaveLength(1); h.accept(0, 3); await flush();
    h.fire("unmount"); runtimeRevision.advanceRuntimeRevision("gone");
    await h.page.refreshVRankForCurrentAccount(); expect(h.reads).toHaveLength(1);
  });
  for (const event of ["hide", "account", "rebind"]) {
    it(`discards old profile identity after ${event}`, async () => {
      const h = mount(); const request = h.page.loadRemoteProfile();
      if (event === "hide") h.fire("hide");
      else { if (event === "account") { h.app.accountKey = "B"; h.auth.accountId = "B"; } h.app.accountBindingEpoch++; }
      await flush(); h.page.name.value = "Current edit";
      h.profileReads[0].resolve({ nickname: "Old result", avatarUrl: "old.png", avatarRevision: "old" }); await request;
      expect(h.page.name.value).toBe("Current edit"); expect(h.page.avatarUrl.value).toBe("");
      expect(h.profile.projectServerNickname).not.toHaveBeenCalled(); expect(h.toast.error).not.toHaveBeenCalled();
    });
  }
});
