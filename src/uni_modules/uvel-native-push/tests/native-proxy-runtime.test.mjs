import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

// Run against the installed classic uni-app runtime and the actual compiler output,
// not a mock implementation of the UTS callback-retention mechanism.
const runtime = readFileSync(process.env.UVEL_UTS_RUNTIME_PATH, 'utf8')
const generated = readFileSync(process.env.UVEL_UTS_GENERATED_PROXY_PATH, 'utf8')
const needed = new Set(['toRaw', 'enterStack', 'normalizeArg', 'getProxy', 'resolveSyncResult',
  'isUniElement', 'parseElement', 'isComponentPublicInstance',
  'initProxyFunction', 'initUTSStaticMethod', 'isUTSAndroid', 'isUTSiOS', 'initUTSPackageName', 'initUTSIndexClassName', 'initUTSClassName'])
const ast = ts.createSourceFile('uni.runtime.esm.js', runtime, ts.ScriptTarget.Latest, true)
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && needed.has(node.name?.text)).map(node => node.getText(ast)).join('\n')

function load({ missing = false, keepAlive = true } = {}) {
  let nativeCalls = 0, invokeCallback, callbackId
  const errors = []
  const uni = { requireNativePlugin() {
    nativeCalls++
    return { invokeSync(args, callback) {
      if (missing) return { errMsg: 'Native UVEL plugin class is absent from this base' }
      callbackId = args.params[0]; invokeCallback = callback
      return { params: 1 }
    } }
  } }
  const source = keepAlive ? generated : generated.replace('keepAlive: true', 'keepAlive: false')
  new Function('uni', 'plus', 'process', 'console', 'isArray', 'isString', 'isPlainObject', 'extend', `
    let callbackId = 1, proxy; const keepAliveCallbacks = {}, SKIP_CIRCULAR_REFERENCE = {};
    ${helpers}
    Object.assign(uni, { initUTSProxyFunction: initUTSStaticMethod, initUTSPackageName, initUTSIndexClassName, initUTSClassName });
  `)(uni, { os: { name: 'Android' } }, { env: { NODE_ENV: 'production' } }, { error: value => errors.push(value) }, Array.isArray,
    value => typeof value === 'string', value => Object.getPrototypeOf(value) === Object.prototype, Object.assign)
  const api = new Function('uni', source.replaceAll('export const ', 'const ') + '\nreturn { addNativePushListener, initializeNativePush };')(uni)
  return { api, errors, nativeCalls: () => nativeCalls,
    emit(event) { invokeCallback({ id: callbackId, name: 'callback', params: [event] }) } }
}

test('generated UTS import is lazy; absent native class fails only on guarded invocation', () => {
  const harness = load({ missing: true })
  assert.equal(harness.nativeCalls(), 0)
  assert.throws(() => harness.api.initializeNativePush({}), /absent from this base/)
  assert.equal(harness.nativeCalls(), 1)
})
test('actual generated listener retains token, receive and click callbacks across repeated native events', () => {
  assert.match(generated, /name: 'addNativePushListenerByJs', keepAlive: true/)
  const harness = load(), received = []
  harness.api.addNativePushListener(event => received.push(event.type))
  for (const type of ['token', 'received', 'click']) harness.emit({ type, notificationId: 'note-1' })
  assert.deepEqual(received, ['token', 'received', 'click'])
  assert.deepEqual(harness.errors, [])
})
test('same owning runtime reproduces the former one-shot failure when keepAlive metadata is absent', () => {
  const harness = load({ keepAlive: false }), received = []
  harness.api.addNativePushListener(event => received.push(event.type))
  for (const type of ['token', 'received', 'click']) harness.emit({ type })
  assert.deepEqual(received, ['token'])
  assert.equal(harness.errors.length, 2)
})
