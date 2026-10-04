/** App Plus service JavaScript does not always provide AbortController. */
export function createAbortController(): AbortController {
  if (typeof AbortController === "function") return new AbortController();

  const listeners = new Set<EventListenerOrEventListenerObject>();
  const signal = {
    aborted: false,
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "abort") listeners.add(listener);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "abort") listeners.delete(listener);
    },
  } as AbortSignal;
  return {
    signal,
    abort() {
      if (signal.aborted) return;
      (signal as { aborted: boolean }).aborted = true;
      const event = { type: "abort", target: signal } as unknown as Event;
      for (const listener of listeners) {
        try {
          if (typeof listener === "function") listener(event);
          else listener.handleEvent(event);
        } catch { /* One listener must not prevent cancellation of the others. */ }
      }
      listeners.clear();
    },
  } as AbortController;
}
