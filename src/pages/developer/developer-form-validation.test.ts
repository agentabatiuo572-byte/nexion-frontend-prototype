import { describe, expect, it } from "vitest";
import page from "./developer.vue?raw";
import { validateDeveloperAccess, validateDeveloperKeyName, validateDeveloperWebhook } from "./developer-form-validation";

describe("developer form validation", () => {
  const access = { company: "NexGrid", email: "dev@example.com", useCase: "Order integration" };
  const hook = { name: "Orders", url: "https://hooks.example.com/orders", events: ["order.updated"] };

  it("accepts trimmed access fields at the server boundaries", () => {
    expect(validateDeveloperAccess({ ...access, company: "  Company  ", email: " DEV@example.com ", useCase: " 0123456789 " })).toBeNull();
    expect(validateDeveloperAccess({ ...access, company: "a".repeat(120), useCase: "a".repeat(2000) })).toBeNull();
  });
  it.each(["", " ", "no-at", "a@b", "a@@b.com", "a b@example.com", "dev\u00a0@example.com", "a@example.c", "a".repeat(255) + "@example.com"])("rejects invalid email %s", (email) => {
    expect(validateDeveloperAccess({ ...access, email })).toBe("emailInvalid");
  });
  it("enforces company and use-case bounds before submission", () => {
    for (const company of [" ", "a".repeat(121)]) expect(validateDeveloperAccess({ ...access, company })).toBe("companyInvalid");
    for (const useCase of [" ", "123456789", "a".repeat(2001)]) expect(validateDeveloperAccess({ ...access, useCase })).toBe("useCaseInvalid");
  });
  it("validates API key names independently of access fields", () => {
    expect(validateDeveloperKeyName(" a ")).toBeNull();
    expect(validateDeveloperKeyName("a".repeat(100))).toBeNull();
    expect(validateDeveloperKeyName(" ")).toBe("resourceNameInvalid");
    expect(validateDeveloperKeyName("a".repeat(101))).toBe("resourceNameInvalid");
  });
  it("accepts a syntactically valid public HTTPS endpoint without guessing the server allowlist", () => {
    expect(validateDeveloperWebhook(hook)).toBeNull();
    expect(validateDeveloperWebhook({ ...hook, url: " HTTPS://hooks.example.com:8443/path " })).toBeNull();
  });
  it.each(["", "hooks.example.com", "http://hooks.example.com", "javascript:alert(1)", "https://", "https://x y.com", "https://user:pass@hooks.example.com", "https://@hooks.example.com", "https://hooks.example.com/?token=abc", "https://hooks.example.com/?", "https://hooks.example.com/#", "https://hooks.example.com/has space", "https://hooks.example.com\\path"])("rejects malformed or unsupported webhook URL %s", (url) => {
    expect(validateDeveloperWebhook({ ...hook, url })).toBe("webhookUrlInvalid");
  });
  it.each(["localhost", "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "[::1]", "metadata.google.internal"])("rejects server-disallowed literal host %s", (host) => {
    expect(validateDeveloperWebhook({ ...hook, url: `https://${host}/hook` })).toBe("webhookHostInvalid");
  });
  it.each(["https://hooks.example.com/%zz", "https://%65xample.com", "https://例子.com"])("rejects URI syntax that the Java endpoint rejects: %s", (url) => {
    expect(validateDeveloperWebhook({ ...hook, url })).toBe("webhookUrlInvalid");
  });
  it("rejects out-of-range network ports even though Java URI parsing is more permissive", () => {
    expect(validateDeveloperWebhook({ ...hook, url: "https://hooks.example.com:0/hook" })).toBe("webhookUrlInvalid");
    expect(validateDeveloperWebhook({ ...hook, url: "https://hooks.example.com:99999" })).toBe("webhookUrlInvalid");
  });
  it("validates event allowlist and count plus resource name", () => {
    expect(validateDeveloperWebhook({ ...hook, name: " " })).toBe("resourceNameInvalid");
    for (const events of [[], ["unknown"], ["ORDER.UPDATED"], Array(9).fill("order.updated")]) {
      expect(validateDeveloperWebhook({ ...hook, events })).toBe("webhookEventsInvalid");
    }
    expect(validateDeveloperWebhook({ ...hook, events: ["order.completed", "compute.job.completed", "compute.job.failed", "earnings.updated", "billing.invoice.created", "market.updated", "account.updated"] })).toBeNull();
  });
  it("connects validation before request IDs or network writes in the page", () => {
    const accessHandler = page.slice(page.indexOf("async function submitRequest()"), page.indexOf("function loadLatestRequest()"));
    const hookHandler = page.slice(page.indexOf("async function createWebhook()"), page.indexOf("async function deleteWebhook("));
    for (const [handler, validator, write, key] of [
      [accessHandler, "validateDeveloperAccess", "developerAccessApi.submit", "newRequestKey()"],
      [hookHandler, "validateDeveloperWebhook", "developerResourcesApi.createWebhook", "resourceKey(intent)"],
    ]) {
      expect(handler.indexOf(validator)).toBeGreaterThan(-1);
      expect(handler.indexOf(validator)).toBeLessThan(handler.indexOf(write));
      expect(handler.indexOf(validator)).toBeLessThan(handler.indexOf(key));
      expect(handler).toMatch(/if \(issue\) return toast.warn/);
    }
  });
});
