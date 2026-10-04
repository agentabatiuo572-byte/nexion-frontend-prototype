import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useStickyCTA, type StickyCTAPayload } from "./sticky-cta-bar";

function payload(label: string): StickyCTAPayload {
  return {
    href: `/pages/store/${label}`,
    amount: "$1",
    buttonLabel: label,
  };
}

describe("sticky CTA page ownership", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("does not let a stale detail page hide the replacement page CTA", () => {
    const sticky = useStickyCTA();
    const stalePage = Symbol("stale-detail");
    const currentPage = Symbol("current-detail");

    sticky.show(payload("old"), stalePage);
    sticky.activate(currentPage);
    sticky.show(payload("new"), currentPage);
    sticky.hide(stalePage);

    expect(sticky.cta?.buttonLabel).toBe("new");
  });

  it("does not let a stale detail page publish after a replacement page activates", () => {
    const sticky = useStickyCTA();
    const stalePage = Symbol("stale-detail");
    const currentPage = Symbol("current-detail");

    sticky.activate(stalePage);
    sticky.show(payload("old"), stalePage);
    sticky.activate(currentPage);
    sticky.show(payload("new"), currentPage);
    sticky.show(payload("late-old"), stalePage);

    expect(sticky.cta?.buttonLabel).toBe("new");
  });

  it("keeps stale publishers fenced after the current CTA is hidden", () => {
    const sticky = useStickyCTA();
    const stalePage = Symbol("stale-detail");
    const currentPage = Symbol("current-detail");

    sticky.activate(currentPage);
    sticky.show(payload("current"), currentPage);
    sticky.hide(currentPage);
    sticky.show(payload("late-old"), stalePage);

    expect(sticky.cta).toBeNull();
  });

  it("lets the current page clear its own CTA", () => {
    const sticky = useStickyCTA();
    const currentPage = Symbol("current-detail");

    sticky.show(payload("current"), currentPage);
    sticky.hide(currentPage);

    expect(sticky.cta).toBeNull();
  });

  it("preserves unscoped hide as an explicit global reset", () => {
    const sticky = useStickyCTA();
    sticky.show(payload("current"), Symbol("current-detail"));

    sticky.hide();

    expect(sticky.cta).toBeNull();
  });
});
