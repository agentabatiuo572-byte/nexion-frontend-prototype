import test from "node:test";
import assert from "node:assert/strict";
import { projectGlassSegmentsIds } from "./glass-segments-id-projection.mjs";

const component = `<template><view><view v-for="option in options" :id="option.id" /></view></template>
<script setup lang="ts">defineProps<{ options: readonly { id?: string }[] }>();</script>`;
const caller = (declaration, template = '<GlassSegments :options="tabs" />', imports = '') => `<template>${template}</template>
<script setup lang="ts">
import GlassSegments from "@/components/glass-segments.vue";
import { computed } from "vue";
${imports}
${declaration}
</script>`;
const ids = (source, shared = component) => projectGlassSegmentsIds(source, shared).ids;

test("projects IDs from the bound const array, retaining full strings and duplicates", () => {
  assert.deepEqual(ids(caller('const tabs = [{ id: "first-tab-with-hyphens" }, { id: "first-tab-with-hyphens" }];')), ["first-tab-with-hyphens", "first-tab-with-hyphens"]);
});

test("projects IDs from the bound Vue computed literal array with dynamic labels", () => {
  assert.deepEqual(ids(caller('const tabs = computed(() => [{ id: "activity", label: t.value.title }, { id: "earnings" }]);')), ["activity", "earnings"]);
});

test("supports the imported component and computed aliases and kebab tags", () => {
  const source = caller('const tabs = makeTabs(() => [{ id: "alias" }] as const);', '<feed-segments v-bind:options="tabs" />')
    .replace('import GlassSegments from', 'import FeedSegments from')
    .replace('import { computed }', 'import { computed as makeTabs }');
  assert.deepEqual(ids(source), ["alias"]);
});

test("never reads unbound arrays, comments, unrelated object IDs or commented imports", () => {
  assert.deepEqual(ids(caller('const tabs = []; const other = [{ id: "unbound" }]; // id: "comment"\nconst row = { id: "unrelated" };')), []);
  assert.deepEqual(ids(caller('const tabs = [{ id: "commented-import" }];').replace('import GlassSegments from', '// import GlassSegments from')), []);
  assert.deepEqual(ids(caller('const tabs = [{ id: "commented-tag" }];', '<!-- <GlassSegments :options="tabs" /> -->')), []);
});

test("wrong component or computed imports cannot impersonate the rendering contract", () => {
  assert.deepEqual(ids(caller('const tabs = [{ id: "wrong-component" }];').replace('@/components/glass-segments.vue', '@/components/other.vue')), []);
  assert.deepEqual(ids(caller('const tabs = computed(() => [{ id: "fake-computed" }]);').replace('from "vue"', 'from "other"')), []);
  assert.deepEqual(ids(caller('const tabs = [{ id: "type-only" }];').replace('import GlassSegments', 'import type GlassSegments')), []);
});

test("options without an ID cannot manufacture the missing target", () => {
  assert.deepEqual(ids(caller('const tabs = [{ value: "missing" }, { id: "present" }];')), ["present"]);
});

test("counts every component instance, so repeated projected IDs stay visible to the gate", () => {
  assert.deepEqual(ids(caller('const tabs = [{ id: "duplicate-instance" }];', '<view><GlassSegments :options="tabs" /><GlassSegments :options="tabs" /></view>')), ["duplicate-instance", "duplicate-instance"]);
});

test("rejects unsupported conditional, spread, reference, call and dynamic-ID expressions", () => {
  for (const declaration of [
    'const tabs = computed(() => ok ? [{ id: "fake" }] : []);',
    'const tabs = computed(() => { return [{ id: "fake" }]; });',
    'const tabs = [{ id: "fake", ...extra }];',
    'const tabs = [{ ...extra, id: "fake" }];',
    'const tabs = [{ id: "fake" }, ...extra];',
    'const source = [{ id: "fake" }]; const tabs = source;',
    'const tabs = makeTabs([{ id: "fake" }]);',
    'const tabs = [{ id: dynamicId }];',
    'const tabs = [{ id: "fake", [key]: other }];',
    'const tabs = [{ id: "fake", id: "replacement" }];',
    'const tabs = [{ get id() { return "fake"; } }];',
    'let tabs = [{ id: "fake" }];',
    'const tabs = [{ id: "fake" }]; tabs[0].id = "replacement";',
    'const tabs = [{ id: "fake", label: () => tabs.pop() }];',
  ]) {
    const result = projectGlassSegmentsIds(caller(declaration), component);
    assert.deepEqual(result.ids, [], declaration);
    assert.ok(result.unknown.length, declaration);
  }
});

test("non-simple options and bindings that may overwrite options remain unknown", () => {
  for (const template of ['<GlassSegments :options="tabs.value" />', '<GlassSegments :options="ok ? tabs : []" />', '<GlassSegments :options="tabs" v-bind="extra" />', '<GlassSegments :options.prop="tabs" />', '<GlassSegments options="" :options="tabs" />']) {
    const result = projectGlassSegmentsIds(caller('const tabs = [{ id: "fake" }];', template), component);
    assert.deepEqual(result.ids, [], template);
    assert.ok(result.unknown.length, template);
  }
});

test("broken, conditional, repeated or non-native shared rendering cannot project IDs", () => {
  for (const shared of [
    component.replace(':id="option.id"', ':id="option.value"'),
    component.replace('option in options', 'option in other'),
    component.replace('<view v-for', '<view v-if="false" v-for'),
    component.replace('<view><view', '<view v-if="false"><view'),
    component.replace('<view><view', '<view v-for="outer in rows"><view'),
    component.replace('<view v-for', '<OtherComponent v-for').replace(' /></view>', ' /></view>'),
    component.replace(':id="option.id"', ':id="option.id" v-bind="extra"'),
    component.replace(':id="option.id"', ':id.prop="option.id"'),
    component.replace(':id="option.id"', 'id="overwritten" :id="option.id"'),
    component.replace('<view><view', '<slot><view').replace('/></view>', '/></slot>'),
    component.replace('options: readonly', 'other: readonly'),
    component.replace('defineProps', 'const options = []; defineProps'),
    component.replace('defineProps', 'const { options } = { options: [] }; defineProps'),
    component.replace('defineProps', 'import { options } from "./other"; defineProps'),
    component.replace('defineProps', 'function options() { return []; } defineProps'),
    component.replace('defineProps', 'class options {} defineProps'),
    component.replace('defineProps', 'enum options { Empty } defineProps'),
    component.replace('defineProps<{ options: readonly { id?: string }[] }>();', 'function unused() { return defineProps<{ options: readonly { id?: string }[] }>(); }'),
    component.replace('</view></template>', '<view v-for="otherOption in options" :id="otherOption.id" /></view></template>'),
    component.replace('</view></template>', '<view :id="options[0].id" /></view></template>'),
    component.replace(' :id="option.id" />', ' :id="option.id"><view :id="option.id" /></view>'),
  ]) {
    const result = projectGlassSegmentsIds(caller('const tabs = [{ id: "fake" }];'), shared);
    assert.deepEqual(result.ids, [], shared);
    assert.ok(result.unknown.length, shared);
  }
});

test("consumer conditions, loops and slot scopes cannot promise rendered IDs", () => {
  for (const template of ['<GlassSegments v-if="false" :options="tabs" />', '<view v-if="false"><GlassSegments :options="tabs" /></view>', '<GlassSegments v-for="row in rows" :options="tabs" />', '<Other><GlassSegments :options="tabs" /></Other>', '<slot><GlassSegments :options="tabs" /></slot>']) {
    assert.deepEqual(ids(caller('const tabs = [{ id: "fake" }];', template)), [], template);
  }
});

test("the shared component's default and named slot children cannot promise rendered IDs", () => {
  for (const template of [
    '<GlassSegments :options="outer"><GlassSegments :options="tabs" /></GlassSegments>',
    '<GlassSegments :options="outer"><template #option><GlassSegments :options="tabs" /></template></GlassSegments>',
  ]) {
    assert.deepEqual(ids(caller('const outer = []; const tabs = [{ id: "not-rendered" }];', template)), [], template);
  }
});

test("template references beyond actual options bindings may mutate the IDs", () => {
  for (const template of [
    '<view @click="tabs[0].id = \'changed\'"><GlassSegments :options="tabs" /></view>',
    '<view :foo="tabs.pop()"><GlassSegments :options="tabs" /></view>',
    '<view>{{ tabs.pop() }}<GlassSegments :options="tabs" /></view>',
    '<GlassSegments :options="tabs" @select="tabs.pop(); done()" />',
  ]) {
    const result = projectGlassSegmentsIds(caller('const tabs = [{ id: "fake" }];', template), component);
    assert.deepEqual(result.ids, [], template);
    assert.ok(result.unknown.length, template);
  }
});

test("malformed SFC or script input fails closed", () => {
  assert.deepEqual(ids(caller('const tabs = [{ id: "fake" }];').replace('const tabs =', 'const =')), []);
  assert.deepEqual(ids(caller('const tabs = [{ id: "fake" }];').replace('</template>', '')), []);
});
