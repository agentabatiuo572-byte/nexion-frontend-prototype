import { mountLiquidGlass, type GlassConfiguration } from "./liquid-glass-renderer";
import { glassSpring, glassLogoHidden } from "./liquid-glass-core";

export interface SegmentsConfiguration {
  hostId: string; value: string; values: string[]; fromValue?: string;
  layout: string; variant: string;
}

type LensRect = { x: number; y: number; width: number; height: number };
const axes = ["x", "y", "width", "height"] as const;
const zeroVelocity = (): LensRect => ({ x: 0, y: 0, width: 0, height: 0 });
// A new H5 page resumes the outgoing lens, including velocity, instead of restarting.
let navigationFlight: { from: string; value: string; sequence: number; rect: LensRect; velocity: LensRect; width: number; expansion: number; expansionVelocity: number } | undefined;
let navigationSequence = 0;

function mountSegments(root: HTMLElement, initial: SegmentsConfiguration) {
  let config = initial, disposed = false, frame = 0, motionFrame = 0, lastTime = 0;
  let current: LensRect | undefined, target: LensRect | undefined, velocity = zeroVelocity();
  let transformLayer: Animation | undefined, trackLayer: Animation | undefined;
  let expansion = 0, expansionVelocity = 0;
  let maxTrackScroll = 0;
  let destination = initial.value, suppressClick = false;
  let outgoingSequence = 0;
  let drag: { id: number; x: number; y: number; lastX: number; at: number; engaged: boolean } | undefined;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const nodes = () => Array.from(root.querySelectorAll<HTMLElement>(":scope > .nx-glass-option"));
  const rect = (el: HTMLElement) => ({ x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
  const lens = root.querySelector<HTMLElement>(":scope > .nx-glass-indicator")!;
  const track = root.querySelector<HTMLElement>(":scope > .nx-glass-backdrop, :scope > .nx-glass-track-viewport > .nx-glass-backdrop");
  const trackViewport = root.querySelector<HTMLElement>(":scope > .nx-glass-track-viewport");
  const enabled = (el: HTMLElement) => el.getAttribute("aria-disabled") !== "true";
  function paint() {
    if (!current || !target) return;
    const stretch = reduced.matches ? 0 : Math.min(.18, Math.abs(velocity.x) / 4200);
    const squash = reduced.matches ? 0 : Math.min(.08, Math.abs(velocity.y) / 3000);
    const w = current.width * (1 + stretch - squash / 2), h = current.height * (1 - stretch / 2 + squash);
    const transform = `translate3d(${current.x - (w - current.width) / 2}px,${current.y - (h - current.height) / 2}px,0) scale(${w / target.width},${h / target.height})`;
    // Updating an effect avoids a DOM style mutation on every frame. WebKit's
    // background capture otherwise repeatedly snapshots the entire page mid-drag.
    if (lens.animate) {
      if (!transformLayer) {
        transformLayer = lens.animate([{ transform }, { transform }], { duration: 1, fill: "both" });
        transformLayer.pause(); transformLayer.currentTime = 0;
      } else (transformLayer.effect as KeyframeEffect).setKeyframes([{ transform }, { transform }]);
    } else lens.style.transform = transform;
    // Only the material deforms. Its labels, focus rings and hit areas stay put.
    if (track) {
      // Rapid impulses remain continuous without growing beyond the safe gutters.
      const limit = Math.min(.06, 18 / Math.max(1, config.layout === "vertical" ? root.clientHeight : root.clientWidth));
      const amount = reduced.matches ? 0 : limit * Math.tanh(expansion / limit);
      const scale = config.layout === "vertical"
        ? `scale(${1 - amount * .5},${1 + amount})`
        : `scale(${1 + amount},${1 - amount * .5})`;
      // Clip only the scrolling rail's decoration. Its stretched child must not
      // enlarge scrollWidth and feed its own overflow back into scrollLeft.
      if (trackViewport) {
        const offset = `translate3d(${Math.min(root.scrollLeft, maxTrackScroll)}px,0,0)`;
        if (trackViewport.style.transform !== offset) trackViewport.style.transform = offset;
      }
      const backdropTransform = scale;
      if (track.animate) {
        if (!trackLayer) {
          trackLayer = track.animate([{ transform: backdropTransform }, { transform: backdropTransform }], { duration: 1, fill: "both" });
          trackLayer.pause(); trackLayer.currentTime = 0;
        } else (trackLayer.effect as KeyframeEffect).setKeyframes([{ transform: backdropTransform }, { transform: backdropTransform }]);
      } else track.style.transform = backdropTransform;
    }
    if (config.variant === "navigation" && destination !== config.value && root.clientWidth > 0 && outgoingSequence === navigationSequence) {
      navigationFlight = { from: config.value, value: destination, sequence: outgoingSequence, rect: { ...current }, velocity: { ...velocity }, width: root.clientWidth, expansion, expansionVelocity };
    }
  }
  function tick(now: number) {
    motionFrame = 0;
    if (disposed || !current || !target) return;
    const dt = lastTime ? (now - lastTime) / 1000 : 1 / 60;
    lastTime = now;
    let moving = false;
    if (!drag?.engaged) for (const axis of axes) {
      const next = glassSpring(current[axis], velocity[axis], target[axis], dt);
      current[axis] = next.position; velocity[axis] = next.velocity;
      moving ||= Math.abs(next.position - target[axis]) > .08 || Math.abs(next.velocity) > .8;
    }
    if (!drag?.engaged && (!moving || reduced.matches)) { current = { ...target }; velocity = zeroVelocity(); }
    const stretchTarget = drag?.engaged && !reduced.matches ? .018 + Math.min(.035, Math.abs(velocity.x) / 50000) : 0;
    const body = glassSpring(expansion, expansionVelocity, stretchTarget, dt);
    expansion = body.position; expansionVelocity = body.velocity;
    const bodyMoving = Math.abs(expansion - stretchTarget) > .0001 || Math.abs(expansionVelocity) > .002;
    if (!bodyMoving || reduced.matches) { expansion = stretchTarget; expansionVelocity = 0; }
    moving ||= bodyMoving;
    paint();
    const active = String(moving && !reduced.matches);
    if (root.dataset.glassMoving !== active) root.dataset.glassMoving = active;
    if (moving && !reduced.matches) motionFrame = requestAnimationFrame(tick);
    else lastTime = 0;
  }
  function moveTo(item: HTMLElement, value: string) {
    const next = rect(item);
    destination = value;
    const changed = !target || axes.some(axis => next[axis] !== target![axis]);
    if (changed && current && !reduced.matches) expansionVelocity = Math.min(3, expansionVelocity + 2.8);
    if (!current) {
      const from = config.fromValue ? nodes()[config.values.indexOf(config.fromValue)] : undefined;
      const flight = navigationFlight;
      // The logic layer has already validated/consumed this navigation intent.
      // A second, shorter clock would discard a valid flight on a cold page.
      if (config.variant === "navigation" && config.fromValue && flight?.from === config.fromValue && flight.value === value && flight.sequence === navigationSequence && Math.abs(flight.width - root.clientWidth) < 1) {
        current = { ...flight.rect }; velocity = { ...flight.velocity };
        expansion = flight.expansion; expansionVelocity = flight.expansionVelocity;
        navigationFlight = undefined;
      } else {
        current = from ? rect(from) : { ...next };
        if (from && !reduced.matches) expansionVelocity = 2.8;
      }
    }
    target = next;
    Object.assign(lens.style, { visibility: "visible", width: next.width + "px", height: next.height + "px" });
    if (reduced.matches) { current = { ...next }; velocity = zeroVelocity(); expansion = expansionVelocity = 0; }
    paint();
    if ((changed || axes.some(axis => Math.abs(current![axis] - next[axis]) > .08) || Math.abs(expansion) > .0001 || Math.abs(expansionVelocity) > .002) && !motionFrame && !drag?.engaged) {
      lastTime = 0; motionFrame = requestAnimationFrame(tick);
    }
  }
  function measure() {
    frame = 0;
    if (disposed || !root.offsetWidth) return;
    const items = nodes(), item = items[config.values.indexOf(config.value)];
    const last = items[items.length - 1];
    maxTrackScroll = config.layout === "scroll" && last
      ? Math.max(0, last.offsetLeft + last.offsetWidth + parseFloat(getComputedStyle(root).paddingRight || "0") - root.clientWidth) : 0;
    if (!lens) return;
    if (!item) { lens.style.visibility = "hidden"; current = target = undefined; return; }
    if (!drag?.engaged) moveTo(item, config.value);
    if (config.layout === "scroll" && (item.offsetLeft < root.scrollLeft || item.offsetLeft + item.offsetWidth > root.scrollLeft + root.clientWidth)) {
      root.scrollLeft = Math.max(0, item.offsetLeft - (root.clientWidth - item.offsetWidth) / 2);
    }
  }
  function schedule() { if (!disposed && !frame) frame = requestAnimationFrame(measure); }
  function onClick(event: MouseEvent) {
    if (suppressClick && event.detail > 0) { suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); return; }
    const item = (event.target as Element).closest<HTMLElement>(".nx-glass-option");
    if (item?.parentElement === root && enabled(item)) {
      if (config.variant === "navigation" && item.dataset.glassValue !== config.value) outgoingSequence = ++navigationSequence;
      moveTo(item, item.dataset.glassValue!);
    }
  }
  function onDown(event: PointerEvent) {
    suppressClick = false;
    if (!event.isPrimary || event.button !== 0 || config.layout !== "equal") return;
    const item = (event.target as Element).closest<HTMLElement>(".nx-glass-option");
    if (item?.parentElement !== root || !enabled(item)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, at: event.timeStamp, engaged: false };
  }
  function onMove(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId || !current || !target) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.engaged) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { drag = undefined; return; }
      if (Math.abs(dx) < 8) return;
      drag.engaged = true; root.setPointerCapture(event.pointerId);
      cancelAnimationFrame(motionFrame); motionFrame = 0; lastTime = 0;
    }
    event.preventDefault();
    const items = nodes().filter(enabled);
    if (!items.length) { endDrag(event); return; }
    const left = items[0].offsetLeft, last = items[items.length - 1];
    current.x = Math.max(left, Math.min(last.offsetLeft + last.offsetWidth - current.width, event.clientX - root.getBoundingClientRect().left + root.scrollLeft - current.width / 2));
    velocity.x = Math.max(-1800, Math.min(1800, (event.clientX - drag.lastX) / Math.max(8, event.timeStamp - drag.at) * 1000));
    drag.lastX = event.clientX; drag.at = event.timeStamp;
    if (root.dataset.glassDragging !== "true") root.dataset.glassDragging = "true";
    paint();
    if (!motionFrame) motionFrame = requestAnimationFrame(tick);
  }
  function endDrag(event: PointerEvent) {
    // Touch initially captures on the pressed child. Its handoff to this root
    // bubbles a lostpointercapture event; only losing our own capture cancels.
    if (event.type === "lostpointercapture" && event.target !== root) return;
    if (!drag || drag.id !== event.pointerId) return;
    const engaged = drag.engaged;
    drag = undefined; root.dataset.glassDragging = "false";
    if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    if (!engaged || !current) return;
    suppressClick = true;
    const bounds = root.getBoundingClientRect();
    if (event.type !== "pointerup" || event.clientY < bounds.top - 24 || event.clientY > bounds.bottom + 24) { schedule(); return; }
    const center = current.x + current.width / 2;
    const items = nodes().filter(enabled);
    if (!items.length) { schedule(); return; }
    const item = items.reduce((best, el) => Math.abs(el.offsetLeft + el.offsetWidth / 2 - center) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - center) ? el : best);
    moveTo(item, item.dataset.glassValue!);
    item.click(); // The Vue owner commits once; drag previews never change business state.
  }
  function onArrow(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (["Enter", " ", "Spacebar"].includes(event.key)) {
      const item = nodes().find(el => el === event.target);
      if (!item) return;
      if (config.variant === "navigation" && event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && item.getAttribute("aria-disabled") !== "true") item.click();
      return;
    }
    const keys = config.layout === "vertical" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
    if (![...keys, "Home", "End"].includes(event.key)) return;
    const items = nodes().filter(el => el.getAttribute("aria-disabled") !== "true");
    const current = items.indexOf(event.target as HTMLElement);
    if (current < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === keys[1] ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
    if (config.variant !== "navigation" && items[next]) {
      items[next].dataset.glassKeyboard = "arrow";
      items[next].click();
      delete items[next].dataset.glassKeyboard;
    }
  }
  const resize = new ResizeObserver(schedule);
  function observe() { resize.disconnect(); resize.observe(root); nodes().forEach(el => resize.observe(el)); }
  const stopMotion = () => {
    cancelAnimationFrame(motionFrame); motionFrame = 0; lastTime = 0;
    expansion = expansionVelocity = 0;
    if (target) { current = { ...target }; velocity = zeroVelocity(); paint(); }
    root.dataset.glassMoving = "false"; schedule();
  };
  root.addEventListener("keydown", onArrow);
  root.addEventListener("scroll", paint, { passive: true });
  root.addEventListener("click", onClick, true);
  root.addEventListener("pointerdown", onDown);
  root.addEventListener("pointermove", onMove, { passive: false });
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);
  root.addEventListener("lostpointercapture", endDrag);
  reduced.addEventListener("change", stopMotion);
  void document.fonts?.ready.then(schedule);
  observe(); schedule();
  return {
    update(value: SegmentsConfiguration) { config = value; observe(); schedule(); },
    destroy() {
      disposed = true; cancelAnimationFrame(frame); cancelAnimationFrame(motionFrame); transformLayer?.cancel(); trackLayer?.cancel(); resize.disconnect();
      root.removeEventListener("keydown", onArrow); root.removeEventListener("click", onClick, true);
      root.removeEventListener("scroll", paint);
      root.removeEventListener("pointerdown", onDown); root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", endDrag); root.removeEventListener("pointercancel", endDrag); root.removeEventListener("lostpointercapture", endDrag);
      reduced.removeEventListener("change", stopMotion);
    },
  };
}

export function mountChassis(root: HTMLElement) {
  const scroll = root.querySelector<HTMLElement>(".nx-content")!;
  let hidden = scroll.scrollTop > 8;
  function onScroll() {
    const top = Math.max(0, Math.min(scroll.scrollTop, scroll.scrollHeight - scroll.clientHeight));
    hidden = glassLogoHidden(top, hidden);
    // Query again for headers that mount after a product or route resolves.
    for (const title of Array.from(root.querySelectorAll<HTMLElement>(".nx-header__l, .spv-titlewrap, .nx-nav-titlewrap"))) {
      const value = String(hidden);
      if (title.dataset.hidden !== value) title.dataset.hidden = value;
      if (title.getAttribute("aria-hidden") !== value) title.setAttribute("aria-hidden", value);
    }
  }
  scroll.addEventListener("scroll", onScroll, { passive: true });
  const observer = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(onScroll);
  observer?.observe(root, { childList: true, subtree: true });
  onScroll();
  return { update: onScroll, destroy() { scroll.removeEventListener("scroll", onScroll); observer?.disconnect(); } };
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
export const chassisView = viewAdapter<{ hostId: string }>(mountChassis);
