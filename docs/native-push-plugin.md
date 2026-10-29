# Direct native push SDK

`src/uni_modules/uvel-native-push` is a repository-owned UTS API plugin for the existing classic uni-app Vue3 application. It uses Firebase Messaging on Android and Apple APNs on iOS; the DCloud application remains international `UVELProduction` (`__UNI__G77FFD9D`). It does not require a UniPush application, CID, marketplace plugin, or cloud-function relay.

Source integration is not a signed native package or delivery acceptance. A custom native base / release package must include this plugin, its manifest, dependencies, resources, and iOS hook. A stock HBuilder debug base that predates the plugin cannot receive these messages.

## Contract and lifecycle

Import from `@/uni_modules/uvel-native-push` inside `APP-PLUS` compilation. `initializeNativePush({})` enables SDK token registration after successful login, registration consent, and notification permission. It never requests permission itself. `requestNativePushPermission(callback)` is the explicit iOS authorization request; Android keeps the existing JS runtime permission adapter. `getNativePushPermission(callback)` reads current native state.

`getNativePushToken(callback)` returns `{available, provider: 'FCM'|'APNS', token?, code?}`. Failure never returns a CID or synthetic token. iOS reads wait for registration success/failure (up to 20 seconds), so a token arriving after initial JS reads still reaches the caller and token listener. Tokens are never logged. `addNativePushListener(callback)` returns a numeric listener ID; `removeNativePushListener(id)` removes it. Events contain `type: token|received|click|error`, provider, and only the appropriate token, notificationId, or diagnostic code. Token reads do not emit refresh events.

Attach listeners at app startup to capture notification clicks; authorization and SDK initialization remain login gated. The native click queue retains notification IDs until JS is ready, including cold startup. `getInitialNotification(callback)` consumes a pending click or returns `{}`. Classic uni-app Android does not expose a supported UTS `onNewIntent` hook: invoke this method at startup, every app resume, and JS `plus.globalEvent` `newintent`. It inspects/removes the current launcher intent `notificationId`. The plugin's foreground notification click uses a private native trampoline Activity. Use the existing JS dedupe and server current-account authorization before opening any notification.

Invoke `shutdownNativePush()` when logout, identity invalidation, or permission withdrawal disables registration. It disables Android auto-init, suppresses stale in-flight reads, clears native pending clicks/delivered notifications, and unregisters APNs. Server installation/session ownership remains authoritative; disabling auto-init alone does not revoke a server installation.

## Android public configuration and packaging

The Firebase application must match the actual signed Android package. Do not infer that package from the DCloud app ID. Obtain the project's official `google-services.json` and run:

```powershell
node src/uni_modules/uvel-native-push/configure-android.mjs <google-services.json> <exact-signed-android-package>
```

This copies only four public Firebase client values to `utssdk/app-android/res/values/uvel-firebase.xml`: `google_app_id`, `google_api_key`, `gcm_defaultSenderId`, and `project_id`. This is equivalent to the Google Services plugin's resource generation, without requiring a Gradle project modification. No service-account JSON, OAuth private key, or server credential belongs in the app. Blank defaults intentionally produce `CONFIG_MISSING`. FirebaseInitProvider loads these resources in a cold process so background system notifications work; JS-only FirebaseOptions initialization would not cover that path.

`config.json` pins official Maven `com.google.firebase:firebase-messaging:24.1.2`, using the established getToken/onNewToken API and no discontinued KTX module. The plugin requires Android API 23+, Google Play services, and network access to Firebase; a non-GMS device returns `GMS_UNAVAILABLE`. Later Firebase 25+/26+ change minimum platform/API behavior, so updating the pin requires native regression. Firebase analytics and automatic messaging initialization are disabled in manifest defaults; explicit post-login initialization enables messaging auto-init. Verify the merged manifest contains these defaults and the private `UvelMessagingService`.

The backend sends notification+data with generic translated lockscreen text, `data.notificationId`, and channel `uvel_notifications`. Android FCM displays the background system alert. The service creates one generic local system notification in foreground, using stable notification tags and per-notification PendingIntent URI identity with immutable/update-current flags. Data-only delivery is not supported. No amount, business body, or sensitive payload is copied to JS.

## iOS entitlement and packaging

Use the real signed Bundle ID, correct Apple team, Push Notifications capability, and a provisioning profile containing APNs. Select the entitlement that matches that profile before building:

```powershell
node src/uni_modules/uvel-native-push/configure-ios.mjs development
# Or production for the corresponding distribution profile / APNs production endpoint.
```

This writes the plugin's `utssdk/app-ios/UTS.entitlements` with the selected `aps-environment`; the default source deliberately does not guess an environment. Development signing uses APNs sandbox; TestFlight/App Store distribution uses production. The server topic must equal the signed Bundle ID, and server APNs environment must match the signed entitlement. `.p8`, Team ID/Key ID credentials, and signing secrets are server/build configuration, never JS/native assets.

The exported `UTSiOSHookProxy` receives launch options and APNs registration callbacks in classic uni-app (documented since HBuilderX 3.97). `UNUserNotificationCenter` handles foreground alerts and notification responses, including cold-start capture; the plugin retains/chains an existing delegate and forwards optional selectors. It creates no duplicate local iOS alert. Verify the hook class is registered in generated iOS sources and no later plugin replaces the notification-center delegate. A replaced delegate requires chaining by that plugin as well.

## Verification and remaining acceptance

Run `node --test src/uni_modules/uvel-native-push/tests/configure-android.test.mjs`. This checks exact package selection, incomplete/ambiguous configuration failure, and exclusion of private fields. It does not prove native compilation or delivery. Required device checks are D01–D05/D14–D15 in the task test plan: native token, rotation, denied/restored permission, foreground/background/cold click, several pending notifications, logout/account changes, GMS/config failure, and correct signed environment. Inspect APK manifest/dependency artifacts and signed iOS entitlements separately from JS/H5 builds.

Primary references: [UTS API plugins / classic uni-app](https://uniapp.dcloud.net.cn/plugin/uts-plugin.html), [Kotlin/Swift mixed sources](https://uniapp.dcloud.net.cn/plugin/uts-plugin-hybrid.html), [Android resources and dependencies](https://uniapp.dcloud.net.cn/plugin/uts-for-android.html), [iOS hooks compatibility](https://doc.dcloud.net.cn/uni-app-x/uts/utsioshookproxy.html), [iOS entitlements](https://uniapp.dcloud.net.cn/plugin/uts-for-ios.html), [Firebase Android setup](https://firebase.google.com/docs/cloud-messaging/android/get-started), [Firebase receive behavior](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [official Firebase Messaging changelog](https://github.com/firebase/firebase-android-sdk/blob/main/firebase-messaging/CHANGELOG.md).
