import { onScopeDispose, ref, watch } from 'vue';
import type { ThreadMsg } from './thread-types';

export const CONVERSATION_ENTRANCE_MS = 180;
type Snapshot = { identity: string; visible: boolean; ready: boolean; messages: ThreadMsg[] };

/** Only unseen tail additions in a live thread enter; history snapshots merely seed IDs. */
export function useConversationEntrance(source: () => Snapshot) {
  const active = ref<Record<string, { token: number; identity: string }>>({});
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let identity: string | undefined, previous: string[] = [], seen = new Set<string>(), serial = 0;
  let previouslyReady = false, previouslyVisible = false;
  function finish(id: string, token: number) {
    if (active.value[id]?.token !== token) return;
    clearTimeout(timers.get(id)); timers.delete(id);
    const next = { ...active.value }; delete next[id]; active.value = next;
  }
  function clear() {
    timers.forEach(timer => clearTimeout(timer)); timers.clear(); active.value = {};
  }
  watch(() => {
    const current = source();
    return [current.identity, current.visible, current.ready, current.messages.map(m => [m.id, m.side, m.tone])];
  }, () => {
    const current = source(), ids = current.messages.map(m => m.id);
    const changed = identity !== current.identity;
    if (changed) { clear(); identity = current.identity; seen = new Set(); }
    for (const id of Object.keys(active.value)) if (!ids.includes(id)) finish(id, active.value[id].token);
    if (!current.visible || !current.ready) clear();
    const tail = previous.length ? ids.indexOf(previous[previous.length - 1]) : -1;
    const canAppend = !previous.length || tail !== -1;
    if (!changed && previouslyVisible && previouslyReady && current.visible && current.ready && canAppend) {
      for (let index = tail + 1; index < current.messages.length; index++) {
        const message = current.messages[index];
        if (seen.has(message.id) || message.tone === 'system') continue;
        const token = ++serial;
        active.value = { ...active.value, [message.id]: { token, identity: current.identity } };
        // Also expire when reduced motion prevents animationend from firing.
        timers.set(message.id, setTimeout(() => finish(message.id, token), CONVERSATION_ENTRANCE_MS + 20));
      }
    }
    ids.forEach(id => seen.add(id)); previous = ids;
    previouslyReady = current.ready; previouslyVisible = current.visible;
  }, { immediate: true });
  onScopeDispose(clear);
  function entranceBindings(message: ThreadMsg) {
    const entry = active.value[message.id], current = source();
    if (!entry || entry.identity !== current.identity || !current.visible || !current.ready) return {};
    return { class: 'nx-conv-enter-' + message.side, onAnimationend: (event: AnimationEvent) => {
      if (event.target !== event.currentTarget || source().identity !== entry.identity) return;
      finish(message.id, entry.token);
    } };
  }
  return { entranceBindings };
}
