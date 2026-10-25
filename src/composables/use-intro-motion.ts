import { onMounted, onUnmounted, ref } from "vue";

/** SMIL cannot be disabled by a CSS animation override. Start static until the
 * browser preference is known, then follow preference changes while mounted. */
export function useIntroMotion() {
  const motionAllowed = ref(false);
  let preference: MediaQueryList | undefined;
  const update = () => { motionAllowed.value = preference?.matches === false; };
  onMounted(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    update();
    if (preference.addEventListener) preference.addEventListener("change", update);
    else preference.addListener(update);
  });
  onUnmounted(() => {
    if (preference?.removeEventListener) preference.removeEventListener("change", update);
    else preference?.removeListener(update);
  });
  return motionAllowed;
}
