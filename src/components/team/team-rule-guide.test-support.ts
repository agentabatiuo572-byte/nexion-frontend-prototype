import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { teamRuleGuideCopy } from './team-rule-guide-copy';

const sources = import.meta.glob('./team-rule-*.vue', { eager: true, query: '?raw', import: 'default' });
export function ruleComponent(name: string, dependencies: Record<string, unknown> = {}) {
  const compiled = compileScript(parse(sources[`./${name}.vue`] as string).descriptor, { id: name, inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => ['view', 'text'].includes(tag) } } });
  const code = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = { default: {} as Vue.Component };
  new Function('require', 'exports', code)((id: string) => {
    if (id === 'vue') return Vue;
    if (id === './team-rule-guide-copy') return { teamRuleGuideCopy };
    if (!(id in dependencies)) throw new Error(`Missing rule guide dependency: ${id}`);
    return dependencies[id];
  }, exports);
  return exports;
}
export const ruleSection = ruleComponent('team-rule-section');
export const ruleDocument = ruleComponent('team-rule-document', { './team-rule-section.vue': ruleSection });
export const ruleHero = ruleComponent('team-rule-hero', {
  '@/components/team/team-art.vue': { default: Vue.defineComponent({ props: ['kind', 'size'], setup: props => () => Vue.h('art', props) }) },
});
