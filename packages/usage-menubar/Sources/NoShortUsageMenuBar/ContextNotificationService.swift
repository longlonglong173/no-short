import Foundation
import UserNotifications
import UsageCore

@MainActor final class ContextNotificationService: NSObject, UNUserNotificationCenterDelegate {
    private let center = UNUserNotificationCenter.current()
    override init() {
        super.init()
        center.delegate = self
    }
    func authorize() async throws -> Bool {
        // Xcode 16.2's SDK does not mark UNNotificationSettings Sendable.
        // Read it inside the callback and move only its scalar status to MainActor.
        let rawStatus: Int = await withCheckedContinuation { continuation in
            center.getNotificationSettings { settings in
                continuation.resume(returning:settings.authorizationStatus.rawValue)
            }
        }
        let status = UNAuthorizationStatus(rawValue:rawStatus)
        if status == .notDetermined {
            return try await withCheckedThrowingContinuation { continuation in
                center.requestAuthorization(options:[.alert,.sound]) { granted, error in
                    if let error { continuation.resume(throwing:error) }
                    else { continuation.resume(returning:granted) }
                }
            }
        }
        return status == .authorized || status == .provisional
    }
    func send(_ alert: UsagePanelModel.ContextAlert) async throws {
        let content = UNMutableNotificationContent()
        content.title = AppLocalization(language: alert.language).text("Cảnh báo context · %@", alert.provider.title)
        content.body = alert.message
        content.sound = .default
        // No prompt, session title or transcript content enters notifications.
        let request = UNNotificationRequest(identifier:UUID().uuidString,content:content,trigger:nil)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
            center.add(request) { error in
                if let error { continuation.resume(throwing:error) }
                else { continuation.resume(returning:()) }
            }
        }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner,.sound])
    }
}
