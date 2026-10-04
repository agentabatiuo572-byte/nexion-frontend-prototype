import { describe, expect, it } from "vitest";
import source from "./App.vue?raw";

describe("formal App idle server-session detection", () => {
  it("uses a throttled remote refresh probe instead of the local mock session registry", () => {
    const start = source.indexOf("function checkSession(): boolean");
    const end = source.indexOf("// Cross-tab instant session refresh", start);
    const checkSession = source.slice(start, end);

    expect(source).toContain("const SERVER_SESSION_PROBE_MIN_MS = 60_000;");
    expect(source).toContain("function probeServerSession(): Promise<boolean>");
    expect(source).toContain("apiClient.refreshSession()");
    expect(checkSession).toContain("if (remoteApiEnabled) {");
    expect(checkSession).toContain("void probeServerSession();");
    expect(checkSession.indexOf("if (remoteApiEnabled)")).toBeLessThan(checkSession.indexOf("session.validate()"));
    const loopsStart = source.indexOf("function canRunBusinessLoops(): boolean");
    const loopsEnd = source.indexOf("function ensureBusinessLoopsAllowed", loopsStart);
    const loops = source.slice(loopsStart, loopsEnd);
    expect(loops).toContain("if (remoteApiEnabled) return canRefreshRemoteAccount(auth);");
    expect(loops.indexOf("if (remoteApiEnabled)")).toBeLessThan(loops.indexOf("useSession().validate()"));
  });

  it("runs the controlled probe when the App returns to foreground", () => {
    expect(source).toContain("onShow(() => {");
    expect(source).toContain("void probeServerSession();");
  });
});
