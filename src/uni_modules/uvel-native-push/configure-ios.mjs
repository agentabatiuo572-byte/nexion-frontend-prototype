import { writeFileSync } from 'node:fs'

const environment = process.argv[2]
if (!['development', 'production'].includes(environment)) throw new Error('Select development or production to match the Apple provisioning profile aps-environment')
writeFileSync(new URL('./utssdk/app-ios/UTS.entitlements', import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>aps-environment</key><string>${environment}</string></dict></plist>
`)
console.log('APNs entitlement selected; verify the signed app entitlement, provisioning profile, backend APNs environment and topic before delivery testing.')
