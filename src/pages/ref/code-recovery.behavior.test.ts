import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { entryRecoveryCopy } from "@/i18n/entry-recovery";
import { fmt } from "@/i18n/format";
import { formatAmount } from "@/lib/amount-display";
import { displayNickname } from "@/lib/brand-copy";
import { privacyPolicyHref } from "@/lib/privacy-return";
import { normalizeRegistrationSponsorCode } from "@/auth/registration-sponsor";
import { createPublicSponsorPreviewApi } from "@/api/public-sponsor-preview-api";
import { ApiError } from "@/api/errors";
import * as previewState from "@/lib/referral-preview-state";
import { all, flush, mountEntry, slot, text } from "@/lib/entry-review.test-support";
import source from "./code.vue?raw";

const unmounts: Array<() => void> = [];
afterEach(() => unmounts.splice(0).forEach(fn => fn()));
const preview = (code = "AUDIT2026") => ({ code, sourceEnvironment: "PRODUCTION", sponsor: { displayName: "Test sponsor", vRank: "V2" },
  gift: { status: "DISABLED", usdtAmount: 0, nexAmount: 0 } });
function mount(locale: "en" | "zh" | "vi" = "en") {
  const messages = { en, zh, vi: vietnamese }[locale], copy = entryRecoveryCopy[locale];
  let load!: (query: Record<string, string>) => Promise<void>, unload!: () => void;
  const request = vi.fn(), navTo = vi.fn();
  const page = mountEntry(source, {
    "@/lib/brand-copy": { displayNickname }, "@/lib/amount-display": { formatAmount }, "@/lib/privacy-return": { privacyPolicyHref },
    "@/lib/route": { navTo, navReset: vi.fn(), takeNavigationQuery: () => "" },
    "@dcloudio/uni-app": { onLoad: (fn: typeof load) => { load = fn; }, onUnload: (fn: typeof unload) => { unload = fn; } },
    "@/components/device/standalone-page-shell.vue": slot, "@/components/brand-lockup.vue": slot, "@/components/trust/trust-stat.vue": slot,
    "@/i18n/use-t": { useT: () => ref(messages) }, "@/i18n/entry-recovery": { useEntryRecoveryCopy: () => ref(copy) }, "@/i18n/format": { fmt },
    "@/mock/sponsors": { pickSponsor: vi.fn() }, "@/api/runtime": { remoteApiEnabled: true, apiClient: { request } },
    "@/api/public-sponsor-preview-api": { createPublicSponsorPreviewApi }, "@/api/errors": { ApiError },
    "@/auth/registration-sponsor": { normalizeRegistrationSponsorCode },
    "@/store/config": { useConfig: () => reactive({ syncFailed: true, config: { verifiedStats: null, rewards: { enabled: false } } }) },
    "@/store/auth": { useAuth: () => reactive({ isAuthenticated: false }) }, "@/store/sponsorship": {},
    "@/lib/referral-reward-gate": {}, "@/lib/referral-preview-state": previewState,
  });
  unmounts.push(page.unmount);
  return { ...page, load: (query: Record<string, string>) => load(query), unload: () => unload(), request, navTo, messages, copy };
}
describe("referral landing recovery runs the real preview parser and SFC", () => {
  it.each(["en", "zh", "vi"] as const)("retries a failed %s preview in place without losing the registration code", async locale => {
    const p = mount(locale); p.request.mockRejectedValueOnce(new Error("offline"));
    await p.load({ code: "audit2026" }); await flush();
    expect(text(p.root)).toContain(p.copy.referralUnavailable);
    expect(text(p.root)).not.toContain("Test sponsor");
    p.control(p.messages.register.create)!.props.onClick();
    expect(p.navTo).toHaveBeenCalledWith("/pages/register/register?ref=AUDIT2026");
    let resolve!: (value: unknown) => void;
    p.request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const retry = p.control(p.messages.ui.retry)!;
    const pending = retry.props.onClick(); await flush();
    expect(retry.props["aria-disabled"]).toBe(true);
    expect(text(p.root)).toContain(p.copy.referralLoading);
    expect(p.control(p.messages.register.create)).toBeDefined();
    await retry.props.onClick(); expect(p.request).toHaveBeenCalledTimes(2);
    resolve(preview()); await pending; await flush();
    expect(p.request).toHaveBeenLastCalledWith({ method: "GET", path: "/api/public/referrals/AUDIT2026/preview", authenticated: false });
    expect(text(p.root)).toContain("Test sponsor");
    expect(p.control(p.messages.ui.retry)).toBeUndefined();
    expect(text(p.root)).not.toContain(p.messages.ref.welcomeGift);
    expect(p.control(p.messages.ref.joinCta)).toBeDefined();
  });
  it("keeps newer route data when an earlier request finishes late, and ignores responses after exit", async () => {
    const p = mount();
    let resolveOld!: (v: unknown) => void;
    p.request.mockImplementationOnce(() => new Promise(done => { resolveOld = done; })).mockResolvedValueOnce(preview("NEWCODE9"));
    const old = p.load({ code: "OLDCODE8" });
    await p.load({ code: "NEWCODE9" }); await flush();
    resolveOld(preview("OLDCODE8")); await old; await flush();
    expect(text(p.root)).toContain("REF/NEWCODE9"); expect(text(p.root)).not.toContain("REF/OLDCODE8");
    let resolveExit!: (v: unknown) => void;
    p.request.mockImplementationOnce(() => new Promise(done => { resolveExit = done; }));
    const exiting = p.load({ code: "EXITCODE9" }); p.unload();
    resolveExit(preview("EXITCODE9")); await exiting; await flush();
    expect(text(p.root)).not.toContain("REF/EXITCODE9");
  });
  it.each(["", "bad/code"])("does not request malformed/missing code %s and keeps ordinary registration", async code => {
    const p = mount(); await p.load({ code }); await flush();
    expect(p.request).not.toHaveBeenCalled(); expect(p.control(p.messages.ui.retry)).toBeUndefined();
    p.control(p.messages.register.create)!.props.onClick();
    expect(p.navTo).toHaveBeenCalledWith("/pages/register/register");
  });
  it("keeps a mismatched response unavailable and does not forward a rejected invitation", async () => {
    const p = mount(); p.request.mockResolvedValueOnce(preview("OTHER123"));
    await p.load({ code: "AUDIT2026" }); await flush();
    expect(text(p.root)).toContain(p.copy.referralUnavailable);
    expect(text(p.root)).not.toContain("Test sponsor");
    p.request.mockRejectedValueOnce(new ApiError({ kind: "http", status: 404, message: "REFERRAL_PREVIEW_NOT_FOUND" }));
    await p.control(p.messages.ui.retry)!.props.onClick(); await flush();
    expect(text(p.root)).toContain(p.copy.referralInvalid);
    expect(p.control(p.messages.ui.retry)).toBeUndefined();
    p.control(p.messages.register.create)!.props.onClick();
    expect(p.navTo).toHaveBeenCalledWith("/pages/register/register");
    expect(all(p.root).filter(n => n.props.role === "button").length).toBeGreaterThan(0);
  });
});
