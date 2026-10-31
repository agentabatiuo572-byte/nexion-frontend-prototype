import { computed, onScopeDispose, ref, watch, type CSSProperties, type Ref } from 'vue';
import { h5DevicePreviewStatusBarHeight } from '@/lib/device-preview';

/** Own the PIN viewport so Android's input auto-pan cannot move its heading under the status bar. */
export function usePaymentPinViewport(open: Ref<boolean>) {
  const height = ref<number>(), top = ref(0), statusBar = ref(0);
  let fullHeight = 0, width = 0, keyboard = 0, resizedForKeyboard = false, restoring = false, lastHeight = 0;
  let detach = () => {};
  function measure() {
    const info = uni.getSystemInfoSync();
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (width !== info.windowWidth) {
      fullHeight = info.windowHeight + (keyboard > 0 && resizedForKeyboard ? keyboard : 0); restoring = false;
    } else if (restoring && info.windowHeight > lastHeight) {
      fullHeight = info.windowHeight; restoring = false;
    } else fullHeight = Math.max(fullHeight, info.windowHeight);
    width = info.windowWidth;
    // min() also covers adjustResize: do not subtract the keyboard from an already smaller window.
    if (open.value) height.value = Math.max(0, Math.min(info.windowHeight, fullHeight - keyboard, viewport?.height ?? info.windowHeight));
    top.value = viewport?.offsetTop ?? 0;
    statusBar.value = info.statusBarHeight || h5DevicePreviewStatusBarHeight();
    resizedForKeyboard = keyboard > 0 && info.windowHeight < fullHeight;
    lastHeight = info.windowHeight;
  }
  function keyboardChanged(event: { height: number }) {
    if (!event.height && keyboard) {
      const current = uni.getSystemInfoSync().windowHeight;
      restoring = current <= fullHeight - keyboard;
      if (!restoring) fullHeight = current;
    }
    keyboard = event.height; if (keyboard) restoring = false;
    measure();
  }
  function stop() { detach(); detach = () => {}; }
  measure();
  // Keep the last native keyboard height while mounted: reopening need not emit a new height event.
  // #ifdef APP-PLUS
  uni.onKeyboardHeightChange(keyboardChanged);
  // #endif
  watch(open, visible => {
    stop();
    if (!visible) { height.value = undefined; return; }
    measure();
    // #ifdef APP-PLUS
    uni.onWindowResize(measure);
    // #endif
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    viewport?.addEventListener('resize', measure);
    viewport?.addEventListener('scroll', measure);
    if (typeof window !== 'undefined') window.addEventListener('resize', measure);
    detach = () => {
      // #ifdef APP-PLUS
      uni.offWindowResize(measure);
      // #endif
      viewport?.removeEventListener('resize', measure);
      viewport?.removeEventListener('scroll', measure);
      if (typeof window !== 'undefined') window.removeEventListener('resize', measure);
    };
  }, { immediate: true, flush: 'sync' });
  onScopeDispose(() => {
    stop();
    // #ifdef APP-PLUS
    uni.offKeyboardHeightChange(keyboardChanged);
    // #endif
  });
  return computed<CSSProperties>(() => ({
    top: `${top.value}px`, bottom: 'auto', height: height.value === undefined ? undefined : `${height.value}px`,
    paddingTop: `max(var(--nx-overlay-top, 12px), ${statusBar.value}px)`,
  }));
}
