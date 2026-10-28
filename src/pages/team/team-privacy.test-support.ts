import { createPinia } from 'pinia';
import { useDataVisibility } from '@/store/data-visibility';
import { vi } from 'vitest';

// Each mounted fixture shares the real store across the page and its children.
export function teamPrivacyFixture() {
  if (typeof uni === 'undefined') {
    const storage = new Map<string, unknown>();
    vi.stubGlobal('uni', { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value) });
  }
  const visibility = useDataVisibility(createPinia());
  visibility.hidden = false;
  return { visibility, dependency: { useDataVisibility: () => visibility } };
}
