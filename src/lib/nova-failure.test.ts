import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { novaFailure } from "./nova-failure";

describe("Nova actionable errors", () => {
  it('recognizes only the verified pre-acceptance HTTP input rejection', () => {
    expect(novaFailure(new ApiError({ kind: 'http', status: 400, code: 400, message: 'NOVA_AI_INPUT_INVALID' })))
      .toBe('input-rejected');
  });

  it.each([
    { kind: 'http', status: 400, code: 400, message: 'OTHER_INPUT_INVALID' },
    { kind: 'http', status: 400, message: 'NOVA_AI_INPUT_INVALID' },
    { kind: 'http', status: 400, code: 409, message: 'NOVA_AI_INPUT_INVALID' },
    { kind: 'http', status: 500, code: 400, message: 'NOVA_AI_INPUT_INVALID' },
    { kind: 'business', status: 200, code: 400, message: 'NOVA_AI_INPUT_INVALID' },
    { kind: 'protocol', status: 400, code: 400, message: 'NOVA_AI_INPUT_INVALID' },
    { kind: 'network', status: 400, code: 400, message: 'NOVA_AI_INPUT_INVALID' },
  ] as const)('does not authorize editing from an unverified error %#', options => {
    expect(novaFailure(new ApiError(options))).not.toBe('input-rejected');
  });

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
