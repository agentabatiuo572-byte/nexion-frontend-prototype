import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import page from "./trust.vue?raw";

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const start = page.indexOf("let trustPageVisible = false;");
const end = page.indexOf("const heroStyle", start);
if (start < 0 || end < start) throw new Error("Trust Center visible lifecycle source is required");
const lifecycle = ts.transpileModule(
  `${page.slice(start, end)}; return { loadTrustSections };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function setup() {
  const shown: Array<() => void> = [];
  const hidden: Array<() => void> = [];
  const unmounted: Array<() => void> = [];
  const revisions: Array<() => void> = [];
  const refresh = vi.fn<() => Promise<boolean>>();
  const views = vi.fn();
  const value = new Function(
    "remoteApiEnabled", "refresh", "sections", "language", "recordPublishedTrustViews", "onShow", "onHide", "onUnmounted", "subscribeRuntimeRevision",
    lifecycle,
  )(true, refresh, { value: [{ sectionKey: "financials" }] }, { value: "en" }, views,
    (callback: () => void) => shown.push(callback),
    (callback: () => void) => hidden.push(callback),
    (callback: () => void) => unmounted.push(callback),
    (callback: () => void) => { revisions.push(callback); return () => { const index = revisions.indexOf(callback); if (index >= 0) revisions.splice(index, 1); }; },
  ) as { loadTrustSections: () => Promise<boolean> };
  return { shown, hidden, unmounted, revisions, refresh, views, load: value.loadTrustSections };
}

describe("Trust Center visible runtime revision recovery", () => {
  it("does not read while hidden, reads on the next show, and removes its listener", async () => {
    const view = setup();
    view.refresh.mockResolvedValue(true);
    view.shown[0]();
    await vi.waitFor(() => expect(view.refresh).toHaveBeenCalledTimes(1));

    view.hidden[0]();
    view.revisions.forEach((listener) => listener());
    await Promise.resolve();
    expect(view.refresh).toHaveBeenCalledTimes(1);

    view.shown[0]();
    await vi.waitFor(() => expect(view.refresh).toHaveBeenCalledTimes(2));
    view.unmounted[0]();
    expect(view.revisions).toHaveLength(0);
  });

  it("keeps only the latest visible completion after in-flight and consecutive revisions", async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const third = deferred<boolean>();
    const view = setup();
    view.refresh.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
    view.shown[0]();
    view.revisions.forEach((listener) => listener());
    view.revisions.forEach((listener) => listener());
    expect(view.refresh).toHaveBeenCalledTimes(3);

    first.resolve(false);
    second.resolve(false);
    third.resolve(true);
    await vi.waitFor(() => expect(view.views).toHaveBeenCalledWith(["financials"], "en"));
    expect(view.views).toHaveBeenCalledTimes(1);
  });

  it("does not record a late hidden response and retains the existing retry", async () => {
    const oldRead = deferred<boolean>();
    const currentRead = deferred<boolean>();
    const view = setup();
    view.refresh.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(currentRead.promise).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    view.shown[0]();
    view.hidden[0]();
    oldRead.resolve(true);
    await Promise.resolve();
    expect(view.views).not.toHaveBeenCalled();

    view.shown[0]();
    currentRead.resolve(true);
    await vi.waitFor(() => expect(view.views).toHaveBeenCalledTimes(1));
    await view.load();
    await view.load();
    expect(view.views).toHaveBeenCalledTimes(2);
  });
});
