import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { expect, it } from 'vitest';
import source from './payment-password-input.vue?raw';
import { zh } from '@/i18n/messages/zh';
import { fmt } from '@/i18n/format';

type Node = { tag: string; props: Record<string, unknown>; children: Node[]; parent: Node | null };
const node = (tag = ''): Node => ({ tag, props: {}, children: [], parent: null });
const renderer = Vue.createRenderer<Node, Node>({ createElement: tag => node(tag), createText: () => node(), createComment: () => node(),
  setText() {}, setElementText() {}, patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: target => target.parent, nextSibling: () => null,
  insert(target, parent) { target.parent = parent; parent.children.push(target); }, remove() {} });
const code = ts.transpileModule(compileScript(parse(source).descriptor, { id: 'actual-pin-input', inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => ['view', 'input', 'text'].includes(tag) } } }).content,
{ compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modules: Record<string, unknown> = { vue: Vue, '@/i18n/use-t': { useT: () => Vue.ref(zh) }, '@/i18n/format': { fmt } };
const exports = {} as { default: Vue.Component };
new Function('require', 'exports', code)((name: string) => { if (!(name in modules)) throw new Error(name); return modules[name]; }, exports);
const all = (root: Node): Node[] => [root, ...root.children.flatMap(all)];

it.each([{ props: {}, expected: true }, { props: { adjustPosition: false }, expected: false }])(
  'actual input keeps automatic positioning $expected for $props', ({ props, expected }) => {
    const root = node(), app = renderer.createApp(exports.default, { modelValue: '', label: 'PIN', ...props });
    app.mount(root);
    try { expect(all(root).find(target => target.tag === 'input')!.props['adjust-position']).toBe(expected); }
    finally { app.unmount(); }
  });
