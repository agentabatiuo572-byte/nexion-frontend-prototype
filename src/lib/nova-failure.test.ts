import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { novaFailure } from "./nova-failure";

describe("Nova actionable errors", () => {
  it.each([
    ["NOVA_AI_BUSY", 429, "busy"],
    ["NOVA_AI_CONVERSATION_BUSY", 429, "busy"],
    ["NOVA_AI_TURN_IN_PROGRESS", 429, "busy"],
    ["NOVA_AI_TIMEOUT", 504, "timeout"],
    ["request:fail timeout", undefined, "timeout"],
    ["NOVA_AI_UNAVAILABLE", 503, "unavailable"],
    ["NOVA_AI_DISABLED", 503, "unavailable"],
    ["NOVA_AI_TURN_CONFLICT", 409, "failed"],
  ])("maps %s without exposing its internal code", (message, status, expected) => {
    expect(novaFailure(new ApiError({ kind: "http", message, status }))).toBe(expected);
  });
  it("distinguishes authentication and network errors", () => {
    expect(novaFailure(new ApiError({ kind: "auth", message: "login" }))).toBe("auth");
    expect(novaFailure(new Error("offline"))).toBe("network");
  });
});
