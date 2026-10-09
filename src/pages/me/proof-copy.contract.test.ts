import { describe, expect, it, vi } from "vitest";
import ts from "typescript";

const sources = import.meta.glob([
  "../../i18n/messages/zh.ts", "../../i18n/messages/en.ts", "../../i18n/messages/vi.ts", "./proof.vue", "../../lib/share.ts",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function proofMessages(path: string) {
  const source = sources[path] ?? "";
  const start = source.indexOf("  proof: {");
  const end = source.indexOf("  taskHistory:", start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

describe("proof sharing copy", () => {
  it.each([
    ["../../i18n/messages/zh.ts", "有效业务与奖励记录"],
    ["../../i18n/messages/en.ts", "valid activity, and reward records"],
    ["../../i18n/messages/vi.ts", "hoạt động hợp lệ và lịch sử thưởng"],
  ])("keeps the %s invitation conditional on rules, valid activity, and reward records", (path, expected) => {
    const copy = proofMessages(path);
    expect(copy).toContain(expected);
    expect(copy).not.toMatch(/5%|终身|lifetime|trọn đời|earn(?:s)? when they join/iu);
  });

  it("does not turn the network share message into an earnings promise or duplicate an unknown percentile", () => {
    const page = sources["./proof.vue"] ?? "";
    expect(page).not.toContain("Compound earnings from each");
    expect(page).toContain('topPct.value === null ? "—"');
    expect(page).toContain("topPct.value === null ? t.value.proof.topPctUnavailable");
  });
});

function compiledFunction(source: string, name: string) {
  const tree = ts.createSourceFile("clipboard.ts", source, ts.ScriptTarget.Latest, true);
  const node = tree.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  if (!node) throw new Error(`Missing actual clipboard function: ${name}`);
  return ts.transpileModule(node.getText(tree).replace(/^export\s+/, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

function clipboardFixture(throws = false) {
  const uni = { setClipboardData: vi.fn((_options: { data: string; success?: () => void; fail?: () => void }) => {
    if (throws) throw new Error("Clipboard unavailable");
  }) };
  const copyToClipboard = new Function("uni", `${compiledFunction(sources["../../lib/share.ts"], "copyText")}\nreturn copyText;`)(uni);
  const page = sources["./proof.vue"].match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1] ?? "";
  const toast = { success: vi.fn(), info: vi.fn() };
  const t = { value: { share: { copyFailed: "Copy failed" } } };
  const copyText = new Function("uni", "copyToClipboard", "toast", "t", `${compiledFunction(page, "copyText")}\nreturn copyText;`)(uni, copyToClipboard, toast, t);
  return { uni, toast, copyText, callbacks: () => uni.setClipboardData.mock.calls[0][0] };
}

describe("proof clipboard completion feedback", () => {
  it("keeps the success toast pending until the actual API success callback", async () => {
    const fixture = clipboardFixture();
    const completion = fixture.copyText("https://example.invalid/ref/fixture", "Copied", "Link");
    expect(fixture.uni.setClipboardData).toHaveBeenCalledOnce();
    expect(fixture.callbacks().data).toBe("https://example.invalid/ref/fixture");
    expect(fixture.toast.success).not.toHaveBeenCalled();
    fixture.callbacks().success?.();
    await completion;
    expect(fixture.toast.success).toHaveBeenCalledExactlyOnceWith("Copied", "Link");
    expect(fixture.toast.info).not.toHaveBeenCalled();
  });

  it("reports an asynchronous fail callback without a success toast", async () => {
    const fixture = clipboardFixture();
    const completion = fixture.copyText("fixture", "Copied");
    await Promise.resolve();
    fixture.callbacks().fail?.();
    await completion;
    expect(fixture.toast.success).not.toHaveBeenCalled();
    expect(fixture.toast.info).toHaveBeenCalledExactlyOnceWith("Copy failed");
  });

  it("preserves successful copy feedback and the default empty description", async () => {
    const fixture = clipboardFixture();
    const completion = fixture.copyText("fixture", "Copied");
    fixture.callbacks().success?.();
    await completion;
    expect(fixture.toast.success).toHaveBeenCalledExactlyOnceWith("Copied", "");
    expect(fixture.toast.info).not.toHaveBeenCalled();
  });

  it("handles a clipboard API throw as failure without an unhandled rejection", async () => {
    const fixture = clipboardFixture(true);
    await expect(Promise.resolve().then(() => fixture.copyText("fixture", "Copied"))).resolves.toBeUndefined();
    expect(fixture.toast.success).not.toHaveBeenCalled();
    expect(fixture.toast.info).toHaveBeenCalledExactlyOnceWith("Copy failed");
  });
});
