import Foundation
import UIKit
import UserNotifications

public final class NativePushBridge: NSObject, UNUserNotificationCenterDelegate {
    private static let shared = NativePushBridge()
    private var previous: UNUserNotificationCenterDelegate?
    private var callback: ((String) -> Void)?
    private var enabled = false
    private var token: String?
    private var waiters: [UUID: (String) -> Void] = [:]
    private var generation = 0
    private var seen = Set<String>()
    private let pendingKey = "uvel.nativePush.pendingClicks"

    private static func json(_ value: [String: Any]) -> String {
        let data = try! JSONSerialization.data(withJSONObject: value)
        return String(data: data, encoding: .utf8)!
    }
    private static func failure(_ code: String) -> String { json(["available": false, "provider": "APNS", "code": code]) }
    private func event(_ value: [String: Any]) {
        var event = value
        event["provider"] = "APNS"
        callback?(Self.json(event))
    }
    private static func id(_ info: [AnyHashable: Any]) -> String? {
        guard let id = info["notificationId"] as? String,
              id.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else { return nil }
        return id
    }
    public static func install() {
        let center = UNUserNotificationCenter.current()
        if center.delegate !== shared {
            shared.previous = center.delegate
            center.delegate = shared
        }
    }
    public static func launchId(_ id: String) { shared.click(["notificationId": id]) }
    public static func startRegistration() {
        DispatchQueue.main.async {
            install()
            if !shared.enabled { shared.generation += 1 }
            shared.enabled = true
            let epoch = shared.generation
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                DispatchQueue.main.async {
                    guard shared.enabled && shared.generation == epoch else { return }
                    if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
                        UIApplication.shared.registerForRemoteNotifications()
                    } else { shared.complete(failure("PERMISSION_REQUIRED")) }
                }
            }
        }
    }
    public static func permission(_ callback: @escaping (String) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let value: String
            switch settings.authorizationStatus {
            case .authorized, .provisional: value = "granted"
            case .denied: value = "denied"
            case .notDetermined: value = "prompt"
            default: value = "unknown"
            }
            DispatchQueue.main.async { callback(json(["permission": value])) }
        }
    }
    public static func requestPermission(_ callback: @escaping (String) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, error in
            if error != nil { DispatchQueue.main.async { callback(json(["permission": "unknown"])) }; return }
            DispatchQueue.main.async {
                permission { result in
                    if shared.enabled,
                       let data = result.data(using: .utf8),
                       let value = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                       value["permission"] == "granted" {
                        UIApplication.shared.registerForRemoteNotifications()
                    }
                    callback(result)
                }
            }
        }
    }
    public static func getToken(_ callback: @escaping (String) -> Void) {
        DispatchQueue.main.async {
            guard shared.enabled else { callback(failure("NOT_INITIALIZED")); return }
            if let token = shared.token { callback(json(["available": true, "provider": "APNS", "token": token])); return }
            let id = UUID()
            let epoch = shared.generation
            shared.waiters[id] = callback
            // Registration may complete after the first JS read; keep every read until native callback/timeout.
            DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
                if shared.generation == epoch, let waiter = shared.waiters.removeValue(forKey: id) {
                    waiter(failure("TOKEN_UNAVAILABLE"))
                }
            }
        }
    }
    private func complete(_ value: String) {
        let callbacks = waiters
        waiters.removeAll()
        callbacks.values.forEach { $0(value) }
    }
    public static func registered(_ data: Data) {
        DispatchQueue.main.async {
            guard shared.enabled else { return }
            let token = data.map { String(format: "%02x", $0) }.joined()
            let changed = shared.token != token
            shared.token = token
            shared.complete(json(["available": true, "provider": "APNS", "token": token]))
            if changed { shared.event(["type": "token", "token": token]) }
        }
    }
    public static func registrationFailed() {
        DispatchQueue.main.async {
            shared.complete(failure("APNS_REGISTRATION_FAILED"))
            if shared.enabled { shared.event(["type": "error", "code": "APNS_REGISTRATION_FAILED"]) }
        }
    }
    public static func listen(_ callback: @escaping (String) -> Void) {
        DispatchQueue.main.async {
            shared.callback = callback
            let pending = UserDefaults.standard.stringArray(forKey: shared.pendingKey) ?? []
            UserDefaults.standard.removeObject(forKey: shared.pendingKey)
            pending.forEach { shared.event(["type": "click", "notificationId": $0]) }
        }
    }
    public static func unlisten() { DispatchQueue.main.async { shared.callback = nil } }
    public static func initial(_ callback: @escaping (String) -> Void) {
        DispatchQueue.main.async {
            var pending = UserDefaults.standard.stringArray(forKey: shared.pendingKey) ?? []
            guard !pending.isEmpty else { callback("{}"); return }
            let id = pending.removeFirst()
            UserDefaults.standard.set(pending, forKey: shared.pendingKey)
            callback(json(["notificationId": id]))
        }
    }
    public static func shutdown() {
        DispatchQueue.main.async {
            shared.enabled = false
            shared.generation += 1
            shared.token = nil
            shared.complete(failure("SESSION_CHANGED"))
            UserDefaults.standard.removeObject(forKey: shared.pendingKey)
            UIApplication.shared.unregisterForRemoteNotifications()
            UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        }
    }
    private func click(_ info: [AnyHashable: Any]) {
        guard let id = Self.id(info), seen.insert(id).inserted else { return }
        if seen.count > 128 { seen = [id] }
        if callback != nil { event(["type": "click", "notificationId": id]) }
        else {
            var pending = UserDefaults.standard.stringArray(forKey: pendingKey) ?? []
            if pending.count < 32 { pending.append(id) }
            UserDefaults.standard.set(pending, forKey: pendingKey)
        }
    }
    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                       withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        guard let id = Self.id(notification.request.content.userInfo) else {
            if let previous = previous, previous.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
                previous.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
            } else { completionHandler([]) }
            return
        }
        if enabled { event(["type": "received", "notificationId": id]) }
        // Server APNs payload contains generic copy; no duplicate local notification is created.
        let options: UNNotificationPresentationOptions = enabled ? [.alert, .sound] : []
        if let previous = previous, previous.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
            previous.userNotificationCenter?(center, willPresent: notification) { other in completionHandler(options.union(other)) }
        } else { completionHandler(options) }
    }
    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                       withCompletionHandler completionHandler: @escaping () -> Void) {
        if response.actionIdentifier != UNNotificationDismissActionIdentifier { click(response.notification.request.content.userInfo) }
        if let previous = previous, previous.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
            previous.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
        } else { completionHandler() }
    }
    public override func responds(to selector: Selector!) -> Bool { super.responds(to: selector) || (previous?.responds(to: selector) ?? false) }
    public override func forwardingTarget(for selector: Selector!) -> Any? {
        if previous?.responds(to: selector) == true { return previous }
        return super.forwardingTarget(for: selector)
    }
}
