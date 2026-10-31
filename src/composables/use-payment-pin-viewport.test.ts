import { afterEach, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { usePaymentPinViewport } from './use-payment-pin-viewport';

const disposals: (() => void)[] = [];
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); });
function fixture(visual = false) {
  const info = { windowHeight: 844, windowWidth: 390, statusBarHeight: 24 };
  const keys = new Set<(event: { height: number }) => void>(), sizes = new Set<() => void>();
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
  const browser = Object.assign(new EventTarget(), { visualViewport: visual ? viewport : undefined, location: { search: '' } });
  vi.stubGlobal('window', browser);
  vi.stubGlobal('uni', { getSystemInfoSync: () => info,
    onKeyboardHeightChange: (fn: (event: { height: number }) => void) => keys.add(fn),
    offKeyboardHeightChange: (fn: (event: { height: number }) => void) => keys.delete(fn),
    onWindowResize: (fn: () => void) => sizes.add(fn), offWindowResize: (fn: () => void) => sizes.delete(fn) });
  const open = ref(false), scope = effectScope(), style = scope.run(() => usePaymentPinViewport(open))!;
  disposals.push(() => scope.stop());
  return { info, keys, sizes, viewport, browser, open, style, scope,
    keyboard: (height: number) => keys.forEach(fn => fn({ height })), resize: () => sizes.forEach(fn => fn()) };
}

it('bounds adjustPan above the keyboard and reserves the real native status bar', () => {
  const h = fixture(); h.open.value = true;
  expect(h.style.value).toMatchObject({ height: '844px', top: '0px', paddingTop: 'max(var(--nx-overlay-top, 12px), 24px)' });
  h.keyboard(340); expect(h.style.value.height).toBe('504px');
  h.keyboard(300); expect(h.style.value.height).toBe('544px');
  h.keyboard(0); expect(h.style.value.height).toBe('844px');
});
it('does not deduct keyboard height twice when the native window is already resized', () => {
  const h = fixture(); h.open.value = true;
  h.info.windowHeight = 504; h.keyboard(340);
  expect(h.style.value.height).toBe('504px');
  h.resize(); expect(h.style.value.height).toBe('504px');
  h.keyboard(0); h.info.windowHeight = 844; h.resize(); expect(h.style.value.height).toBe('844px');
});
it('keeps the full baseline when window resize arrives before the keyboard height event', () => {
  const h = fixture(); h.open.value = true;
  h.info.windowHeight = 504; h.resize(); expect(h.style.value.height).toBe('504px');
  h.keyboard(340); expect(h.style.value.height).toBe('504px');
});
it.each([844, 504])('reopens with an already-open keyboard without needing another height event (window %s)', windowHeight => {
  const h = fixture(); h.open.value = true; h.keyboard(340); h.info.windowHeight = windowHeight; h.resize();
  h.open.value = false; h.open.value = true; expect(h.style.value.height).toBe('504px');
  h.open.value = false; h.info.windowHeight = 844; h.keyboard(0); h.open.value = true;
  expect(h.style.value.height).toBe('844px');
});
it('recalculates a rotated adjustPan window while the keyboard remains open', () => {
  const h = fixture(); h.open.value = true; h.keyboard(340);
  h.info.windowWidth = 844; h.info.windowHeight = 390; h.keyboard(200);
  expect(h.style.value.height).toBe('190px');
});
it.each([true, false])('rebases a rotated resized window after keyboard closure in either event order (resize first %s)', resizeFirst => {
  const h = fixture(); h.open.value = true; h.keyboard(340); h.info.windowHeight = 504; h.resize();
  h.info.windowWidth = 844; h.info.windowHeight = 190; h.resize(); h.keyboard(200);
  expect(h.style.value.height).toBe('190px');
  if (resizeFirst) { h.info.windowHeight = 390; h.resize(); h.keyboard(0); }
  else { h.keyboard(0); h.info.windowHeight = 390; h.resize(); }
  expect(h.style.value.height).toBe('390px');
  h.keyboard(200); expect(h.style.value.height).toBe('190px');
});
it('uses the H5 visual viewport and its offset rather than placing content behind the keyboard', () => {
  const h = fixture(true); h.open.value = true;
  h.viewport.height = 390; h.viewport.offsetTop = 18; h.viewport.dispatchEvent(new Event('resize'));
  expect(h.style.value).toMatchObject({ height: '390px', top: '18px' });
  h.viewport.offsetTop = 0; h.viewport.height = 844; h.viewport.dispatchEvent(new Event('scroll'));
  expect(h.style.value).toMatchObject({ height: '844px', top: '0px' });
});
it('detaches window/browser listeners on close and the native keyboard cache on disposal', () => {
  const h = fixture(true); h.open.value = true;
  expect(h.keys.size).toBe(1); expect(h.sizes.size).toBe(1);
  h.open.value = false; expect(h.keys.size).toBe(1); expect(h.sizes.size).toBe(0);
  h.viewport.height = 300; h.viewport.dispatchEvent(new Event('resize')); expect(h.style.value.height).toBeUndefined();
  h.open.value = true; expect(h.style.value.height).toBe('300px'); expect(h.keys.size).toBe(1);
  h.scope.stop(); expect(h.keys.size).toBe(0); expect(h.sizes.size).toBe(0);
});
