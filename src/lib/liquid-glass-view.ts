import { mountLiquidGlass, type GlassConfiguration } from "./liquid-glass-renderer";

export interface SegmentsConfiguration {
  hostId: string; value: string; values: string[]; fromValue?: string;
  layout: string; variant: string;
}

function mountSegments(root: HTMLElement, initial: SegmentsConfiguration) {
  let config = initial, disposed = false, frame = 0, first = true;
  let animation: Animation | undefined;
  let previous: { x: number; y: number; width: number; height: number } | undefined;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const nodes = () => Array.from(root.querySelectorAll<HTMLElement>(":scope > .nx-glass-option"));
  const rect = (el: HTMLElement) => ({ x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
  function measure() {
    frame = 0;
    if (disposed || !root.offsetWidth) return;
    const items = nodes(), item = items[config.values.indexOf(config.value)];
    const lens = root.querySelector<HTMLElement>(":scope > .nx-glass-indicator");
    if (!lens) return;
    if (!item) { lens.style.visibility = "hidden"; previous = undefined; return; }
    const target = rect(item);
    if (!previous || Object.keys(target).some(k => target[k as keyof typeof target] !== previous![k as keyof typeof target])) {
      const from = first && config.fromValue ? items[config.values.indexOf(config.fromValue)] : undefined;
      let origin = from ? rect(from) : previous;
      if (animation) {
        const a = lens.getBoundingClientRect(), b = root.getBoundingClientRect();
        origin = { x: a.left - b.left + root.scrollLeft - root.clientLeft, y: a.top - b.top + root.scrollTop - root.clientTop, width: a.width, height: a.height };
      }
      animation?.cancel(); animation = undefined;
      Object.assign(lens.style, { visibility: "visible", width: target.width + "px", height: target.height + "px", transform: `translate3d(${target.x}px,${target.y}px,0)` });
      if (origin && !reduced.matches && lens.animate) {
        animation = lens.animate([
          { transform: `translate3d(${origin.x}px,${origin.y}px,0) scale(${origin.width / target.width},${origin.height / target.height})` },
          { transform: `translate3d(${target.x}px,${target.y}px,0) scale(1,1)` },
        ], { duration: config.variant === "navigation" ? 220 : 160, easing: "cubic-bezier(.2,.8,.2,1)" });
        animation.onfinish = () => { animation = undefined; };
      }
      previous = target; first = false;
    }
    if (config.layout === "scroll" && (item.offsetLeft < root.scrollLeft || item.offsetLeft + item.offsetWidth > root.scrollLeft + root.clientWidth)) {
      root.scrollLeft = Math.max(0, item.offsetLeft - (root.clientWidth - item.offsetWidth) / 2);
    }
  }
  function schedule() { if (!disposed && !frame) frame = requestAnimationFrame(measure); }
  function onArrow(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (["Enter", " ", "Spacebar"].includes(event.key)) {
      const item = nodes().find(el => el === event.target);
      if (!item) return;
      event.preventDefault();
      if (!event.repeat && item.getAttribute("aria-disabled") !== "true") item.click();
      return;
    }
    const keys = config.layout === "vertical" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
    if (![...keys, "Home", "End"].includes(event.key)) return;
    const items = nodes().filter(el => el.getAttribute("aria-disabled") !== "true");
    const current = items.indexOf(event.target as HTMLElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === keys[1] ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  const resize = new ResizeObserver(schedule);
  function observe() { resize.disconnect(); resize.observe(root); nodes().forEach(el => resize.observe(el)); }
  const stopMotion = () => { animation?.cancel(); animation = undefined; schedule(); };
  root.addEventListener("keydown", onArrow);
  reduced.addEventListener("change", stopMotion);
  void document.fonts?.ready.then(schedule);
  observe(); schedule();
  return {
    update(value: SegmentsConfiguration) { config = value; observe(); schedule(); },
    destroy() { disposed = true; cancelAnimationFrame(frame); animation?.cancel(); resize.disconnect(); root.removeEventListener("keydown", onArrow); reduced.removeEventListener("change", stopMotion); },
  };
}

// App renderjs mounts a separate empty Vue instance: its $el is a comment.
// Explicit host IDs work on both App's view thread and H5's renderjs mixin.
function viewAdapter<T extends { hostId?: string }>(mount: (host: HTMLElement, value: T) => { update(value: T): void; destroy(): void }) {
  const states = new WeakMap<object, { value: T; frame: number; controller?: ReturnType<typeof mount> }>();
  function schedule(instance: object) {
    const state = states.get(instance);
    if (!state || state.frame) return;
    state.frame = requestAnimationFrame(() => {
      state.frame = 0;
      if (!states.has(instance)) return;
      const host = state.value.hostId ? document.getElementById(state.value.hostId) : null;
      if (!host) return;
      if (state.controller) state.controller.update(state.value);
      else state.controller = mount(host, state.value);
    });
  }
  return {
    mounted(this: object) { schedule(this); },
    beforeUnmount(this: object) { const state = states.get(this); if (state) { cancelAnimationFrame(state.frame); state.controller?.destroy(); states.delete(this); } },
    methods: {
      update(this: object, value: T) {
        const state = states.get(this);
        if (state) state.value = value;
        else states.set(this, { value, frame: 0 });
        schedule(this);
      },
    },
  };
}
export default viewAdapter<GlassConfiguration>(mountLiquidGlass);
export const segmentsView = viewAdapter<SegmentsConfiguration>(mountSegments);
