export interface ApiResult<T> {
  code: number;
  message: string;
  data: T;
}

export interface UserSession {
  userId: number;
  countryCode: string;
  phone: string;
  nickname: string;
}

export interface RegistrationReceipt {
  sponsorCode: string;
  sponsorDisplayName: string;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  giftStatus: "PENDING_REVIEW" | "POSTED" | "UNAVAILABLE";
  giftUsdt: number | null;
  giftNex: number | null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function maskedSponsorDisplayName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const codePoints = Array.from(value);
  return codePoints.length === 4
    && !/\s/u.test(codePoints[0] ?? "")
    && codePoints.slice(1).every((codePoint) => codePoint === "•");
}

export function isRegistrationReceipt(value: unknown): value is RegistrationReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<RegistrationReceipt> & Record<string, unknown>;
  const amount = (candidate: unknown) => candidate === null
    || (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0);
  return exactKeys(receipt, ["sponsorCode", "sponsorDisplayName", "sourceEnvironment", "giftStatus", "giftUsdt", "giftNex"])
    && typeof receipt.sponsorCode === "string" && /^[A-Z0-9]{4,32}$/.test(receipt.sponsorCode)
    && maskedSponsorDisplayName(receipt.sponsorDisplayName)
    && (receipt.sourceEnvironment === "PRODUCTION" || receipt.sourceEnvironment === "SANDBOX")
    && (receipt.giftStatus === "PENDING_REVIEW" || receipt.giftStatus === "POSTED" || receipt.giftStatus === "UNAVAILABLE")
    && amount(receipt.giftUsdt) && amount(receipt.giftNex)
    && (receipt.giftStatus === "UNAVAILABLE" || (typeof receipt.giftUsdt === "number" && typeof receipt.giftNex === "number"));
}

export function isUserSession(value: unknown): value is UserSession {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<UserSession>;
  return (
    typeof user.userId === "number"
    && Number.isSafeInteger(user.userId)
    && user.userId > 0
    && typeof user.countryCode === "string"
    && user.countryCode.length > 0
    && typeof user.phone === "string"
    && user.phone.length > 0
    && typeof user.nickname === "string"
  );
}

export interface AuthSessionResponse {
  accessToken: string | null;
  tokenType: string;
  user: UserSession;
  challengeNo?: string | null;
  deliveryHint?: string | null;
  refreshToken: string | null;
  registrationReceipt?: RegistrationReceipt | null;
}

export interface SecuritySession {
  id: string;
  deviceName: string;
  ipMasked: string;
  lastActiveAt: string;
  current: boolean;
}

export interface SecurityState {
  twoFactorEnabled: boolean;
  passwordChangedAt: string | null;
  sessions: SecuritySession[];
}

export interface SecurityMutation {
  twoFactorEnabled?: boolean | null;
  passwordChangedAt?: string | null;
  revokedSessionCount?: number | null;
}
