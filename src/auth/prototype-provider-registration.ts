import { ApiError } from "@/api/errors";
import { readPrototypeUsers, writePrototypeUsers, originalAccountId, type PrototypeUserRecord } from "./prototype-identity";
import type { PrototypeProvider, PrototypeProviderSubject } from "@/api/prototype-account-api";
import { useConfig } from "@/store/config";
import { useApp } from "@/store/app";
import { useBills } from "@/store/bills";
import { normalizeRefCode, useSponsorship } from "@/store/sponsorship";
import { evaluateRegistration, commitRegistration } from "@/store/risk-cluster";
import { rebindAccountScopedStores } from "@/lib/account-scope";
import { visibleReferralGift } from "@/lib/referral-reward-gate";
import { useT } from "@/i18n/use-t";
import { preparePrototypeAuthDirectory } from "@/store/auth-account";

function unavailable(): never { throw new ApiError({ kind: "business", message: "PROTOTYPE_REGISTRATION_RETRY" }); }

/** Local counterpart of source provider completion. The same provider/subject
 * owns one durable reservation; retries replay the existing phone-registration
 * gift operations with its frozen amounts/ref, then activate it last. */
export function registerPrototypeProvider(provider: PrototypeProvider, subject: PrototypeProviderSubject, rawSponsor: string | null): [string, PrototypeUserRecord] {
  const accountId = `provider:${provider.toLowerCase()}:${subject}`;
  let registry = readPrototypeUsers();
  let record = registry.users[accountId];
  if (!record) {
    if (!preparePrototypeAuthDirectory()) unavailable();
    const sponsorCode = normalizeRefCode(rawSponsor);
    if (rawSponsor?.trim() && !sponsorCode) unavailable();
    const assessment = evaluateRegistration(accountId, { sponsorId: sponsorCode });
    if (assessment.gateRoute === "manual_or_reject") throw new ApiError({ kind: "business", message: "PROTOTYPE_REGISTRATION_BLOCKED" });
    const gift = visibleReferralGift(useConfig().config.rewards);
    let userId = 5381;
    for (const char of accountId) userId = ((userId * 33) ^ char.charCodeAt(0)) >>> 0;
    record = { userId: userId % 2_000_000_000 + 1_000_000, password: null,
      nickname: `${provider === "GOOGLE" ? "Google" : provider === "APPLE" ? "Apple" : "Telegram"} ${subject === "demo-primary" ? "1" : "2"}`,
      accountId, countryCode: "", phone: "", providerIdentities: [{ provider, subject }],
      registration: { status: "pending", createdAt: Date.now(), onboardingComplete: false, receiptPending: true,
        context: { sponsorCode, giftRoute: assessment.giftRoute,
          giftUsdt: sponsorCode ? gift.usdtAmount : 0, giftNex: sponsorCode ? gift.nexAmount : 0, giftRef: `GIFT-${accountId}` } } };
    registry.users[accountId] = record;
    writePrototypeUsers(registry);
  }
  if (!record.registration || originalAccountId(accountId, record) !== accountId) unavailable();
  if (record.registration.status === "active") return [accountId, record];
  const registration = record.registration.context;
  const app = useApp(), previous = app.accountKey;
  try {
    return app.withStrictPrototypeSnapshot(() => {
      try {
        app.bindAccount(accountId);
        rebindAccountScopedStores(accountId);
        if (!commitRegistration(accountId, { sponsorId: registration.sponsorCode })) unavailable();
        if (registration.sponsorCode) {
          const sponsorship = useSponsorship();
          if (!sponsorship.bind(registration.sponsorCode)) unavailable();
          const gift = sponsorship.ensureGiftClaim(accountId, { usdt: registration.giftUsdt, nex: registration.giftNex });
          if (!gift) unavailable();
          const bills = useBills(), posted = registration.giftRoute === "withdrawable";
          const memo = posted ? useT().value.register.giftBillMemo : useT().value.register.giftPendingBillMemo;
          bills.withStrictPrototypeSnapshot(accountId, () => app.withStrictPrototypeSnapshot(() => {
            if (!app.creditRewardBucketOnce(registration.giftRef, registration.giftRoute, gift.usdt, gift.nex)) unavailable();
            if (!bills.addOnce({ type: "bonus", symbol: "USDT", amount: gift.usdt, status: posted ? "posted" : "pending", memo, ref: registration.giftRef })
              || !bills.addOnce({ type: "bonus", symbol: "NEX", amount: gift.nex, status: posted ? "posted" : "pending", memo, ref: registration.giftRef })) unavailable();
          }));
        }
        registry = readPrototypeUsers();
        record = registry.users[accountId];
        if (!record?.registration) unavailable();
        record.registration.status = "active";
        record.registration.receiptPending = true;
        writePrototypeUsers(registry);
        return [accountId, record] as [string, PrototypeUserRecord];
      } finally {
        app.bindAccount(previous);
        rebindAccountScopedStores(previous);
      }
    }, { allowAccountSwitch: true });
  } catch {
    unavailable();
  }
}
