import { beforeEach, expect, it, vi } from 'vitest';
const carrier = vi.hoisted(() => ({ value: 'h5' }));
vi.mock('@/lib/carrier', () => ({ getCarrier: () => carrier.value }));
import { getEntrySurface } from './entry-surface';
beforeEach(() => { carrier.value = 'h5'; });
it.each(['janus','white','cloak','white-app'])('ignores the retired %s entry alias', alias => {
  vi.stubGlobal('location', { search: '?entry=' + alias, hash: '#/?entry=' + alias });
  expect(getEntrySurface()).toBe('h5');
  carrier.value = 'app';
  expect(getEntrySurface()).toBe('signed-app');
  vi.unstubAllGlobals();
});
