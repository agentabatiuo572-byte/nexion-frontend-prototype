import { describe, expect, it } from "vitest";
import { binarySessionReady } from "./binary-session-ready";

describe("binary cold session readiness", () => {
  it("does not start protected F3 reads while restore lacks a matching vault session, then becomes ready after restore", () => {
    expect(binarySessionReady({
      remote: true, authenticated: true, accountId: "user:42", appAccountKey: "default", sessionUserId: null,
    })).toBe(false);
    expect(binarySessionReady({
      remote: true, authenticated: true, accountId: "user:42", appAccountKey: "user:42", sessionUserId: 42,
    })).toBe(true);
  });

  it("rejects a stale vault session from another account", () => {
    expect(binarySessionReady({
      remote: true, authenticated: true, accountId: "user:42", appAccountKey: "user:42", sessionUserId: 43,
    })).toBe(false);
  });

  it("waits until the restored identity has also bound the app account scope", () => {
    expect(binarySessionReady({
      remote: true, authenticated: true, accountId: "user:42", appAccountKey: "default", sessionUserId: 42,
    })).toBe(false);
  });
});
