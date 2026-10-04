import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./locked-product-card.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["./locked-product-card.vue"] ?? "") as string;

describe("locked product notification account-scope contract", () => {
  it("captures and validates account scope for status and both mutations", () => {
    expect(source).toContain("captureAccountScope");
    expect(source).toContain("isCurrentAccountScope");
    expect(source).toContain("productNotificationApi.status");
    expect(source).toContain("productNotificationApi.subscribe");
    expect(source).toContain("productNotificationApi.unsubscribe");
    expect(source).toContain("const epoch = ++notificationEpoch;");
    expect(source.match(/requestIsCurrent\(scope, epoch, accountKey, runScope\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("guards canonical state and toast writes after each awaited mutation", () => {
    const mutation = source.slice(source.indexOf("async function handleNotify"));
    expect(mutation).toContain("if (!requestIsCurrent(scope, epoch, accountKey, runScope)) return;");
    expect(mutation).toContain("requestIsCurrent(scope, epoch, accountKey, runScope)");
    expect(mutation.indexOf("result.serverCanonical")).toBeGreaterThan(
      mutation.indexOf("if (!requestIsCurrent(scope, epoch, accountKey)) return;"),
    );
    expect(mutation.indexOf("toast.success")).toBeGreaterThan(
      mutation.indexOf("if (!requestIsCurrent(scope, epoch, accountKey)) return;"),
    );
  });

  it("resets and reloads when the active account changes", () => {
    expect(source).toContain("serverSubscribed.value = false;");
    expect(source).toContain("watch(() => String(app.accountKey)");
    expect(source).toContain("void reloadNotificationState();");
  });

  it("captures the commerce run scope and fences late status/mutation writes", () => {
    expect(source).toContain("captureRuntimeRevision");
    expect(source).toContain("isCurrentRuntimeRevision");
    expect(source.match(/runScope/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
