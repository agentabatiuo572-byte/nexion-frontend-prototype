export type DeveloperFormIssue = "companyInvalid" | "emailInvalid" | "useCaseInvalid"
  | "resourceNameInvalid" | "webhookUrlInvalid" | "webhookHostInvalid" | "webhookEventsInvalid";

// Server length limits, with UI email whitespace checks. Java's default \s is
// ASCII-only; the App also rejects Unicode whitespace in user-entered emails.
// This is input assistance, not a replacement for server validation.
export function validateDeveloperAccess(input: { company: string; email: string; useCase: string }): DeveloperFormIssue | null {
  const company = input.company.trim();
  const email = input.email.trim();
  const useCase = input.useCase.trim();
  if (!company || company.length > 120) return "companyInvalid";
  if (email.length > 254 || !/^[^\s@]{1,128}@[^\s@]{1,190}\.[^\s@]{2,63}$/.test(email)) return "emailInvalid";
  if (useCase.length < 10 || useCase.length > 2000) return "useCaseInvalid";
  return null;
}

export function validateDeveloperKeyName(value: string): DeveloperFormIssue | null {
  const name = value.trim();
  return !name || name.length > 100 ? "resourceNameInvalid" : null;
}

const WEBHOOK_EVENTS = new Set([
  "order.updated", "order.completed", "compute.job.completed", "compute.job.failed",
  "earnings.updated", "billing.invoice.created", "market.updated", "account.updated",
]);

export function validateDeveloperWebhook(input: { name: string; url: string; events: string[] }): DeveloperFormIssue | null {
  const nameIssue = validateDeveloperKeyName(input.name);
  if (nameIssue) return nameIssue;
  const raw = input.url.trim();
  // URL() normalizes malformed paths and empty ?/# suffixes; reject these before parsing.
  const authority = /^https:\/\/([^/?#\\\s]+)(?:\/[^\s?#\\]*)?$/i.exec(raw)?.[1];
  if (!authority || /[@%\u0080-\uffff]/.test(authority) || /%(?![\da-f]{2})/i.test(raw)) return "webhookUrlInvalid";
  try {
    const parsed = new URL(raw);
    if (!parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash
      || (parsed.port !== "" && Number(parsed.port) < 1)) return "webhookUrlInvalid";
    const host = parsed.hostname.toLowerCase();
    // Do not resolve DNS or copy the deployment allowlist into the App.
    if (["localhost", "127.0.0.1", "::1", "[::1]", "metadata", "metadata.google.internal", "instance-data", "0.0.0.0"].includes(host)
      || /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return "webhookHostInvalid";
  } catch {
    return "webhookUrlInvalid";
  }
  if (!input.events.length || input.events.length > WEBHOOK_EVENTS.size || input.events.some((event) => !WEBHOOK_EVENTS.has(event))) return "webhookEventsInvalid";
  return null;
}
