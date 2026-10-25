import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { entryRecoveryCopy } from "@/i18n/entry-recovery";
import { fmt } from "@/i18n/format";
import { formatAmount } from "@/lib/amount-display";
import { validatedTransactionHash } from "@/lib/transaction-hash-input";
import { flush, mountEntry, slot, text } from "@/lib/entry-review.test-support";
import source from "./hash.vue?raw";

const hash = "a1".repeat(32), unmounts: Array<() => void> = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { unmounts.splice(0).forEach(fn => fn()); vi.useRealTimers(); vi.unstubAllGlobals(); });
function mount(locale: "en" | "zh" | "vi" = "en") {
  const messages = { en, zh, vi: vietnamese }[locale], copy = entryRecoveryCopy[locale];
  let load!: (query: Record<string, string>) => void;
  const navTo = vi.fn(), toast = { success: vi.fn(), error: vi.fn() };
  const page = mountEntry(source, {
    "@/lib/amount-display": { formatAmount }, "@dcloudio/uni-app": { onLoad: (fn: typeof load) => { load = fn; } },
    "@/components/app-chassis.vue": slot, "@/components/sub-page-header.vue": slot, "@/components/tx/tx-stat.vue": slot, "@/components/tx/tx-row.vue": slot,
    "@/i18n/use-t": { useT: () => ref(messages) }, "@/i18n/entry-recovery": { useEntryRecoveryCopy: () => ref(copy) },
    "@/i18n/format": { fmt }, "@/store/ui": { toast }, "@/api/runtime": { remoteApiEnabled: true },
    "@/lib/route": { navTo }, "@/lib/transaction-hash-input": { validatedTransactionHash },
  });
  unmounts.push(page.unmount);
  return { ...page, load: (query: Record<string, string>) => load(query), navTo, toast, messages, copy };
}
describe("retained transaction hash is an identifier, never a chain status", () => {
  it.each([undefined, null, 1234, [hash], "", " ", "ab".repeat(31), "g".repeat(64), `${hash}<script>`, `https://example.test/${hash}`])("rejects malformed hash %#", value => {
    expect(validatedTransactionHash(value)).toBe("");
  });
  it.each([hash, `0x${hash}`, hash.toUpperCase()])("preserves valid hash %s without deriving facts", value => {
    expect(validatedTransactionHash(` ${value} `)).toBe(value);
  });
  it.each(["en", "zh", "vi"] as const)("renders/copies the passed hash in %s but ignores query chain facts", async locale => {
    const writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const p = mount(locale); p.load({ hash, net: "ERC20", amount: "777777", confs: "9999", to: "0xdeadbeefdeadbeef" }); await flush();
    expect(text(p.root)).toContain(hash); expect(text(p.root)).toContain(p.messages.tx.detailUnavailableTitle);
    for (const absent of [p.messages.tx.confirmed, "777777", "9999", "0xdeadbeefdeadbeef", "Gwei"]) expect(text(p.root)).not.toContain(absent);
    await p.control(p.messages.tx.copy)!.props.onClick(); await flush();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(hash); expect(p.toast.success).toHaveBeenCalledWith(p.messages.tx.hashCopied);
    p.control(p.copy.viewBills)!.props.onClick(); expect(p.navTo).toHaveBeenCalledWith("/pages/me/wallet-bills");
  });
  it("distinguishes missing and malformed identifiers and never offers to copy them", async () => {
    const p = mount(); p.load({}); await flush();
    expect(text(p.root)).toContain(p.copy.txMissingBody); expect(p.control(en.tx.copy)).toBeUndefined();
    p.load({ hash: "invalid", confs: "50" }); await flush();
    expect(text(p.root)).toContain(p.copy.txInvalidBody); expect(p.control(en.tx.copy)).toBeUndefined();
    expect(text(p.root)).not.toContain(en.tx.detailUnavailableBody);
  });
  it("reports clipboard denial, retries, and ignores a stale copy result after the route changes", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const clipboard = vi.fn(({ fail }: any) => fail()); vi.stubGlobal("uni", { setClipboardData: clipboard });
    const p = mount(); p.load({ hash }); await flush();
    await p.control(en.tx.copy)!.props.onClick(); await flush();
    expect(p.toast.success).not.toHaveBeenCalled(); expect(p.toast.error).toHaveBeenCalledWith(en.tx.hashCopyFailed);
    clipboard.mockImplementationOnce(({ success }: any) => success());
    await p.control(en.tx.hashCopyFailed)!.props.onClick(); await flush(); expect(p.toast.success).toHaveBeenCalledOnce();
    let finish!: () => void;
    vi.stubGlobal("navigator", { clipboard: { writeText: () => new Promise<void>(done => { finish = done; }) } });
    const pending = p.control(en.tx.hashCopied)!.props.onClick();
    p.load({}); finish(); await pending; await flush();
    expect(text(p.root)).toContain(p.copy.txMissingBody); expect(p.toast.success).toHaveBeenCalledOnce();
  });
});
