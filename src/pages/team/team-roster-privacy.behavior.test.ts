import * as Vue from 'vue';
import { parse } from '@vue/compiler-sfc';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import source from '@/components/team/team-roster-section.vue?raw';
import { mountEntry, all, text, flush, slot } from '@/lib/entry-review.test-support';
import { teamPrivacyFixture } from './team-privacy.test-support';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { formatComputePoints } from '@/i18n/compute-points';

const stops: Array<() => void> = [];
beforeEach(() => {
  const storage = new Map<string, unknown>();
  vi.stubGlobal('uni', { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value) });
});
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); });

for (const language of ['en', 'zh', 'vi'] as const) test.each([null, 0, 87654])(
  language + ' expanded roster masks and restores lifetime points (%s), rank and demo contribution', async lifetime => {
    const { visibility, dependency } = teamPrivacyFixture();
    const member = { id: 'member', name: 'Known member', vRank: 6, layer: 1, status: 'active', city: 'Test city', joinedAt: Date.UTC(2026, 9, 1), monthComputePoints: 1732, lifetimeComputePoints: lifetime, monthVolumeUSD: 12345 };
    const props = { title: 'Direct', subtitle: '1 member · 1,732 points', members: [member], kind: 'direct', isOpen: true, showContribution: true, emptyLabel: 'Empty', color: 'currentColor', accentBg: 'transparent', accentText: 'currentColor', badge: 'Direct' };
    const deps: Record<string, unknown> = {
      '@/store/data-visibility': dependency,
      '@/store/locale': { useLocaleStore: () => ({ code: language }) },
      '@/i18n/use-t': { useT: () => Vue.ref(({ en, zh, vi: vietnamese })[language]) },
      '@/store/commission': { UNILEVEL_USDT: { 1: .1 } },
    };
    for (const match of parse(source).descriptor.scriptSetup!.content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const id = match[1];
      if (id !== 'vue' && !(id in deps)) deps[id] = id.endsWith('.vue') ? slot : await vi.importActual(id);
    }
    const p = mountEntry(source, deps, props); stops.push(p.unmount);
    p.nodes('member-trigger')[0].props.onClick(); await flush();
    const before = text(p.root), raw = JSON.stringify(member);
    expect(before).toContain(formatComputePoints(lifetime, language));
    expect(before).toContain('1234.50'); expect(before).toContain('V6');
    visibility.toggle(); await flush();
    expect(text(p.nodes('roster-count')[0])).toBe('••••');
    expect(text(p.nodes('roster-subtitle')[0])).toBe('••••');
    expect(text(p.nodes('member-contribution')[0])).toBe('+$••••');
    expect(text(p.nodes('member-points')[0])).toContain('••••');
    const lifetimeRow = p.nodes('member-detail')[1];
    expect(text(lifetimeRow.children.at(-1)!)).toBe('••••');
    expect(text(p.root)).not.toContain('V6'); expect(text(p.root)).not.toContain('1234.50');
    expect(all(p.root).filter(n => n.props['aria-expanded'] === true)).toHaveLength(2);
    expect(JSON.stringify(member)).toBe(raw);
    visibility.toggle(); await flush(); expect(text(p.root)).toBe(before);
  },
);
