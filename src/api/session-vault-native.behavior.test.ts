import { describe, expect, it, vi } from "vitest";
import { createSessionVault } from "./session-vault";

const saved = { schema: 1, refreshToken: "synthetic-refresh", tokenType: "Bearer",
  user: { userId: 7101, countryCode: "+86", phone: "13800007101", nickname: "Fixture", onboardingComplete: true } };
const snapshot = { ...saved, accessToken: "synthetic-access" };

describe("native persistence vault boundaries", () => {
  it("waits for explicit hydration and does not grant access from persisted data", () => {
    const storage = { get: vi.fn(() => saved), set: vi.fn(), remove: vi.fn() };
    const vault = createSessionVault(storage, { deferHydration: true });
    expect(storage.get).not.toHaveBeenCalled();
    expect(vault.read()).toBeNull();
    vault.hydrate();
    expect(vault.read()?.accessToken).toBe("");
    expect(vault.read()?.refreshToken).toBe(saved.refreshToken);
    vault.hydrate();
    expect(storage.get).toHaveBeenCalledTimes(1);
  });

  it("propagates an unavailable deferred adapter and allows a later readiness retry", () => {
    const storage = { get: vi.fn().mockImplementationOnce(() => { throw new Error("storage unavailable"); }).mockReturnValue(saved), set: vi.fn(), remove: vi.fn() };
    const vault = createSessionVault(storage, { deferHydration: true });
    expect(() => vault.hydrate()).toThrow("storage unavailable");
    expect(vault.read()).toBeNull();
    vault.hydrate();
    expect(vault.read()?.refreshToken).toBe(saved.refreshToken);
  });

  it.each(["login", "logout"])("does not hydrate an old credential after a newer %s", (action) => {
    const storage = { get: vi.fn(() => saved), set: vi.fn(), remove: vi.fn() };
    const vault = createSessionVault(storage, { deferHydration: true });
    if (action === "login") vault.save({ ...snapshot, user: { ...saved.user, userId: 7102 } });
    else vault.clear();
    vault.hydrate();
    expect(storage.get).not.toHaveBeenCalled();
    expect(vault.read()?.user.userId ?? null).toBe(action === "login" ? 7102 : null);
  });

  it("clears memory and advances CAS while surfacing durable deletion failure", () => {
    const storage = { get: vi.fn(), set: vi.fn(), remove: vi.fn(() => { throw new Error("delete unavailable"); }) };
    const vault = createSessionVault(storage);
    vault.save(snapshot);
    const revision = vault.revision();
    expect(() => vault.clear()).toThrow("delete unavailable");
    expect(vault.read()).toBeNull();
    expect(vault.revision()).toBe(revision + 1);
    expect(vault.clearIfUnchanged(revision)).toBe(false);
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });

  it("rejects an accepted token response whose persistence failed and keeps memory closed", () => {
    const storage = { get: vi.fn(), set: vi.fn(() => { throw new Error("write unavailable"); }), remove: vi.fn(() => { throw new Error("delete unavailable"); }) };
    const vault = createSessionVault(storage);
    expect(() => vault.save(snapshot)).toThrow("write unavailable");
    expect(vault.read()).toBeNull();
    expect(vault.revision()).toBe(1);
    expect(storage.remove).toHaveBeenCalledOnce();
  });
});
