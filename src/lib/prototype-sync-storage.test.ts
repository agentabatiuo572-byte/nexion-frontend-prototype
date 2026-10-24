import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readPrototypeStorage, writePrototypeStorage, writePrototypeAccountRow } from './prototype-storage';
let disk: Map<string, string>;
beforeEach(() => {
  disk = new Map();
  vi.stubGlobal('window', { localStorage: { getItem: vi.fn((key: string) => disk.get(key) ?? null) } });
  vi.stubGlobal('uni', {
    getStorageSync: vi.fn(() => ''),
    setStorageSync: vi.fn((key: string, value: unknown) => disk.set(key, typeof value === 'string' ? value : JSON.stringify({ type: typeof value, data: value }))),
  });
});
afterEach(() => vi.unstubAllGlobals());
it('reads each H5 value once and decodes the actual uni serialization without a second uni read', () => {
  for (const value of [{ schema: 1, users: {} }, ['a'], 5, false, 'raw text']) {
    uni.setStorageSync('key', value); expect(readPrototypeStorage('key')).toEqual(value);
  }
  expect(window.localStorage.getItem).toHaveBeenCalledTimes(5);
  expect(uni.getStorageSync).not.toHaveBeenCalled();
  expect(readPrototypeStorage('missing')).toBeUndefined();
});
it('does not treat a thrown H5 read as missing or overwrite another account row', () => {
  const prior = JSON.stringify({ type: 'object', data: { other: { secret: 'keep' } } }); disk.set('table', prior);
  vi.mocked(window.localStorage.getItem).mockImplementationOnce(() => { throw new Error('transient'); });
  expect(() => writePrototypeAccountRow('table', 'current', { changed: true })).toThrow('storage');
  expect(disk.get('table')).toBe(prior); expect(uni.setStorageSync).not.toHaveBeenCalled();
  writePrototypeAccountRow('table', 'current', { changed: true });
  expect(readPrototypeStorage('table')).toEqual({ other: { secret: 'keep' }, current: { changed: true } });
});
it('rejects malformed tables and failed readback instead of reporting a successful write', () => {
  disk.set('table', '{broken'); expect(() => writePrototypeAccountRow('table', 'current', {})).toThrow('storage');
  vi.mocked(window.localStorage.getItem).mockImplementationOnce(() => { throw new Error('readback'); });
  expect(() => writePrototypeStorage('new', { value: 1 })).toThrow('storage');
});
it('fails closed on native empty sentinels for present keys and unavailable key directories', () => {
  vi.stubGlobal('window', undefined);
  const info = vi.fn(() => ({ keys: ['present'] })); (uni as any).getStorageInfoSync = info;
  expect(readPrototypeStorage('missing')).toBeUndefined();
  expect(() => readPrototypeStorage('present')).toThrow('storage');
  info.mockImplementationOnce(() => { throw new Error('directory'); });
  expect(() => readPrototypeStorage('missing')).toThrow('storage');
});
