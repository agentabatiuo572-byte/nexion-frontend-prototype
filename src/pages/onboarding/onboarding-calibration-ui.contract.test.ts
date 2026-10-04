import { describe, expect, it } from "vitest";

const pages = import.meta.glob("./*.vue", { query: "?raw", import: "default", eager: true });
const messages = import.meta.glob("../../i18n/messages/*.ts", { query: "?raw", import: "default", eager: true });
const estimator = (pages["./estimator.vue"] ?? "") as string;
const connect = (pages["./connect.vue"] ?? "") as string;
const zh = (messages["../../i18n/messages/zh.ts"] ?? "") as string;
const en = (messages["../../i18n/messages/en.ts"] ?? "") as string;
const vi = (messages["../../i18n/messages/vi.ts"] ?? "") as string;

describe("onboarding calibration read and presentation contract", () => {
  it("keeps missing and deferred calibrations actionable rather than rendering a duplicate detection failure", () => {
    // The canonical flow now handles a missing first estimate itself; an
    // explicit deferred record remains distinct from a read/calculation error.
    expect(estimator).toContain("createPhoneCalibrationFlow");
    expect(estimator).toMatch(/if \(result\.activationStatus === "DEFERRED"\) \{[\s\S]*?deferred\.value = true;[\s\S]*?return;/);
    expect(estimator).toContain('"/pages/onboarding/connect?mode=resume"');
    expect(estimator).toContain("deferred ? t.onboarding.activationDefer");
    expect(estimator).toContain("calibration?.calibrationStatus === 'PENDING_VERIFICATION' ? t.onboarding.phoneCalibrationPendingTitle : t.onboarding.calibrationFailedTitle");
    expect(estimator).toContain("isCurrent: () => isCurrent(scope) && auth.isAuthenticated");
  });

  it("uses the server response without a fabricated fixed-duration benchmark", () => {
    expect(connect).toContain("const result = await calibrationFlow.run(");
    expect(connect).toContain("if (!acceptCurrentCanonical(requestScope, result)) return;");
    expect(connect).not.toContain("CALIBRATION_MS");
    expect(connect).not.toContain("calTimeout");
    for (const locale of [zh, en, vi]) {
      expect(locale).not.toMatch(/12[- ]?second|12 秒|12 giây/i);
      expect(locale).not.toMatch(/thermal nominal|散热正常|nhiệt độ ổn/i);
    }
  });

  it("keeps the estimator title neutral before activation", () => {
    expect(zh).toContain('estimatorTitleH: "查看手机算力估算"');
    expect(en).toContain('estimatorTitleH: "View your phone compute estimate"');
    expect(vi).toContain('estimatorTitleH: "Xem ước tính tính toán của điện thoại"');
    for (const locale of [zh, en, vi]) {
      expect(locale).not.toMatch(/Your phone earns from day one|你的手机从今天开始赚钱|sinh lời ngay từ ngày đầu/i);
    }
  });
});
