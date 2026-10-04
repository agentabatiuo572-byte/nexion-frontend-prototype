import { expect, test } from "vitest";
import { createAuthApi } from "./auth-api";
import { createSessionVault } from "./session-vault";

test("registration response preserves the server-owned receipt", async () => {
  const api = createAuthApi({
    request: async () => ({
      accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
      user: { userId: 7101, countryCode: "+84", phone: "912345671", nickname: "New", onboardingComplete: false },
      registrationReceipt: {
        sponsorCode: "NXAB12CD34EF", sponsorDisplayName: "A•••", sourceEnvironment: "PRODUCTION",
        giftStatus: "PENDING_REVIEW", giftUsdt: 1.25, giftNex: 20,
      },
    }),
  } as never, createSessionVault());

  const result = await api.register({
    countryCode: "+84", phone: "912345671", challengeNo: "REG-0123456789abcdef0123456789abcdef",
    code: "123456", password: "NexPass9a", sponsorCode: "NXAB12CD34EF",
  });

  expect(result).toMatchObject({ kind: "authenticated", registrationReceipt: {
    sponsorCode: "NXAB12CD34EF", giftUsdt: 1.25, giftNex: 20,
  } });
});

test("registration receipt accepts legacy canonical codes without an NX prefix", async () => {
  const api = createAuthApi({
    request: async () => ({
      accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
      user: { userId: 7102, countryCode: "+84", phone: "912345672", nickname: "New", onboardingComplete: false },
      registrationReceipt: {
        sponsorCode: "AB12CD34", sponsorDisplayName: "A•••", sourceEnvironment: "PRODUCTION",
        giftStatus: "PENDING_REVIEW", giftUsdt: 1.25, giftNex: 20,
      },
    }),
  } as never, createSessionVault());

  await expect(api.register({
    countryCode: "+84", phone: "912345672", challengeNo: "REG-0123456789abcdef0123456789abcdef",
    code: "123456", password: "NexPass9a", sponsorCode: "AB12CD34",
  })).resolves.toMatchObject({ kind: "authenticated", registrationReceipt: {
    sponsorCode: "AB12CD34",
  } });
});

test.each([
  ["extra PII fields", { phone: "81987654321" }],
  ["raw sponsor display name", { sponsorDisplayName: "Alice Example" }],
])("rejects %s in a registration receipt", async (_name, override) => {
  const api = createAuthApi({
    request: async () => ({
      accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
      user: { userId: 7103, countryCode: "+84", phone: "912345673", nickname: "New", onboardingComplete: false },
      registrationReceipt: {
        sponsorCode: "NXAB12CD34", sponsorDisplayName: "A•••", sourceEnvironment: "PRODUCTION",
        giftStatus: "PENDING_REVIEW", giftUsdt: 1.25, giftNex: 20,
        ...override,
      },
    }),
  } as never, createSessionVault());

  await expect(api.register({
    countryCode: "+84", phone: "912345673", challengeNo: "REG-0123456789abcdef0123456789abcdef",
    code: "123456", password: "NexPass9a", sponsorCode: "NXAB12CD34",
  })).rejects.toThrow("AUTH_REGISTRATION_RECEIPT_INVALID");
});
