import { describe, expect, it } from "vitest";
import depositsSource from "./deposits.ts?raw";

describe("VietQR create replay recovery contract", () => {
  it("retires one resolved non-payable replay and issues at most one fresh create command", () => {
    expect(depositsSource).toMatch(
      /const expectedAccountKey = serverAccountKey;\s+const expectedGeneration = remoteGeneration;/,
    );
    expect(depositsSource).toMatch(/for \(let createAttempt = 0; createAttempt < 2; createAttempt \+= 1\)/);
    expect(depositsSource).toMatch(
      /for \(let createAttempt[\s\S]*if \(!remoteGenerationMatches\(\s*expectedAccountKey,\s*expectedGeneration,\s*serverAccountKey,\s*remoteGeneration,?\s*\)\)\s*\{\s*throw new Error\("VIETQR_ACCOUNT_CHANGED"\);\s*\}\s*const idempotencyKey/,
    );
    expect(depositsSource).toMatch(
      /snapshot = await paymentApi\.createVietQrIntent\(amount, idempotencyKey\);\s*if \(!remoteGenerationMatches\(\s*expectedAccountKey,\s*expectedGeneration,\s*serverAccountKey,\s*remoteGeneration,?\s*\)\)\s*\{\s*throw new Error\("VIETQR_ACCOUNT_CHANGED"\);\s*\}/,
    );
    expect(depositsSource).toMatch(/bindVietQrIntent\(mutation, idempotencyKey, snapshot\.intentNo\)/);
    expect(depositsSource).toMatch(
      /if \(!isPayableVietQrCreateStatus\(snapshot\.status\)\)[\s\S]*finishVietQrCommand\(mutation, idempotencyKey\)[\s\S]*if \(createAttempt === 0\) continue/,
    );
    expect(depositsSource).toContain('throw new Error("VIETQR_CREATE_RETRY_EXHAUSTED")');
  });
});
