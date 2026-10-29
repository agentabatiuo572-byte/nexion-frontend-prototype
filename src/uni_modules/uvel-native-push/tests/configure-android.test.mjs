import assert from 'node:assert/strict'
import test from 'node:test'
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
