import { describe, expect, it } from "vitest";
import {
  isLoopbackPreviewClient,
  mustBlockDevelopmentOAuthProxy,
} from "./dev-preview-auth-boundary";

describe("development OAuth preview boundary", () => {
  it("recognizes only direct loopback clients", () => {
    expect(isLoopbackPreviewClient("127.0.0.1")).toBe(true);
    expect(isLoopbackPreviewClient("::1")).toBe(true);
    expect(isLoopbackPreviewClient("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackPreviewClient("192.168.8.25")).toBe(false);
    expect(isLoopbackPreviewClient(undefined)).toBe(false);
  });

  it("blocks development OAuth challenge and exchange through a LAN preview", () => {
    expect(mustBlockDevelopmentOAuthProxy(
      "/auth/users/oauth/development/passkey/challenge",
      "192.168.8.25",
    )).toBe(true);
    expect(mustBlockDevelopmentOAuthProxy(
      "/auth/users/oauth/exchange?source=h5",
      "192.168.8.25",
    )).toBe(true);
    expect(mustBlockDevelopmentOAuthProxy(
      "/auth/users/oauth/development;jsessionid=attacker/passkey/challenge",
      "192.168.8.25",
    )).toBe(true);
    expect(mustBlockDevelopmentOAuthProxy(
      "/auth/users/oauth%2Fdevelopment%2Fpasskey%2Fchallenge",
      "192.168.8.25",
    )).toBe(true);
    expect(mustBlockDevelopmentOAuthProxy(
      "/auth/users/oauth/development/passkey/challenge",
      "127.0.0.1",
    )).toBe(false);
    expect(mustBlockDevelopmentOAuthProxy(
      "/auth/users/login",
      "192.168.8.25",
    )).toBe(false);
  });
});
