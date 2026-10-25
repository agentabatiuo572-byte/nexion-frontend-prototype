import { computed } from "vue";
import { createAmbassadorDraftCache, beginAmbassadorDraftSubmit, endAmbassadorDraftSubmit } from "@/lib/ambassador-draft-session";
// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { transpileModule } from "typescript";
import { ambassadorSubmitErrorRecovery, parseAmbassadorApplicationDraft, successfulAmbassadorApplicationState } from "@/lib/team-p3-17-18-request-scope";
import { ApiError, isSettledRejection } from "@/api/errors";
import { isAmbassadorApplicationPending } from "@/api/ambassador-application-api";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";

const source = readFileSync(new URL("./agent.vue", import.meta.url), "utf8");
const implementation = source.match(/async function submit\(\) \{[\s\S]*?\n\}/)![0];
const budgetImplementation = source.match(/function applicationBudget\([^\n]*\{[\s\S]*?\n\}/)?.[0];
if (!budgetImplementation) throw new Error('Missing actual application budget display');
const javascript = transpileModule(`${budgetImplementation}\n${implementation}`, { compilerOptions: { target: 7 } }).outputText;

function scenario(parse = parseAmbassadorApplicationDraft, agent?: typeof en.agent) {
  const input = {
    date: { value: "2026-10-18" }, city: { value: "UVEL-TEST-TEAM48-1058" },
    budgetText: { value: "3000" }, selectedBucketId: { value: "venue" },
  };
  const receipt = { applicationId: 598, status: "PENDING" };
  const api = { submit: vi.fn().mockResolvedValue(receipt) };
  const toast = { error: vi.fn(), success: vi.fn() };
  const clear = vi.fn();
  const command = vi.fn().mockReturnValue("same-intent-key");
  const draft = { value: createAmbassadorDraftCache().forAccount({ accountKey: "1058", accountEpoch: 1 }) };
  const dependencies = {
    draft, beginAmbassadorDraftSubmit, endAmbassadorDraftSubmit, agentMounted: true, pageReadState: { value: "ready" },
    app: { accountKey: "1058", accountBindingEpoch: 1 }, refreshAgentPage: vi.fn(),
    ...input, unlocked: { value: true },
    parseAmbassadorApplicationDraft: parse,
    t: { value: { agent: agent ?? { ...en.agent, toastRemoteFailed: "Failed", submitUnconfirmedBody: "Retry", invalidFormTitle: "Invalid", invalidFormBody: "Check fields" } } },
    toast, policy: { value: { buckets: [{ id: "venue", minBudgetUsdt: 1000, maxBudgetUsdt: 10000 }] } },
    remoteApiEnabled: true, submitting: computed(() => draft.value.pending !== null), payloadIdentity: JSON.stringify,
    invalidateAgentRequests: vi.fn(), captureAgentRequest: () => ({ accountKey: "1058", accountEpoch: 1 }),
    acquireAmbassadorCommandKey: command, requestIsCurrent: () => true,
    ambassadorApplicationApi: api, latestApplication: { value: null },
    finishAmbassadorCommand: vi.fn(), refreshHistory: vi.fn().mockResolvedValue([]),
    refreshLatest: vi.fn().mockResolvedValue(receipt),
    ambassadorSubmitErrorRecovery, isSettledRejection, isAmbassadorApplicationPending,
    successfulAmbassadorApplicationState, clearAgentFormState: clear,
    fmt,
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
    expect(state.toast.success.mock.calls[0][1]).toContain('3,000.00 USDT');
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

  it.each([
    [zh.agent, "已有申请等待处理", "请在“我的申请”查看进度，等待现有申请处理后再提交新申请。"],
    [en.agent, "An application is already pending", "Check My application for progress and wait for your current application to be processed before submitting a new one."],
    [vietnamese.agent, "Đã có đơn đang chờ xử lý", "Xem tiến độ tại Đơn của tôi và chờ đơn hiện tại được xử lý trước khi gửi đơn mới."],
  ])("explains the definite pending rejection in the selected language", async (agent, title, body) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T07:15:33Z"));
    const state = scenario(parseAmbassadorApplicationDraft, agent);
    state.api.submit.mockRejectedValue(new ApiError({ kind: "http", status: 409, message: "AMBASSADOR_APPLICATION_PENDING" }));
    await state.submit();
    expect(state.toast.error).toHaveBeenCalledExactlyOnceWith(title, body);
    expect(state.dependencies.refreshHistory).toHaveBeenCalledOnce();
    expect(state.dependencies.refreshLatest).not.toHaveBeenCalled();
    expect(state.dependencies.finishAmbassadorCommand).toHaveBeenCalledOnce();
    expect(state.toast.success).not.toHaveBeenCalled();
    expect(state.clear).not.toHaveBeenCalled();
    expect(state.input.city.value).toBe("UVEL-TEST-TEAM48-1058");
    expect(state.input.budgetText.value).toBe("3000");
    expect(state.input.date.value).toBe("2026-10-18");
    expect(state.input.selectedBucketId.value).toBe("venue");
    expect(state.dependencies.submitting.value).toBe(false);
  });

  it("keeps a definite rejection visible even when history refresh fails", async () => {
    const state = scenario(() => ({ eventDate: "2026-10-18", city: "Tokyo", budgetUsdt: 3000, bucket: "venue" }), zh.agent);
    state.api.submit.mockRejectedValue(new ApiError({ kind: "http", status: 409, message: "AMBASSADOR_APPLICATION_PENDING" }));
    state.dependencies.refreshHistory.mockRejectedValue(new Error("offline"));
    await state.submit();
    expect(state.toast.error).toHaveBeenCalledExactlyOnceWith("已有申请等待处理", "请在“我的申请”查看进度，等待现有申请处理后再提交新申请。");
    expect(state.clear).not.toHaveBeenCalled();
    expect(state.dependencies.finishAmbassadorCommand).toHaveBeenCalledOnce();
  });

  it.each([
    new ApiError({ kind: "http", status: 409, message: "AMBASSADOR_APPLICATION_RESULT_UNKNOWN" }),
    new ApiError({ kind: "http", status: 409, message: "IDEMPOTENCY_PAYLOAD_CONFLICT" }),
    new ApiError({ kind: "http", status: 409, message: "AMBASSADOR_APPLICATION_CONFLICT" }),
    new ApiError({ kind: "http", status: 503, message: "AMBASSADOR_APPLICATION_PENDING" }),
    new ApiError({ kind: "network", message: "AMBASSADOR_APPLICATION_PENDING" }),
    new Error("AMBASSADOR_APPLICATION_PENDING"),
  ])("retains the command and unknown outcome for other failures: %s", async (failure) => {
    const state = scenario(() => ({ eventDate: "2026-10-18", city: "Tokyo", budgetUsdt: 3000, bucket: "venue" }));
    state.api.submit.mockRejectedValue(failure);
    await state.submit();
    expect(state.toast.error).toHaveBeenCalledExactlyOnceWith("Failed", "Retry");
    expect(state.dependencies.finishAmbassadorCommand).not.toHaveBeenCalled();
    expect(state.dependencies.refreshLatest).toHaveBeenCalledOnce();
    expect(state.dependencies.refreshHistory).not.toHaveBeenCalled();
    expect(state.clear).not.toHaveBeenCalled();
    expect(state.toast.success).not.toHaveBeenCalled();
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
