import { expect, test, vi } from "vitest";
import ts from "typescript";
import raw from "../pages/register/register.vue?raw";
import { ApiError } from "../api/errors";

function fixture(sendRegistrationOtp: (...args: unknown[]) => Promise<unknown>) {
  const source = raw.slice(raw.indexOf("async function requestCode("), raw.indexOf("function onCaptchaOk("))
    .replace(/import\.meta\.env\.DEV/g, "true");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const ref = <T>(value: T) => ({ value });
  const state = { verifying: ref(false), fullPhone: ref("+8613800138000"), country: ref("+86"), phoneClean: ref("13800138000"),
    showCaptcha: ref(false), error: ref<string | null>(null), devBackendDown: ref(false), otpRequestId: ref(null),
    verifiedToken: ref(null), code: ref([]), focusIdx: ref(0), step: ref(1) };
  const bindings = { ...state, ApiError, authApi: { sendRegistrationOtp }, remoteApiEnabled: true,
    t: { value: { authOtp: { errorOtpSendUnavailable: "unavailable" } } },
    apiRuntimeConfig: { environment: "dev" }, geoText: () => null, startResend: vi.fn() };
  const run = new Function(...Object.keys(bindings), `let mounted=true,otpFlowVersion=0;${code};return requestCode;`)(...Object.values(bindings));
  return { ...state, run };
}

test.each(["USER_CAPTCHA_REQUIRED", "USER_CAPTCHA_TICKET_INVALID"])("%s reopens verification without blaming backend", async message => {
  const s = fixture(async () => { throw new ApiError({ kind: "http", status: 428, message }); });
  await s.run("expired-ticket");
  expect(s.showCaptcha.value).toBe(true);
  expect(s.verifying.value).toBe(false);
  expect(s.error.value).toBeNull();
  expect(s.devBackendDown.value).toBe(false);
});
test("business refusal does not claim Java is unavailable", async () => {
  const s = fixture(async () => { throw new ApiError({ kind: "http", status: 429, message: "USER_REGISTRATION_OTP_COOLDOWN" }); });
  await s.run(); expect(s.showCaptcha.value).toBe(false); expect(s.devBackendDown.value).toBe(false);
});
test("network recovery clears the old development outage banner", async () => {
  const send = vi.fn().mockRejectedValueOnce(new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" }))
    .mockResolvedValueOnce({ challengeNo: "REG-test", resendAfterSec: 60 });
  const s = fixture(send); await s.run(); expect(s.devBackendDown.value).toBe(true);
  await s.run(); expect(s.devBackendDown.value).toBe(false); expect(s.step.value).toBe(2);
});
test("late rejected ticket cannot open verification for a changed phone", async () => {
  let reject!: (e: Error) => void;
  const s = fixture(() => new Promise((_, r) => { reject = r; }));
  const pending = s.run(); s.fullPhone.value = "+8613900139000";
  reject(new ApiError({ kind: "http", status: 428, message: "USER_CAPTCHA_REQUIRED" }));
  await pending; expect(s.showCaptcha.value).toBe(false); expect(s.error.value).toBeNull();
});
