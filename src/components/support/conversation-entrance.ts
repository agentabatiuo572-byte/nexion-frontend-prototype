import { onScopeDispose, ref, watch } from 'vue';
import type { ThreadMsg } from './thread-types';

export const CONVERSATION_ENTRANCE_MS = 180;
type Snapshot = { identity: string; visible: boolean; ready: boolean; messages: ThreadMsg[] };

/** Only unseen tail additions in a live thread enter; history snapshots merely seed IDs. */
export function useConversationEntrance(source: () => Snapshot, onIncoming?: () => void) {
  const active = ref<Record<string, { token: number; identity: string; expiresAt: number }>>({});
  const renderKeys = ref<Record<string, string>>({});
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const acknowledgedTails = new Map<string, string>();
  let identity: string | undefined, previous: string[] = [], seen = new Set<string>(), serial = 0;
  let previouslyReady = false, previouslyVisible = false;
  let previousMessages: ThreadMsg[] = [];
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
    if (changed) { clear(); identity = current.identity; seen = new Set(); renderKeys.value = {}; acknowledgedTails.clear(); }
    // A fast authoritative acknowledgement replaces the local outbox ID. Keep
    // the mounted bubble and its running animation, without delaying the receipt
    // or inferring delivery from matching body text. Only a unique tail replacement
    // in this already-live view can adopt the local render key.
    const oldTail = previousMessages[previousMessages.length - 1];
    let liveWindowStart: number | undefined;
    if (!changed && previouslyVisible && previouslyReady && current.visible && current.ready && oldTail?.localSend) {
      const candidates = current.messages.slice(previousMessages.length - 1)
        .filter(message => message.side === 'right' && !message.localSend && !previous.includes(message.id));
      const samePrefix = previous.slice(0, -1).every((id, index) => ids[index] === id);
      // Incoming rows may arrive before the pending row/canonical replacement.
      // Scan this entire live suffix, not just rows after the outgoing anchor.
      if (samePrefix) liveWindowStart = previous.length - 1;
      // The store can publish the confirmed record one microtask before the
      // page retires its pending row. Remember that unique insertion as well.
      if (samePrefix && candidates.length === 1) acknowledgedTails.set(oldTail.id, candidates[0].id);
      const replacement = current.messages.find(message => message.id === acknowledgedTails.get(oldTail.id));
      if (!ids.includes(oldTail.id) && replacement) {
        renderKeys.value = { ...renderKeys.value, [replacement.id]: renderKeys.value[oldTail.id] ?? oldTail.id };
        seen.add(replacement.id);
        const entry = active.value[oldTail.id];
        if (entry) {
          clearTimeout(timers.get(oldTail.id)); timers.delete(oldTail.id);
          const next = { ...active.value }; delete next[oldTail.id];
          next[replacement.id] = entry; active.value = next;
          timers.set(replacement.id, setTimeout(() => finish(replacement.id, entry.token), Math.max(0, entry.expiresAt - Date.now())));
        }
      }
    }
    for (const id of acknowledgedTails.keys()) if (!ids.includes(id)) acknowledgedTails.delete(id);
    for (const id of Object.keys(active.value)) if (!ids.includes(id)) finish(id, active.value[id].token);
    if (!current.visible || !current.ready) clear();
    const oldTailKey = oldTail && (renderKeys.value[oldTail.id] ?? oldTail.id);
    const tail = previous.length ? current.messages.findIndex(message => (renderKeys.value[message.id] ?? message.id) === oldTailKey) : -1;
    const canAppend = liveWindowStart !== undefined || !previous.length || tail !== -1;
    if (!changed && previouslyVisible && previouslyReady && current.visible && current.ready && canAppend) {
      let incoming = false;
      for (let index = liveWindowStart ?? (tail + 1); index < current.messages.length; index++) {
        const message = current.messages[index];
        if (seen.has(message.id) || message.tone === 'system' || [...acknowledgedTails.values()].includes(message.id)) continue;
        if (message.side === 'left') incoming = true;
        const token = ++serial;
        active.value = { ...active.value, [message.id]: { token, identity: current.identity, expiresAt: Date.now() + CONVERSATION_ENTRANCE_MS + 20 } };
        // Also expire when reduced motion prevents animationend from firing.
        timers.set(message.id, setTimeout(() => finish(message.id, token), CONVERSATION_ENTRANCE_MS + 20));
      }
      if (incoming) onIncoming?.();
    }
    ids.forEach(id => seen.add(id)); previous = ids; previousMessages = current.messages.slice();
    const retained = Object.fromEntries(Object.entries(renderKeys.value).filter(([id]) => ids.includes(id)));
    if (Object.keys(retained).length !== Object.keys(renderKeys.value).length) renderKeys.value = retained;
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
  return { entranceBindings, messageKey: (message: ThreadMsg) => renderKeys.value[message.id] ?? message.id };
}
