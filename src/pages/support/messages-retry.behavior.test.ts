import { expect, it, vi } from 'vitest';
import { ref } from 'vue';
import ts from 'typescript';
import { parse } from '@vue/compiler-sfc';
import source from './messages.vue?raw';

it('serializes user retries and an obsolete completion cannot unlock a new scope', async () => {
  const script = parse(source).descriptor.scriptSetup!.content;
  const ast = ts.createSourceFile('inbox.ts', script, ts.ScriptTarget.Latest, true);
  const names = ['inboxVisible', 'retrying', 'retryGeneration', 'cancelRetry', 'retryConversations'];
  const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node)
    ? names.includes(node.name?.text ?? '') : ts.isVariableStatement(node)
      && node.declarationList.declarations.some(item => names.includes(item.name.getText(ast))));
  const compiled = ts.transpileModule(declarations.map(node => node.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const finishes: Array<() => void> = [];
  const refreshInbox = vi.fn(() => new Promise<void>(resolve => finishes.push(resolve)));
  const store = { loading: false, categoryLoading: false, realtimeFallback: true, stopRealtime: vi.fn(), startRealtime: vi.fn() };
  const page = new Function('ref', 'convStore', 'refreshInbox', `${compiled};return {retrying,cancelRetry,retryConversations,setVisible(value){inboxVisible=value;}};`)(ref, store, refreshInbox);
  await page.retryConversations(); expect(refreshInbox).not.toHaveBeenCalled();
  page.setVisible(true); await page.retryConversations({ repeat: true }); expect(refreshInbox).not.toHaveBeenCalled();
  const first = page.retryConversations(); await page.retryConversations();
  expect(refreshInbox).toHaveBeenCalledTimes(1); expect(store.stopRealtime).toHaveBeenCalledTimes(1);
  page.cancelRetry(); const current = page.retryConversations();
  expect(refreshInbox).toHaveBeenCalledTimes(2);
  finishes[0](); await first; expect(page.retrying.value).toBe(true);
  await page.retryConversations(); expect(refreshInbox).toHaveBeenCalledTimes(2);
  finishes[1](); await current; expect(page.retrying.value).toBe(false);
  store.loading = true; await page.retryConversations(); expect(refreshInbox).toHaveBeenCalledTimes(2);
});
