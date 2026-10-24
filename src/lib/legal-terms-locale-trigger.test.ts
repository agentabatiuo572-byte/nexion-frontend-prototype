import { expect, test } from "vitest";
import source from "../App.vue?raw";

test("launch, foreground, route and language changes do not invoke a Terms gate", () => {
  expect(source).not.toMatch(/scheduleLegalTermsGate|enforcePendingLegalTermsGate|hasPendingLegalTermsRequirement|lastLegalTermsGate/);
  expect(source).toContain("startQuestWatch();");
  expect(source).toContain("if (checkSession()) return;");
});
