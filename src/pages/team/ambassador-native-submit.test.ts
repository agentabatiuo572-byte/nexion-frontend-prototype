// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { transpileModule } from "typescript";
import { parseAmbassadorApplicationDraft, successfulAmbassadorApplicationState } from "@/lib/team-p3-17-18-request-scope";

const source = readFileSync(new URL("./agent.vue", import.meta.url), "utf8");
const implementation = source.match(/async function submit\(\) \{[\s\S]*?\n\}/)![0];
const javascript = transpileModule(implementation, { compilerOptions: { target: 7 } }).outputText;

function scenario(parse = parseAmbassadorApplicationDraft) {
  const input = {
    date: { value: "2026-10-18" }, city: { value: "UVEL-TEST-TEAM48-1058" },
    budgetText: { value: "3000" }, selectedBucketId: { value: "venue" },
  };
  const receipt = { applicationId: 598, status: "PENDING" };
  const api = { submit: vi.fn().mockResolvedValue(receipt) };
  const toast = { error: vi.fn(), success: vi.fn() };
  const clear = vi.fn();
  const command = vi.fn().mockReturnValue("same-intent-key");
  const dependencies = {
    ...input, unlocked: { value: true },
    parseAmbassadorApplicationDraft: parse,
    t: { value: { agent: { toastRemoteFailed: "Failed", submitUnconfirmedBody: "Retry", invalidFormTitle: "Invalid", invalidFormBody: "Check fields" } } },
    toast, policy: { value: { buckets: [{ id: "venue", minBudgetUsdt: 1000, maxBudgetUsdt: 10000 }] } },
    remoteApiEnabled: true, submitting: { value: false }, payloadIdentity: JSON.stringify,
    invalidateAgentRequests: vi.fn(), captureAgentRequest: () => ({ accountKey: "1058" }),
    acquireAmbassadorCommandKey: command, requestIsCurrent: () => true,
    ambassadorApplicationApi: api, latestApplication: { value: null },
    finishAmbassadorCommand: vi.fn(), refreshHistory: vi.fn().mockResolvedValue([]),
    successfulAmbassadorApplicationState, clearAgentFormState: clear,
    fmt: () => "Submitted", formatAmount: String,
  };
  const submit = new Function(...Object.keys(dependencies), `${javascript}; return submit;`)(...Object.values(dependencies));
  return { submit, api, toast, clear, command, input, dependencies };
}

describe("ambassador native submission", () => {
  it("posts a valid draft without Intl and retains the existing command/receipt flow", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T07:15:33Z"));
    vi.stubGlobal("Intl", undefined);
    const state = scenario();
    await state.submit();
    expect(state.api.submit).toHaveBeenCalledExactlyOnceWith({ eventDate: "2026-10-18", city: "UVEL-TEST-TEAM48-1058", budgetUsdt: 3000, bucket: "venue" }, "same-intent-key");
    expect(state.toast.success).toHaveBeenCalledOnce();
    expect(state.clear).toHaveBeenCalledOnce();
    expect(state.dependencies.latestApplication.value).toEqual({ applicationId: 598, status: "PENDING" });
    expect(state.dependencies.submitting.value).toBe(false);
  });

  it("shows an error without sending or clearing a draft when validation throws", async () => {
    const state = scenario(() => { throw new ReferenceError("native date validation failed"); });
    await state.submit();
    expect(state.toast.error).toHaveBeenCalledExactlyOnceWith("Failed", "Retry");
    expect(state.api.submit).not.toHaveBeenCalled();
    expect(state.command).not.toHaveBeenCalled();
    expect(state.toast.success).not.toHaveBeenCalled();
    expect(state.clear).not.toHaveBeenCalled();
    expect(state.input.city.value).toBe("UVEL-TEST-TEAM48-1058");
  });

  it("keeps the selected bucket budget gate before command allocation", async () => {
    const state = scenario(() => ({ eventDate: "2026-10-18", city: "Tokyo", budgetUsdt: 999, bucket: "venue" }));
    await state.submit();
    expect(state.toast.error).toHaveBeenCalledExactlyOnceWith("Invalid", "Check fields");
    expect(state.api.submit).not.toHaveBeenCalled();
    expect(state.command).not.toHaveBeenCalled();
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
