import { afterEach, describe, expect, it, vi } from "vitest";
import { createRuntimeSessionVault, type SessionSnapshot } from "./session-vault";

const user = { userId: 7, countryCode: "+86", phone: "13800000007", nickname: "Fixture", onboardingComplete: true };
const chainKey = "a".repeat(64);
const session = (accessToken: string): SessionSnapshot => ({
  accessToken, refreshToken: "", refreshCredentialMode: "cookie", tokenType: "Bearer", user,
  sessionSyncKey: chainKey,
});

class TestChannel {
  static peers: TestChannel[] = [];
  static messages: unknown[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  constructor(readonly name: string) { TestChannel.peers.push(this); }
  postMessage(data: unknown) {
    TestChannel.messages.push(data);
    for (const peer of TestChannel.peers) if (peer !== this && peer.name === this.name) {
      queueMicrotask(() => peer.onmessage?.({ data } as MessageEvent<unknown>));
    }
  }
}

afterEach(() => { vi.unstubAllGlobals(); TestChannel.peers = []; TestChannel.messages = []; });

describe("H5 cross-tab cookie rotation", () => {
  it("moves only the in-memory access token to the same account and ignores delayed older rotations", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", TestChannel);
    const a = createRuntimeSessionVault();
    const b = createRuntimeSessionVault();
    a.save(session("initial"));
    b.save(session("initial"));
    await vi.waitFor(() => expect(TestChannel.messages.length).toBe(2));

    const before = b.revision();
    expect(a.refreshIfUnchanged(session("rotated-a"), a.revision())).toBe(true);
    await vi.waitFor(() => expect(b.read()?.accessToken).toBe("rotated-a"));
    expect(b.isRefreshContinuation(before)).toBe(true);

    const older = TestChannel.messages.at(-1);
    expect(older).toHaveProperty("sealed", expect.any(ArrayBuffer));
    expect(older).not.toHaveProperty("refreshToken");
    expect(older).not.toHaveProperty("user");
    expect(older).not.toHaveProperty("accessToken");
    expect(JSON.stringify(older)).not.toContain("rotated-a");
    expect(JSON.stringify(older)).not.toContain(chainKey);
    expect(b.refreshIfUnchanged(session("rotated-b"), b.revision())).toBe(true);
    await vi.waitFor(() => expect(a.read()?.accessToken).toBe("rotated-b"));
    TestChannel.peers[0]?.onmessage?.({ data: older } as MessageEvent<unknown>);
    await vi.waitFor(() => expect(a.read()?.accessToken).toBe("rotated-b"));
  });

  it("does not import another account or resurrect a cleared vault", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", TestChannel);
    const a = createRuntimeSessionVault();
    const b = createRuntimeSessionVault();
    a.save(session("first"));
    b.save({ ...session("other"), user: { ...user, userId: 8 } });
    await vi.waitFor(() => expect(TestChannel.messages.length).toBe(2));
    a.refreshIfUnchanged(session("second"), a.revision());
    await vi.waitFor(() => expect(TestChannel.messages.length).toBe(3));
    expect(b.read()?.accessToken).toBe("other");
    b.clear();
    a.refreshIfUnchanged(session("third"), a.revision());
    await vi.waitFor(() => expect(TestChannel.messages.length).toBe(4));
    expect(b.read()).toBeNull();
  });

  it("does not share a bearer with a tab lacking the chain key", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", TestChannel);
    const a = createRuntimeSessionVault();
    const anonymous = createRuntimeSessionVault();
    const otherChain = createRuntimeSessionVault();
    a.save(session("secret-access"));
    otherChain.save({ ...session("own-access"), sessionSyncKey: "b".repeat(64) });
    await vi.waitFor(() => expect(TestChannel.messages.length).toBe(2));
    a.refreshIfUnchanged(session("latest-access"), a.revision());
    await vi.waitFor(() => expect(TestChannel.messages.length).toBe(3));
    expect(anonymous.read()).toBeNull();
    expect(otherChain.read()?.accessToken).toBe("own-access");
    expect(JSON.stringify(TestChannel.messages)).not.toContain("latest-access");
  });
});
