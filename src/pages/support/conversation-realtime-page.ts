export function createHumanThreadRealtimeLifecycle(hooks: {
  currentId: () => string;
  isAi: () => boolean;
  setTyping: (active: boolean) => void;
  watch: (id: string | null) => void;
}) {
  let epoch = 0;
  let visible = false;
  function show(): number { visible = true; return epoch; }
  function isVisibleFor(openId: string): boolean {
    return visible && !hooks.isAi() && openId === hooks.currentId();
  }
  function capture(openId: string): { epoch: number; id: string } | null {
    return isVisibleFor(openId) ? { epoch, id: openId } : null;
  }
  function isCurrent(openEpoch: number, openId: string): boolean {
    return openEpoch === epoch && isVisibleFor(openId);
  }
  function watchIfCurrent(openEpoch: number, openId: string): void {
    if (isCurrent(openEpoch, openId)) hooks.watch(openId);
  }
  function activateIfCurrent(openId: string): boolean {
    const scope = capture(openId);
    if (!scope) return false;
    watchIfCurrent(scope.epoch, scope.id);
    return true;
  }
  function stop(): void {
    hooks.setTyping(false);
    hooks.watch(null);
    visible = false;
    epoch += 1;
  }
  return { show, isVisibleFor, capture, isCurrent, watchIfCurrent, activateIfCurrent, stop };
}

export function createHumanConversationCreationRecovery<T extends string>(hooks: {
  visible: () => boolean;
  account: () => string;
  binding: () => number;
  currentId: () => string;
  startType: () => T | null;
  restore: (id: string) => void;
}) {
  type Creation = { type: T; account: string; binding: number };
  type Completed = Creation & { id: string };
  let inFlight = false;
  let completed: Completed | null = null;

  function begin(type: T): Creation | null {
    if (inFlight) return null;
    inFlight = true;
    return { type, account: hooks.account(), binding: hooks.binding() };
  }
  function isCurrent(creation: Creation): boolean {
    return creation.account === hooks.account()
      && creation.binding === hooks.binding()
      && !hooks.currentId()
      && hooks.startType() === creation.type;
  }
  function complete(id: string, creation: Creation): void {
    completed = { id, ...creation };
  }
  function restore(): string | null {
    const pending = completed;
    if (!pending || !hooks.visible()) return null;
    completed = null;
    if (!isCurrent(pending)) return null;
    hooks.restore(pending.id);
    return pending.id;
  }
  function finish(): void { inFlight = false; }
  return { begin, isCurrent, complete, restore, finish };
}

export function humanConversationPresence(input: {
  remote: boolean;
  isAi: boolean;
  ready: boolean;
  conversationId: string;
  online: boolean;
  closed: boolean;
}) {
  return {
    showOnline: !input.closed && input.remote && !input.isAi && input.ready && !!input.conversationId && input.online,
    mutedDot: input.closed || (input.remote && !input.isAi && (!input.ready || !input.online)),
  };
}
