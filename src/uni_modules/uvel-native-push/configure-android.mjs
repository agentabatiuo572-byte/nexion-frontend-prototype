import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export function firebaseResources(config, packageName) {
  const clients = config.client?.filter(client => client.client_info?.android_client_info?.package_name === packageName) ?? []
  if (!packageName || clients.length !== 1) throw new Error('Exactly one Firebase Android client must match the signed application package')
  const values = {
    google_app_id: clients[0].client_info?.mobilesdk_app_id,
    google_api_key: clients[0].api_key?.[0]?.current_key,
    gcm_defaultSenderId: config.project_info?.project_number,
    project_id: config.project_info?.project_id,
  }
  if (Object.values(values).some(value => typeof value !== 'string' || !value)) throw new Error('Firebase public client configuration is incomplete')
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", "\\'")
  return '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n' + Object.entries(values)
    .map(([name, value]) => `  <string name="${name}" translatable="false">${escape(value)}</string>`).join('\n') + '\n</resources>\n'
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, packageName] = process.argv.slice(2)
  if (!input || !packageName) throw new Error('Usage: node configure-android.mjs /path/google-services.json signed.application.package')
  const xml = firebaseResources(JSON.parse(readFileSync(input, 'utf8')), packageName)
  writeFileSync(new URL('./utssdk/app-android/res/values/uvel-firebase.xml', import.meta.url), xml)
  console.log('Firebase public Android resources configured for the exact matched package; rebuild the custom native package.')
}
