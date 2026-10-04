import source from "./chat.vue?raw";
import { describe, expect, it } from "vitest";

function handoffFunction(): string {
  const start = source.indexOf("async function onHumanHandoff()");
  const end = source.indexOf("\nasync function refreshNovaAvailability()", start);
  return source.slice(start, end);
}

describe("Nova human-handoff lifecycle", () => {
  it("invalidates an in-flight attempt when the page hides, while retaining a retry key", () => {
    expect(source).toContain("let handoffAttemptEpoch = 0;");
    expect(source).toMatch(/onHide\(\(\) => \{[\s\S]*\+\+handoffAttemptEpoch;[\s\S]*handoffBusy\.value = false;/);
    const onHide = source.match(/onHide\(\(\) => \{([\s\S]*?)\n\}\);/)?.[1] ?? "";
    expect(onHide).not.toContain("pendingHandoff = null");
  });

  it("makes an old completion unable to clear a newer retry's busy state", () => {
    const handoff = handoffFunction();
    expect(handoff).toContain("const attemptEpoch = ++handoffAttemptEpoch;");
    expect(handoff).toContain("attemptEpoch === handoffAttemptEpoch");
    expect(handoff).toMatch(/finally\s*\{\s*if \(attemptEpoch === handoffAttemptEpoch\) handoffBusy\.value = false;/);
  });

  it("keeps UUID generation inside the user-visible error boundary and safely falls back", () => {
    const handoff = handoffFunction();
    expect(handoff.indexOf("try {")).toBeLessThan(handoff.indexOf("requireCryptoUuid()"));
    expect(handoff).toMatch(/catch\s*\{[\s\S]*navTo\("\/pages\/support\/chat\?start=support"\)/);
  });

  it("does not copy an earlier Nova answer's context after the latest request failed", () => {
    expect(source).toContain("const handoffNeedsFreshQuestion = ref(false);");
    expect(source).toMatch(/nova\.completeRemote[\s\S]*handoffNeedsFreshQuestion\.value = false/);
    expect(source).toMatch(/catch \{[\s\S]*handoffNeedsFreshQuestion\.value = true/);
    expect(source).toMatch(/watch\([\s\S]*handoffNeedsFreshQuestion\.value = false/);
    expect(handoffFunction()).toMatch(/if \(handoffNeedsFreshQuestion\.value\)[\s\S]*navTo\("\/pages\/support\/chat\?start=support"\)/);
  });
});
