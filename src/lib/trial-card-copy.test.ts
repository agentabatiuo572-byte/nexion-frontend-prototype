import { computed, reactive, ref } from "vue";
import { describe, expect, it } from "vitest";
import { en } from "../i18n/messages/en";
import { vi } from "../i18n/messages/vi";
import { zh } from "../i18n/messages/zh";
import type { TrialStatus } from "../store/trial-boundary";
import ghostSource from "../components/trial-ghost-slot.vue?raw";
import devicesSource from "../pages/me/devices.vue?raw";
import { trialCardLabels } from "./trial-card-copy";

describe("trial card status copy", () => {
  it.each([
    ["zh", zh, "试用已结束", "抵扣金剩余有效期 {eta}"],
    ["en", en, "Trial ended", "Trial credit valid for {eta}"],
    ["vi", vi, "Đã kết thúc dùng thử", "Tiền khấu trừ còn hiệu lực {eta}"],
  ] as const)("distinguishes accrual from credit retention in %s", (_, messages, badge, etaTemplate) => {
    expect(trialCardLabels("active", messages.trial)).toEqual({
      badge: messages.trial.ghostBadge,
      etaTemplate: messages.trial.ghostEta,
    });
    expect(trialCardLabels("grace", messages.trial)).toEqual({ badge, etaTemplate });
  });

  it("updates both labels on server state and locale changes without changing the state", () => {
    const state = reactive({ status: "active" as TrialStatus });
    const messages = ref(zh);
    const labels = computed(() => trialCardLabels(state.status, messages.value.trial));
    expect(labels.value.badge).toBe("试用中");
    state.status = "grace";
    expect(labels.value.badge).toBe("试用已结束");
    expect(labels.value.etaTemplate).toBe("抵扣金剩余有效期 {eta}");
    messages.value = en;
    expect(labels.value.badge).toBe("Trial ended");
    expect(labels.value.etaTemplate).toBe("Trial credit valid for {eta}");
    expect(state.status).toBe("grace");
  });

  it.each([["Home/Earn", ghostSource], ["device inventory", devicesSource]])(
    "%s consumes the shared badge instead of an unconditional on-trial label", (_, source) => {
      expect(source).toContain("trialCardLabels(trial.status, t.value.trial)");
      expect(source.split("<script setup")[0]).toContain("{{ trialLabels.badge }}");
      expect(source.split("<script setup")[0]).not.toContain("{{ t.trial.ghostBadge }}");
    },
  );

  it("formats the existing server countdown with the state-specific meaning", () => {
    expect(ghostSource).toContain("fmt(trialLabels.value.etaTemplate, { eta: etaLabel.value })");
    expect(ghostSource).toContain("remainingMs(now.value)");
  });

  it("does not leave the device inventory subtitle claiming a free trial in grace", () => {
    expect(devicesSource.includes("trial.status === 'grace' ? t.trial.ghostRibbonGrace : t.trial.deviceRowSub")).toBe(true);
  });
});
