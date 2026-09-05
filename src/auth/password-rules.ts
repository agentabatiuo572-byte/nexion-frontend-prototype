// Password validation per PRD §4.6.1.
// Client check is advisory only — server is authoritative for strength,
// blacklist match, history reuse, and lockout. See PRD §4.6.3 / §4.6.5.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

export type PasswordRejectReason =
  | "too_short"
  | "too_long"
  | "no_mix"
  | "too_repetitive"
  | "blacklisted"
  | "matches_phone";

export interface PasswordValidation {
  ok: boolean;
  reason: PasswordRejectReason | null;
}

export type PasswordStrength = "weak" | "fair" | "strong";

// Mini blacklist for client-side UX hint. PRD §4.6.1 requires server to
// check against full OWASP Top 10000 — this list is just the obvious cases
// so the user gets immediate feedback before submit.
const WEAK_DICTIONARY: ReadonlySet<string> = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "passw0rd",
  "qwerty123",
  "qwertyuiop",
  "iloveyou",
  "admin123",
  "welcome1",
  "letmein1",
  "11111111",
  "abcdefgh",
  "12341234",
  "asdfghjk",
]);

export function validatePassword(
  password: string,
  context: { phone?: string } = {},
): PasswordValidation {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: "too_short" };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }

  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  if (!hasLetter || !hasNumber) {
    return { ok: false, reason: "no_mix" };
  }

  if (/(.)\1{5,}/.test(password)) {
    return { ok: false, reason: "too_repetitive" };
  }

  if (WEAK_DICTIONARY.has(password.toLowerCase())) {
    return { ok: false, reason: "blacklisted" };
  }

  const phone = context.phone?.replace(/\s+/g, "");
  if (phone && phone.length >= 6 && password.includes(phone)) {
    return { ok: false, reason: "matches_phone" };
  }

  return { ok: true, reason: null };
}

export function isPasswordOk(
  password: string,
  context: { phone?: string } = {},
): boolean {
  return validatePassword(password, context).ok;
}

// Password recovery is a higher-risk unauthenticated mutation. Keep its
// client-side gate aligned with the server reset policy; the server remains
// authoritative and also rejects the current password and blocked accounts.
export function isResetPasswordOk(
  password: string,
  context: { phone?: string } = {},
): boolean {
  if (password.length < 12 || password.length > PASSWORD_MAX_LENGTH) return false;
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)
      || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return false;
  if (WEAK_DICTIONARY.has(password.toLowerCase())) return false;
  const phone = context.phone?.replace(/\s+/g, "");
  return !(phone && phone.length >= 6 && password.includes(phone));
}

// Strength scoring for the UI hint bar — purely advisory, never gates submit.
// The validatePassword() result determines whether submission is allowed.
export function passwordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return "weak";
  if (score <= 3) return "fair";
  return "strong";
}
