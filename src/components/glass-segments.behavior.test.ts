import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import source from "./glass-segments.vue?raw";
import chassisSource from "./app-chassis.vue?raw";

const logic = ts.transpileModule(source.slice(source.indexOf("function choose("), source.indexOf("</script>")), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function mount(layout = "equal", variant = "filter") {
  const options = [{ value: "a" }, { value: "b", disabled: true }, { value: "c" }];
  const emit = vi.fn(), focus = options.map(() => vi.fn()), lookup = vi.fn(() => ({
    querySelectorAll: () => focus.map(fn => ({ focus: fn })),
  }));
  const props = { options, layout, variant };
  const control = new Function("props", "emit", "nextTick", "document", "hostId", logic + "\nreturn {onKeydown, onClick};")(
    props, emit, (fn: () => void) => Promise.resolve().then(fn), { getElementById: lookup }, "host",
  );
  const key = async (value: string, index = 0, extra = {}) => {
    // Uni's currentTarget contains metadata, not DOM parentElement.
    const event = { key: value, currentTarget: { dataset: {} }, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra };
    control.onKeydown(event, options[index]);
    await Promise.resolve();
    return event;
  };
  return { control, options, emit, focus, lookup, key };
}

describe("glass selection keyboard behavior", () => {
  it("binds group and member semantics and selection to the caller's model", () => {
    expect(source).toContain(`:role="variant === 'navigation' ? 'navigation' : semantics === 'radio' ? 'radiogroup' : 'tablist'"`);
    expect(source).toContain(`:role="variant === 'navigation' ? 'link' : semantics === 'radio' ? 'radio' : 'tab'"`);
    expect(source).toContain(`:aria-selected="variant !== 'navigation' && semantics === 'tab' ? option.value === modelValue : undefined"`);
    expect(source).toContain(`:aria-checked="variant !== 'navigation' && semantics === 'radio' ? option.value === modelValue : undefined"`);
    expect(source).toContain(`:aria-current="variant === 'navigation' && option.value === modelValue ? 'page' : undefined"`);
  });
  it("skips disabled options and focuses the selected DOM option through the stable host", async () => {
    const s = mount(); const event = await s.key("ArrowRight");
    expect(s.emit).toHaveBeenCalledWith("select", "c", "arrow");
    expect(s.lookup).toHaveBeenCalledWith("host");
    expect(s.focus[2]).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
  it("wraps, supports Home/End, and uses up/down for vertical groups", async () => {
    const s = mount("vertical");
    await s.key("ArrowUp"); expect(s.emit).toHaveBeenLastCalledWith("select", "c", "arrow");
    await s.key("Home", 2); expect(s.emit).toHaveBeenLastCalledWith("select", "a", "arrow");
    await s.key("End"); expect(s.emit).toHaveBeenLastCalledWith("select", "c", "arrow");
  });
  it("activates once on Enter/Space and ignores repeats, modifiers, and disabled items", async () => {
    const s = mount(); await s.key("Enter"); await s.key(" ");
    expect(s.emit.mock.calls.filter(([name]) => name === "select")).toHaveLength(2);
    s.emit.mockClear(); await s.key("Enter", 0, { repeat: true }); await s.key("ArrowRight", 0, { ctrlKey: true }); await s.key("Enter", 1);
    expect(s.emit).not.toHaveBeenCalled();
  });
  it("moves navigation focus without navigating until Enter and leaves Space available to scroll", async () => {
    const s = mount("equal", "navigation"); await s.key("ArrowRight");
    expect(s.focus[2]).toHaveBeenCalledOnce(); expect(s.emit).not.toHaveBeenCalled();
    const event = await s.key(" "); expect(event.preventDefault).not.toHaveBeenCalled();
    await s.key("Enter", 2); expect(s.emit).toHaveBeenCalledWith("select", "c", "activation");
  });
  it("preserves the App render-layer arrow reason and defers serialised key events to that layer", () => {
    const s = mount(); s.control.onClick(s.options[2], { currentTarget: { dataset: { glassKeyboard: "arrow" } } });
    expect(s.emit).toHaveBeenCalledWith("select", "c", "arrow");
    s.emit.mockClear(); expect(() => s.control.onKeydown({ key: "Enter" }, s.options[0])).not.toThrow();
    expect(s.emit).not.toHaveBeenCalled();
  });
  it("carries native drag intent, ignores rapid reentry, and restores selection after navigation failure", async () => {
    const s = mount("equal", "navigation");
    s.control.onClick(s.options[2], { currentTarget: { dataset: { glassActivation: "drag" } } });
    expect(s.emit).toHaveBeenCalledWith("select", "c", "drag");
    const nativeGo = chassisSource.slice(chassisSource.indexOf("function go(tab:"), chassisSource.indexOf("function goSearch()"))
      .replace(/\/\/ #ifndef APP-PLUS[\s\S]*?\/\/ #endif/g, "");
    const goCode = ts.transpileModule(nativeGo, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const remember = vi.fn(), navigate = vi.fn().mockResolvedValue(false), reset = { value: 0 };
    const go = new Function("activeTab", "rememberGlassNavigation", "navTo", "navigationReset", "let navigationPending = false;\n" + goCode + "\nreturn go;")({ value: "me" }, remember, navigate, reset);
    go({ key: "home", route: "/pages/index/index" }, "drag");
    expect(remember).toHaveBeenLastCalledWith("home", "home");
    go({ key: "store", route: "/pages/store/store" }, "activation");
    expect(navigate).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(remember).toHaveBeenLastCalledWith("me", "me");
    expect(reset.value).toBe(1);
    navigate.mockResolvedValue(true);
    go({ key: "home", route: "/pages/index/index" }, "activation");
    expect(remember).toHaveBeenLastCalledWith("me", "home");
    expect(navigate).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    expect(reset.value).toBe(1);
  });
});
