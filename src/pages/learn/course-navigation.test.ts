import { describe, expect, it, vi } from "vitest";
import { courseRewardHref, preserveCourseSourceInH5, resolveCourseNavigation } from "./course-navigation";

describe("course return after a cold H5 refresh", () => {
  it("keeps the NEX reward source in the deep link and returns to its list", () => {
    const url = courseRewardHref("account-security");
    expect(resolveCourseNavigation(undefined, url.split("?")[1])).toEqual({
      id: "account-security", source: "rewards-nex", back: "/pages/me/rewards-list?cat=nex",
    });
    expect(resolveCourseNavigation({ id: "account-security", source: "rewards-nex" }, "").back)
      .toBe("/pages/me/rewards-list?cat=nex");
  });

  it("restores a source dropped from the visible H5 hash before refresh", () => {
    const location = { pathname: "/app/", search: "", hash: "#/pages/learn/course?id=account-security" };
    const history = { state: { route: 1 }, replaceState: vi.fn((_state, _title, url: string) => {
      location.hash = url.slice(url.indexOf("#"));
    }) };
    vi.stubGlobal("window", { location, history });
    try {
      const nav = resolveCourseNavigation(
        { id: "account-security" },
        courseRewardHref("account-security").split("?")[1],
      );
      preserveCourseSourceInH5(nav.id, nav.source);
      expect(history.replaceState).toHaveBeenCalledOnce();
      expect(location.hash).toBe("#/pages/learn/course?id=account-security&source=rewards-nex");
      expect(resolveCourseNavigation(undefined, location.hash.split("?")[1]).back)
        .toBe("/pages/me/rewards-list?cat=nex");
      preserveCourseSourceInH5(nav.id, nav.source);
      expect(history.replaceState).toHaveBeenCalledOnce();
      location.hash = "#/pages/learn/courses";
      preserveCourseSourceInH5(nav.id, nav.source);
      expect(history.replaceState).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns ordinary and untrusted course links to the course list", () => {
    expect(resolveCourseNavigation({ id: "account-security" }, "").back).toBe("/pages/learn/courses");
    expect(resolveCourseNavigation(undefined, "?id=account-security&source=courses").back).toBe("/pages/learn/courses");
    expect(resolveCourseNavigation(undefined, "?source=%2Fpages%2Fme%2Fwallet").back).toBe("/pages/learn/courses");
  });
});
