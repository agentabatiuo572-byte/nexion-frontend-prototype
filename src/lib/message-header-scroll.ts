export type MessageHeaderState = { top: number; anchor: number; direction: number; title: boolean; primary: boolean; settledAt: number };
export const createMessageHeaderState = (): MessageHeaderState => ({ top: 0, anchor: 0, direction: 0, title: true, primary: true, settledAt: 0 });
/** Accumulated travel, rather than a single scroll delta, prevents touch jitter. */
export function advanceMessageHeader(state: MessageHeaderState, scrollTop: number, focused = false, now = Date.now(), userInitiated = false): MessageHeaderState {
  const top = Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0);
  if (top <= 20) return { ...createMessageHeaderState(), top };
  if (focused) return { ...state, top, anchor: top, direction: 0 };
  // Resizing the list after collapsing the header may clamp its scroll position.
  // Real wheel/touch/keyboard input can reverse an in-flight transition. Only
  // layout-generated scroll events are suppressed during compensation.
  if (!userInitiated && now < state.settledAt) return { ...state, top, anchor: top, direction: 0 };
  const direction = Math.sign(top - state.top);
  const anchor = direction && direction !== state.direction ? state.top : state.anchor;
  let title = state.title, primary = state.primary;
  if (direction > 0 && top >= 120 && top - anchor >= 36) { title = false; primary = false; }
  else if (direction < 0 && anchor - top >= 28) primary = true;
  const changed = title !== state.title || primary !== state.primary;
  return { top, anchor: changed ? top : anchor, direction, title, primary, settledAt: changed ? now + 220 : state.settledAt };
}
