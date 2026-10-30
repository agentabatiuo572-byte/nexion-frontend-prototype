import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./messages.vue", { query: "?raw", import: "default", eager: true })["./messages.vue"] ?? "") as string;

describe("conversation-center refresh failure contract", () => {
  it("shows a retryable failure before the true empty state", () => {
    expect(source).toContain("convStore.error");
    expect(source).toContain("retryConversations");
    expect(source).toContain("t.conversations.loadError");
    expect(source).toContain("t.conversations.retry");
    expect(source.indexOf("convStore.error")).toBeLessThan(source.indexOf("rows.length === 0"));
  });

  it("keeps rows visible when a later refresh fails", () => {
    expect(source).toContain("convStore.error || convStore.categoryAvailabilityStatus === 'failed'");
    expect(source).toMatch(/v-else-if="rows\.length === 0"/);
  });

  it("never lists the retired AI category or reads its history", () => {
    // Past the header comment, which records why the category is absent.
    expect(source.slice(source.indexOf("-->"))).not.toMatch(/nova|"ai"|'ai'/i);
  });

  it("uses the backend M5 availability read model before exposing category entry points", () => {
    expect(source).toContain("convStore.refreshCategories()");
    expect(source).toContain('convStore.categoryReadable("advisor") || convStore.categoryReadable("support")');
    expect(source).toContain("convStore.categoryEnabled(target)");
  });

  it("keeps only confirmed conversation snapshots readable when category authority is unavailable", () => {
    expect(source).toContain("convStore.categoryAvailabilityStatus === 'failed'");
    expect(source).toContain('convStore.categoryReadable("advisor") || convStore.categoryReadable("support")');
    expect(source).toContain('convStore.categoryEnabled("advisor")');
  });

  it("does not present a disabled PC category as an empty inbox with a start CTA", () => {
    expect(source).toContain("convStore.categoryAvailabilityStatus === 'ready' && TYPES.length === 0");
    expect(source).toContain(':title="t.conversations.categoryDisabled"');
  });

  it("shows an initial unknown category read as loading, without an empty-state CTA", () => {
    expect(source).toContain("convStore.categoryAvailabilityStatus === 'loading'");
    expect(source).toContain("t.help.loadingMore");
    expect(source.indexOf("convStore.categoryAvailabilityStatus === 'loading'")).toBeLessThan(source.indexOf('v-if="canStartConversation"'));
  });

  it("shows a retryable polling notice when the human realtime channel fails", () => {
    expect(source).toContain('remoteApiEnabled && convStore.realtimeFallback');
    expect(source).toContain("t.conversations.realtimeFallback");
    expect(source).toContain('role="status" aria-live="polite"');
  });

  it("gives every category read failure the same retry state", () => {
    expect(source).toContain("convStore.error || convStore.categoryAvailabilityStatus === 'failed'");
    expect(source).toContain('@click="retryConversations"');
    expect(source).toContain('class="family-control family-control--text" role="button" :tabindex="retrying ? -1 : 0" :aria-disabled="retrying" :aria-label="t.conversations.retry"');
  });
});
