import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import JSON5 from 'json5'
import { firebaseResources } from '../configure-android.mjs'

const client = (pkg, appId) => ({ client_info: { android_client_info: { package_name: pkg }, mobilesdk_app_id: appId }, api_key: [{ current_key: 'public-key' }] })
const configuration = {
  project_info: { project_number: '123456', project_id: 'test-project' },
  client: [client('com.example.other', 'other-app'), client('com.example.target', 'target-app')],
  private_key: 'must-never-be-in-native-resources',
}
test('selects the exact signed package and exports only four public Firebase resource values', () => {
  const xml = firebaseResources(configuration, 'com.example.target')
  assert.match(xml, />target-app</)
  assert.match(xml, /name="gcm_defaultSenderId"[^>]*>123456</)
  assert.equal((xml.match(/<string /g) ?? []).length, 4)
  assert.doesNotMatch(xml, /other-app|must-never-be-in-native-resources|private_key/)
})
test('missing, ambiguous, or incomplete Firebase client fails before writing a configured build', () => {
  assert.throws(() => firebaseResources(configuration, 'com.example.missing'), /Exactly one/)
  assert.throws(() => firebaseResources({ ...configuration, client: [client('same', 'one'), client('same', 'two')] }, 'same'), /Exactly one/)
  assert.throws(() => firebaseResources({ ...configuration, project_info: {} }, 'com.example.target'), /incomplete/)
})

test('declares the Google Play services API used for the real GMS availability preflight', () => {
  const native = readFileSync(new URL('../utssdk/app-android/NativePushBridge.kt', import.meta.url), 'utf8')
  const config = JSON.parse(readFileSync(new URL('../utssdk/app-android/config.json', import.meta.url), 'utf8'))
  assert.match(native, /import com\.google\.android\.gms\.common\.GoogleApiAvailability/)
  assert.ok(config.dependencies.includes('com.google.android.gms:play-services-base:18.1.0'))
})

test('targets Android 13 permission control while retaining the native SDK minimum', () => {
  const manifest = JSON5.parse(readFileSync(new URL('../../../manifest.json', import.meta.url), 'utf8'))
  const android = manifest['app-plus'].distribute.android
  assert.equal(android.minSdkVersion, 23)
  assert.ok(android.targetSdkVersion >= 33)
  assert.ok(android.permissions.includes('<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>'))
})

test('retains the classic iOS APNs hook packaging prerequisite without a cloud push provider', () => {
  const manifest = JSON5.parse(readFileSync(new URL('../../../manifest.json', import.meta.url), 'utf8'))
  assert.deepEqual(manifest['app-plus'].modules.Push, {})
  assert.equal(manifest['app-plus'].distribute.ios.pushRegisterMode, 'manual')
  assert.equal(manifest['app-plus'].distribute.android.pushRegisterMode, 'manual')
  assert.equal(manifest['app-plus'].distribute.sdkConfigs?.push, undefined)
  const entitlement = readFileSync(new URL('../utssdk/app-ios/UTS.entitlements', import.meta.url), 'utf8')
  assert.match(entitlement, /<key>aps-environment<\/key>\s*<string>production<\/string>/)
})
