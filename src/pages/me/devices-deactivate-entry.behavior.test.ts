import { expect, it, vi } from 'vitest';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import source from './devices.vue?raw';

const script = parse(source).descriptor.scriptSetup!.content;
const ast = ts.createSourceFile('devices.ts', script, ts.ScriptTarget.Latest, true);
const entries = ast.statements.filter(statement =>
  ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d => d.name.getText(ast) === 'deactivateRequest')
  || ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
    && ['onLoad', 'onUnload'].includes(statement.expression.expression.getText(ast)));
const code = ts.transpileModule(entries.map(statement => statement.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function page() {
  let load!: (options: Record<string, string>) => Promise<void>, unload!: () => void;
  const device = { id: '41', activatedAt: 100, currentTask: { id: 'running' } };
  const app = { accountKey: 'account-a', visibleDevices: [device] };
  const refresh = vi.fn(async () => true), confirm = vi.fn();
  const deps = {
    onLoad: (callback: typeof load) => { load = callback; }, onUnload: (callback: typeof unload) => { unload = callback; },
    app, remoteApiEnabled: true, takeNavigationQuery: () => '',
    captureAccountScope: () => app.accountKey, isCurrentAccountScope: (owner: string) => owner === app.accountKey,
    refreshRemoteFleetAfterCatalog: refresh, handleDeactivate: confirm,
  };
  new Function(...Object.keys(deps), code)(...Object.values(deps));
  return { app, device, refresh, confirm, load: (query: Record<string, string>) => load(query), unload: () => unload() };
}

it('rereads owned devices and delegates to the existing task-aware confirmation', async () => {
  const p = page(), before = JSON.stringify(p.device);
  await p.load({ deactivate: '41' });
  expect(p.refresh).toHaveBeenCalledExactlyOnceWith('account-a');
  expect(p.confirm).toHaveBeenCalledExactlyOnceWith(p.device);
  expect(JSON.stringify(p.device)).toBe(before);
});

it('does not open a confirmation for ordinary inventory visits or unknown devices', async () => {
  const p = page();
  await p.load({}); expect(p.refresh).not.toHaveBeenCalled();
  await p.load({ deactivate: 'other-account-device' }); expect(p.confirm).not.toHaveBeenCalled();
});

it.each(['failed', 'account-switch', 'unload', 'inactive'])('discards a %s deactivation entry', async mode => {
  const p = page();
  p.refresh.mockImplementation(async () => {
    if (mode === 'account-switch') p.app.accountKey = 'account-b';
    if (mode === 'unload') p.unload();
    if (mode === 'inactive') p.device.activatedAt = null as unknown as number;
    return mode !== 'failed';
  });
  await p.load({ deactivate: '41' });
  expect(p.confirm).not.toHaveBeenCalled();
});
