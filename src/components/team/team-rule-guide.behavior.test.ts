import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Vue from 'vue';
import { all, flush, mountEntry, slot, text } from '@/lib/entry-review.test-support';
import { ApiError } from '@/api/errors';
import { PublishedContentRequestFence } from '@/components/how/p3-14-published-request-fence';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { howContentMode } from '@/lib/team-how-content-mode';
import { ruleComponent, ruleDocument, ruleHero, ruleSection } from './team-rule-guide.test-support';
import { teamRuleGuideCopy } from './team-rule-guide-copy';
import localSource from '@/pages/team/unilevel-how.vue?raw';

const dictionaries = { en, zh, vi: vietnamese };
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(dispose => dispose()));
const blocks = [
  { id: 'intro', kind: 'text', title: 'Published introduction', body: 'Exact introduction\nSecond paragraph.', items: ['Intro list item'] },
  { id: 'direct-referral-scope', kind: 'text', title: 'Direct scope', body: 'Only directly invited members qualify.' },
  { id: 'seven-layer-scope', kind: 'list', title: 'Published L1 / L4 terms', body: 'Published allocation: 9.75%.', items: ['L1: 9.75% USDT', 'L4: 0.125% UVT'] },
  { id: 'refund', kind: 'callout', title: 'Refund conditions', body: 'Rewards may be reversed.', items: ['USDT and UVT recover separately.', 'No new reward is guaranteed.'] },
];
const document = (locale = 'en') => ({ contentKey: 'team-unilevel-how', schemaVersion: 2, templateId: 'unilevel-v2', locale,
  version: 'private-publication-version', blocks });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function published(read: (...args: any[]) => Promise<unknown>, language: keyof typeof dictionaries = 'en') {
  const locale = Vue.reactive({ code: language });
  const navBack = vi.fn();
  const subject = ruleComponent('team-rule-published', {
    '@/components/sub-page-header.vue': slot, './team-rule-hero.vue': ruleHero, './team-rule-document.vue': ruleDocument,
    '@/api/runtime': { remoteApiEnabled: true, howContentApi: { published: read } },
    '@/store/locale': { useLocaleStore: () => locale }, '@/i18n/use-t': { useT: () => Vue.computed(() => dictionaries[locale.code]) },
    '@/lib/route': { navBack }, '@/api/errors': { ApiError },
    '@/components/how/p3-14-published-request-fence': { PublishedContentRequestFence },
  });
  const page = mountEntry('<template><Subject content-key="team-unilevel-how" heading="Team guide" kind="members" back="/pages/team/unilevel" back-label="Return" /></template><script setup lang="ts">import Subject from "subject";</script>', { subject });
  cleanups.push(page.unmount);
  return { ...page, locale, navBack };
}

describe('018 published team guide', () => {
  it.each(['zh', 'en', 'vi'] as const)('keeps every authoritative sentence and item reachable without rewriting in %s', async language => {
    const page = published(vi.fn().mockResolvedValue(document(language)), language); await flush();
    expect(page.nodes('team-rule-hero__title').map(text)).toEqual([teamRuleGuideCopy(language).overview]);
    // Published blocks stay expanded (design system 04.7): no section toggles, no expand-all.
    expect(page.nodes('team-rule-faq__toggle')).toHaveLength(0);
    expect(page.nodes('team-rule-fold__toggle')).toHaveLength(0);
    for (const block of blocks) {
      expect(text(page.root)).toContain(block.title);
      expect(text(page.root)).toContain(block.body);
      for (const item of block.items ?? []) expect(text(page.root).split(item)).toHaveLength(2);
    }
    expect(text(page.root)).not.toContain('private-publication-version');
    const sections = blocks.filter(block => block.kind !== 'callout');
    expect(page.nodes('team-rule-hero__jump').map(text)).toEqual(sections.map(block => block.title));
    for (const block of sections) expect(all(page.root).some(node => node.props.id === `team-rule-${block.id}`)).toBe(true);
    expect(page.nodes('team-rule-note').map(text)[0]).toContain(blocks[3].items![1]);
    page.control('Return')!.props.onClick(); expect(page.navBack).toHaveBeenCalledWith('/pages/team/unilevel');
  });
  it('preserves the publication during refresh and warm network failure, then recovers', async () => {
    const refresh = deferred<ReturnType<typeof document>>();
    const read = vi.fn().mockResolvedValueOnce(document('en')).mockReturnValueOnce(refresh.promise).mockResolvedValueOnce(document('vi'));
    const page = published(read, 'vi'); await flush();
    page.control(vietnamese.ui.retry)!.props.onClick(); await flush();
    expect(text(page.root)).toContain(blocks[0].body);
    refresh.reject(new ApiError({ kind: 'network', message: 'OFFLINE' })); await flush();
    expect(text(page.root)).toContain(blocks[0].body);
    expect(text(page.root)).toContain(vietnamese.howPublished.unavailableBody);
    page.control(vietnamese.ui.retry)!.props.onClick(); await flush();
    expect(text(page.root)).not.toContain(vietnamese.howPublished.unavailableBody);
    expect(text(page.root)).toContain(blocks[0].body);
  });
  it('discards old locale responses and closes the prior publication', async () => {
    const previous = deferred<ReturnType<typeof document>>();
    const read = vi.fn().mockReturnValueOnce(previous.promise).mockResolvedValueOnce(document('zh'));
    const page = published(read); page.locale.code = 'zh'; await flush();
    previous.resolve({ ...document(), blocks: [{ ...blocks[0], body: 'STALE' }] }); await flush();
    expect(text(page.root)).not.toContain('STALE'); expect(text(page.root)).toContain(blocks[0].body);
  });
  it.each(['unresolved', 'missing-direct', 'missing-scope', 'old-template'])('rejects %s without local rule fallback', async kind => {
    const value = document();
    if (kind === 'unresolved') value.blocks = [{ ...blocks[0], body: 'Value {value}' }, ...blocks.slice(1)];
    if (kind === 'missing-direct') value.blocks = blocks.filter(block => block.id !== 'direct-referral-scope');
    if (kind === 'missing-scope') value.blocks = blocks.filter(block => block.id !== 'seven-layer-scope');
    if (kind === 'old-template') value.templateId = 'old';
    const page = published(vi.fn().mockResolvedValue(value)); await flush();
    expect(text(page.root)).toContain(en.howPublished.unavailableBody);
    expect(text(page.root)).not.toContain(blocks[0].body);
    expect(page.control(en.ui.retry)).toBeDefined();
  });
});

it.each(['zh', 'en', 'vi'] as const)('local guide uses scope language and never invents amounts/rates in %s', async language => {
  const page = mountEntry(localSource, {
    '@/components/app-chassis.vue': slot, '@/components/team/reward-page-surface.vue': slot,
    '@/components/sub-page-header.vue': slot, '@/components/team/team-rule-published.vue': slot,
    '@/components/team/team-rule-hero.vue': ruleHero, '@/components/team/team-rule-section.vue': ruleSection,
    '@/components/team/team-rule-guide-copy': { teamRuleGuideCopy },
    '@/api/runtime': { remoteApiEnabled: false }, '@/lib/team-how-content-mode': { howContentMode },
    '@/i18n/use-t': { useT: () => Vue.ref(dictionaries[language]) }, '@/store/locale': { useLocaleStore: () => ({ code: language }) },
    '@/lib/route': { navBack: vi.fn() },
  });
  cleanups.push(page.unmount);
  expect(text(page.root)).toContain(teamRuleGuideCopy(language).deviceBody);
  expect(text(page.root)).toContain(teamRuleGuideCopy(language).referencesBody);
  expect(text(page.root)).not.toMatch(/L[1-7]|层级|收益层|\blayers?\b|tầng|10%|182\.40|Influence Score|Verified/);
  expect(text(page.root)).toContain(dictionaries[language].howPublished.unavailableBody);
});
