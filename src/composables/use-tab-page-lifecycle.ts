import { getCurrentInstance, inject, onBeforeMount, onBeforeUnmount, onMounted, type InjectionKey } from "vue";
import { onLoad as pageLoad, onShow as pageShow, onHide as pageHide, onUnload as pageUnload } from "@dcloudio/uni-app";
import type { TabQuery } from "@/lib/native-tab-navigation";

type Hook = (query?: TabQuery) => void;
type Kind = "load" | "show" | "hide" | "unload";
type Listener = { hooks: Record<Kind, Hook[]>; mounted: boolean; shown: boolean };
export function createTabLifecycle(query: TabQuery, visible: boolean) {
  const listeners = new Map<object, Listener>();
  const hide = (listener: Listener) => {
    if (!listener.shown) return;
    listener.shown = false;
    listener.hooks.hide.forEach(hook => hook());
  };
  const show = (listener: Listener) => {
    if (!visible || !listener.mounted || listener.shown) return;
    listener.shown = true;
    listener.hooks.show.forEach(hook => hook());
  };
  return {
    listeners,
    load(listener: Listener) { listener.hooks.load.forEach(hook => hook(query)); },
    mount(listener: Listener) { listener.mounted = true; show(listener); },
    remove(key: object, listener: Listener) {
      hide(listener); listener.hooks.unload.forEach(hook => hook()); listeners.delete(key);
    },
    setVisible(next: boolean) { visible = next; listeners.forEach(listener => next ? show(listener) : hide(listener)); },
  };
}
export const TAB_LIFECYCLE: InjectionKey<ReturnType<typeof createTabLifecycle>> = Symbol("native-tab-lifecycle");
export const TAB_HOST: InjectionKey<boolean> = Symbol("native-tab-host");

function register(kind: Kind, hook: Hook, fallback: (hook: any) => void) {
  const lifecycle = inject(TAB_LIFECYCLE, null);
  if (!lifecycle) { fallback(hook); return; }
  const instance = getCurrentInstance()!;
  let listener = lifecycle.listeners.get(instance);
  if (!listener) {
    listener = { hooks: { load: [], show: [], hide: [], unload: [] }, mounted: false, shown: false };
    lifecycle.listeners.set(instance, listener);
    const owned = listener;
    onBeforeMount(() => lifecycle.load(owned));
    onMounted(() => lifecycle.mount(owned));
    onBeforeUnmount(() => lifecycle.remove(instance, owned));
  }
  listener.hooks[kind].push(hook);
}

export function onLoad(hook: (query?: TabQuery) => void) { register("load", hook, pageLoad); }
export function onShow(hook: () => void) { register("show", hook, pageShow); }
export function onHide(hook: () => void) { register("hide", hook, pageHide); }
export function onUnload(hook: () => void) { register("unload", hook, pageUnload); }

/** Tab children stay mounted; their display clocks belong to visible visits. */
export function useVisibleInterval(tick: () => void, delay: number) {
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => { if (timer !== undefined) clearInterval(timer); timer = undefined; };
  const start = () => { tick(); if (timer === undefined) timer = setInterval(tick, delay); };
  if (inject(TAB_LIFECYCLE, null)) { onShow(start); onHide(stop); }
  else onMounted(start);
  onBeforeUnmount(stop);
}
