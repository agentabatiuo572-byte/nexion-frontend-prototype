import { describe, expect, it, vi } from "vitest";
import { createBankBindingForm, directBankBindingAvailable, validBankRecipient } from "./bank-binding-form";
import { ApiError } from "@/api/errors";
import { BANK_HOLDER_NAME_RE } from "./native-unicode-regex";

const beneficiary = { bankCode: "", bankName: "BANKQR", maskedAccount: "****6789", effectiveAt: "2099-09-17T00:00:00Z", nextChangeAt: "2099-09-23T00:00:00Z" };
const config = { enabled: false, banks: [], bankCodeRequired: false, bindingOtpRequired: false, payType: "BANKQR", bankSelection: "ACCOUNT_ROUTED" as const, bankRoutingVerified: true, beneficiary: null };
function fixture() {
  const api = { config: vi.fn().mockResolvedValue(config), bind: vi.fn().mockResolvedValue(beneficiary), sendOtp: vi.fn().mockResolvedValue({ challengeNo: "PAYOUT-BANK-"+"a".repeat(32), expiresInSeconds: 300, retryAfterSeconds: 60 }) };
  let current = "user-a:1";
  let now = Date.now();
  const form = createBankBindingForm(api, () => current, () => now);
  const fill = () => Object.assign(form.state, { account: "00123456789", holder: "NGUYEN VAN A" });
  return { api, form, fill, advance: (ms: number) => { now += ms; }, switchUser: () => { current = "user-b:2"; form.reset(); } };
}
describe("bank binding form", () => {
  it("validates account and holder without requiring a bank, OTP, PAN expiry or CVV", () => {
    expect(validBankRecipient({ account: "001234", holder: "Nguyễn Văn An" })).toBe(true);
    for (const holder of ["TEST ACCOUNT", "张三", "歐陽娜娜", "𠮷田", "김민수", "Nguye\u0302\u0303n Va\u0306n A", "José O'Connor-Smith"])
      expect(validBankRecipient({ account: "0".repeat(32), holder })).toBe(true);
    expect(BANK_HOLDER_NAME_RE.source).not.toMatch(/\\[pP]\{/);
    expect(BANK_HOLDER_NAME_RE.test("A\uFA6EB")).toBe(false);
    for (const draft of [{ account: "12345", holder: "NGUYEN VAN A" },
      { account: "1234x5678", holder: "NGUYEN VAN A" }, { account: "001234", holder: "A" },
      { account: "001234", holder: "TEST123" }, { account: "001234", holder: "A×B" },
      { account: "001234", holder: "A😀B" }])
      expect(validBankRecipient(draft)).toBe(false);
  });
  it("requires explicit verified account routing before any binding or OTP", async () => {
    const { form, api, fill } = fixture(); fill();
    for (const c of [{ ...config, bankCodeRequired: undefined }, { ...config, bindingOtpRequired: true },
      { ...config, payType: "BANK" }, { ...config, bankCodeRequired: true },
      { ...config, bankRoutingVerified: false }, { ...config, bankRoutingVerified: undefined },
      { ...config, bankSelection: undefined }, { ...config, banks: [{ code: "VCB", name: "Vietcombank" }] }]) {
      api.config.mockResolvedValue(c); await form.load();
      expect(form.state.error).toBe(c.bankRoutingVerified === true ? "unsupported" : "routingUnverified");
      expect(form.canContinue()).toBe(false); expect(form.canSendOtp()).toBe(false); await form.submit();
    }
    expect(api.bind).not.toHaveBeenCalled();
  });
  it("submits directly with explicit empty bank code and only account/name then verifies readback", async () => {
    const { form, api, fill } = fixture(); await form.load(); fill();
    expect(form.canContinue()).toBe(true);
    await form.submit(); expect(api.bind).not.toHaveBeenCalled();
    api.config.mockResolvedValue({ ...config, beneficiary }); await form.submit(true);
    expect(api.bind).toHaveBeenCalledOnce();
    expect(api.bind.mock.calls[0][0]).toEqual({ bankCode: "", account: "00123456789", holder: "NGUYEN VAN A", accountRoutingConfirmed: true });
    expect(api.bind.mock.calls[0][1]).toMatch(/^bank-bind:[a-f0-9-]{36}$/);
    expect(form.state.phase).toBe("saved"); expect(form.state.account).toBe(""); expect(form.state.holder).toBe("");
  });
  it("a lost response retains the exact request and key; editing cannot create a second bind", async () => {
    const { form, api, fill } = fixture(); await form.load(); fill();
    api.bind.mockRejectedValueOnce(new ApiError({ kind: "network", message: "LOST" }));
    await form.submit(true); expect(form.state.phase).toBe("uncertain");
    form.state.account = "9999999999"; await form.load();
    api.config.mockResolvedValue({ ...config, beneficiary }); await form.submit();
    expect(api.bind.mock.calls[1]).toEqual(api.bind.mock.calls[0]); expect(form.state.phase).toBe("saved");
  });
  it("does not declare success when readback disagrees and retries GET without rebinding", async () => {
    const { form, api, fill } = fixture(); await form.load(); fill();
    await form.submit(true); expect(form.state.phase).toBe("uncertain"); expect(api.bind).toHaveBeenCalledOnce();
    api.config.mockResolvedValue({ ...config, beneficiary }); await form.submit();
    expect(api.bind).toHaveBeenCalledOnce(); expect(form.state.phase).toBe("saved");
  });
  it("blocks concurrent calls and discards late responses after account switch", async () => {
    const { form, api, fill, switchUser } = fixture(); await form.load(); fill();
    let resolve!: (v: typeof beneficiary) => void;
    api.bind.mockImplementation(() => new Promise(done => { resolve = done; }));
    const first = form.submit(true); await form.submit(true); expect(api.bind).toHaveBeenCalledOnce();
    switchUser(); resolve(beneficiary); await first;
    expect(form.state.account).toBe(""); expect(form.state.config).toBe(null); expect(api.config).toHaveBeenCalledOnce();
  });
  it("failed config refresh cannot allow blind submission", async () => {
    const { form, api, fill } = fixture(); await form.load(); fill();
    api.config.mockRejectedValue(new Error("OFFLINE")); await form.load();
    expect(form.state.config).toBe(null); expect(form.canContinue()).toBe(false); expect(form.state.error).toBe("load");
  });
  it("requires SMS for replacement even when the legacy cooldown date is in the future", async () => {
    const { form, api, fill } = fixture(); api.config.mockResolvedValue({ ...config, bindingOtpRequired: true, beneficiary });
    await form.load(); fill(); form.state.account = "0".repeat(32); form.state.holder = "TEST ACCOUNT";
    expect(form.canContinue()).toBe(false);
    expect(form.canSendOtp()).toBe(true); await form.sendOtp(); form.state.code="123456";
    expect(form.canContinue()).toBe(true); expect(form.canSendOtp()).toBe(false);
    await form.submit(true); expect(form.state.phase).toBe("saved");
    expect(api.bind.mock.calls[0][0]).toMatchObject({challengeNo:"PAYOUT-BANK-"+"a".repeat(32),code:"123456"});
    expect(form.state.code).toBe(""); expect(form.state.challengeNo).toBe("");
  });
  it("expires SMS, throttles resend, and ignores late responses after identity changes", async () => {
    const { form, api, fill, advance, switchUser } = fixture();
    api.config.mockResolvedValue({ ...config, bindingOtpRequired: true, beneficiary }); await form.load(); fill();
    await form.sendOtp(); form.state.code="123456"; expect(form.canContinue()).toBe(true);
    advance(300001); expect(form.canContinue()).toBe(false); expect(form.canSendOtp()).toBe(true);
    let resolve!: (v: {challengeNo:string;expiresInSeconds:number;retryAfterSeconds:number}) => void;
    api.sendOtp.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    const pending=form.sendOtp(); switchUser(); resolve({challengeNo:"PAYOUT-BANK-"+"b".repeat(32),expiresInSeconds:300,retryAfterSeconds:60});
    await pending; expect(form.state.challengeNo).toBe(""); expect(form.state.config).toBe(null);
  });
  it("keeps the same OTP and idempotency key when a replacement response is lost", async () => {
    const { form, api, fill }=fixture(); api.config.mockResolvedValue({...config,bindingOtpRequired:true,beneficiary});
    await form.load(); fill(); await form.sendOtp(); form.state.code="123456";
    api.bind.mockRejectedValueOnce(new ApiError({kind:"network",message:"LOST"}));
    await form.submit(true); expect(form.state.phase).toBe("uncertain");
    form.state.code="999999"; expect(form.canSendOtp()).toBe(false); await form.submit();
    expect(api.bind.mock.calls[1]).toEqual(api.bind.mock.calls[0]); expect(form.state.phase).toBe("saved");
  });
  it("does not permit replacement against an old server that omits the SMS requirement", async () => {
    const {form,api,fill}=fixture(); api.config.mockResolvedValue({...config,beneficiary});
    await form.load(); fill(); expect(form.canContinue()).toBe(false); expect(form.canSendOtp()).toBe(false);
  });
  it("SMS rejection or unavailable delivery never binds and permits safe correction", async () => {
    const {form,api,fill,advance}=fixture(); api.config.mockResolvedValue({...config,bindingOtpRequired:true,beneficiary});
    await form.load(); fill(); api.sendOtp.mockRejectedValueOnce(new ApiError({kind:"network",message:"LOST_SMS"}));
    await form.sendOtp(); expect(form.state.error).toBe("otpSend"); expect(form.canContinue()).toBe(false);
    expect(form.canSendOtp()).toBe(false); advance(60001); await form.sendOtp(); form.state.code="111111";
    api.bind.mockRejectedValueOnce(new ApiError({kind:"business",code:422,message:"BANK_CHANGE_OTP_INVALID"}));
    await form.submit(true); expect(form.state.error).toBe("otpInvalid"); expect(form.state.code).toBe("");
    form.state.code="123456"; await form.submit(true); expect(form.state.phase).toBe("saved");
    expect(api.bind.mock.calls[1][1]).not.toBe(api.bind.mock.calls[0][1]);
  });
  it("a definite rejection allows correction with a new key; leaving clears the entire draft", async () => {
    const { form, api, fill } = fixture(); await form.load(); fill();
    api.bind.mockRejectedValueOnce(new ApiError({ kind: "business", message: "BANK_BENEFICIARY_INVALID", code: 422 }));
    await form.submit(true); expect(form.state.phase).toBe("details");
    api.config.mockResolvedValue({ ...config, beneficiary }); await form.submit(true);
    expect(api.bind.mock.calls[1][1]).not.toEqual(api.bind.mock.calls[0][1]);
    form.reset(); expect(form.state.account).toBe(""); expect(form.state.holder).toBe(""); expect(form.state.config).toBe(null);
  });
});

describe("direct bank binding requires verified account routing", () => {
  const base = { enabled: true, banks: [], bankCodeRequired: false, bindingOtpRequired: false, payType: "BANKQR", beneficiary: null };

  it("refuses the current unverified contract and permits only explicit verified routing", () => {
    expect(directBankBindingAvailable({ ...base, bankSelection: "ACCOUNT_ROUTED", bankRoutingVerified: false })).toBe(false);
    expect(directBankBindingAvailable({ ...base, bankRoutingVerified: true })).toBe(false);
    expect(directBankBindingAvailable({ ...base, bankSelection: "ACCOUNT_ROUTED", bankRoutingVerified: true })).toBe(true);
    expect(directBankBindingAvailable({ ...base, bankSelection: "ACCOUNT_ROUTED", bankRoutingVerified: true,
      banks: [{ code: "VCB", name: "Vietcombank" }] })).toBe(false);
  });

  it("still refuses when the server does require a bank code", () => {
    expect(directBankBindingAvailable({ ...base, bankCodeRequired: true, bankSelection: "ACCOUNT_ROUTED" })).toBe(false);
  });
});
