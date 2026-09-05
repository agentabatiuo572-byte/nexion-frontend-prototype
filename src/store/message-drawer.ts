import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Message (notification) drawer visibility store. NEW small Pinia store —
 * deliberately separate from the shared src/store/ui.ts (which already carries a
 * messageDrawerOpen flag) so this chassis overlay owns its own open state without
 * touching ui.ts. Mirrors the prototype's useUI.messageDrawerOpen role for the
 * MessageDrawer, but scoped to a dedicated store.
 *
 * The chassis header BELL opens it (orchestrator wires goNotifications →
 * useMessageDrawer().show()); the always-mounted <MessageDrawer> reads `open`
 * and slides in from the chassis right.
 *
 * NOTE on the API: the state ref is named `open` (boolean), so the opener method
 * is `show()` — a setup store can't expose both a `open` ref and an `open()`
 * method (object-literal duplicate key). This matches every other sheet store in
 * this codebase (trial-claim-sheet: `open` + show()/hide()). Setup store with NO
 * explicit return annotation so Pinia infers the unwrapped shape (P-017).
 */
export const useMessageDrawer = defineStore("messageDrawer", () => {
  const open = ref(false);

  function show() {
    open.value = true;
  }
  function close() {
    open.value = false;
  }

  return { open, show, close };
});
