import * as Vue from "vue";
import { expect, it, vi } from "vitest";
import { flush, mountEntry, text } from "@/lib/entry-review.test-support";
import { resolveSearchResultState } from "@/lib/search-source-state";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { searchCopyFor } from "./search-copy";
import source from "./search.vue?raw";

// Render the production feedback/results region with the production state reducer.
// Source-read sequencing is exercised separately in search-source-wiring.test.ts.
const region = source.slice(source.indexOf("<!-- Empty state -->"), source.indexOf("</CardStagger>"));
const fixture = `<template>${region}</template><script setup lang="ts">
import { useContext } from "test:context";
import EmptyState from "test:empty";
const { t, q, searchResultState, recoveryCopy, groupedList, retrySearchSources, openHit } = useContext();
const groupLabel = () => ""; const rowStyle = () => ({}); const openHelp = () => {};
const emptyCardStyle = {}; const groupLabelStyle = {}; const resultCardStyle = {};
</script>`;
const empty = Vue.defineComponent({ props: ["kind", "title", "desc", "ctaLabel"], emits: ["cta"],
  setup: (props, { emit }) => () => Vue.h("view", { class: "test-empty", kind: props.kind }, [String(props.title), String(props.desc),
    Vue.h("view", { role: "button", onClick: () => emit("cta") }, String(props.ctaLabel))]) });

it.each([["zh", zh], ["en", en], ["vi", vietnamese]] as const)("retains matches during partial failure and distinguishes failed from confirmed empty search in %s", async (language, copy) => {
  const loaded = Vue.ref(false), hasResult = Vue.ref(true), q = Vue.ref("match");
  const searchResultState = Vue.computed(() => resolveSearchResultState({ hasQuery: !!q.value.trim(), resultCount: hasResult.value ? 1 : 0,
    remoteCatalogueStatus: loaded.value ? "ready" : "error", remoteNetworkStatus: "ready", remoteFleetStatus: "ready", remoteFleetHasSnapshot: true, remoteFaqStatus: "ready" }));
  const hit = { group: "route", label: copy.search.routes.staking.label, href: "/pages/staking/staking" };
  const openHit = vi.fn(), retrySearchSources = vi.fn(() => { loaded.value = true; });
  const context = { t: copy, q, searchResultState, recoveryCopy: searchCopyFor(language),
    groupedList: Vue.computed(() => hasResult.value ? [{ group: "route", hits: [hit] }] : []), retrySearchSources, openHit };
  const page = mountEntry(fixture, { "test:context": { useContext: () => context }, "test:empty": { default: empty } });
  expect(page.nodes("test-empty")).toHaveLength(0);
  expect(page.nodes("nx-search-source-note")).toHaveLength(1);
  expect(text(page.root)).toContain(searchCopyFor(language).partial);
  expect(text(page.root)).not.toContain(copy.authOtp.errorServiceUnavailable);
  page.control(hit.label)!.props.onClick(); expect(openHit).toHaveBeenCalledWith(hit);
  page.control(copy.ui.retry)!.props.onClick(); await flush();
  expect(retrySearchSources).toHaveBeenCalledOnce(); expect(page.nodes("nx-search-source-note")).toHaveLength(0);
  expect(page.control(hit.label)).toBeDefined();
  hasResult.value = false; loaded.value = false; await flush();
  expect(text(page.root)).toContain(searchCopyFor(language).unavailable);
  expect(text(page.root)).not.toContain(copy.empty.searchTitle);
  page.control(copy.ui.retry)!.props.onClick(); await flush();
  expect(text(page.root)).toContain(copy.empty.searchTitle);
  expect(text(page.root)).not.toContain(searchCopyFor(language).unavailable);
  page.unmount();
});
