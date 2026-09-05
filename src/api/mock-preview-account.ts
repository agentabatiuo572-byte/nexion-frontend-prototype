import { provisionMockAuthCredential } from "./mock-auth-api";
import {
  provisionMockPreviewAuthAccount,
} from "@/store/auth-account";

/** Public, local-only credential for the fixed 5174 high-fidelity preview. */
export const MOCK_PREVIEW_ACCOUNT = Object.freeze({
  countryCode: "+84",
  phone: "901234567",
  password: "Nexion@5174",
});

export type MockPreviewAccountProvision =
  | { ok: true; accountId: string }
  | { ok: false; error: "account_directory_unavailable" | "credential_storage_unavailable" };

/**
 * Rebuilds the same active, onboarded mock account after storage is cleared or
 * the preview account is deleted. It never calls Java or an external provider.
 */
export function provisionMockPreviewAccount(): MockPreviewAccountProvision {
  const phoneE164 = `${MOCK_PREVIEW_ACCOUNT.countryCode}${MOCK_PREVIEW_ACCOUNT.phone}`;
  const provisioned = provisionMockPreviewAuthAccount(phoneE164, {
    sponsorCode: null,
    giftRoute: "no_issue",
    giftUsdt: 0,
    giftNex: 0,
    giftRef: "MOCK-PREVIEW-ACCOUNT",
  });
  if (!provisioned.ok) return { ok: false, error: "account_directory_unavailable" };
  const accountId = provisioned.account.accountId;
  if (!provisionMockAuthCredential(
    MOCK_PREVIEW_ACCOUNT.countryCode,
    MOCK_PREVIEW_ACCOUNT.phone,
    MOCK_PREVIEW_ACCOUNT.password,
  )) {
    return { ok: false, error: "credential_storage_unavailable" };
  }
  return { ok: true, accountId };
}
