import Foundation
import UserNotifications

@MainActor final class ContextNotificationService: NSObject, UNUserNotificationCenterDelegate {
    private let center = UNUserNotificationCenter.current()
    override init() {
        super.init()
        center.delegate = self
    }
    func authorize() async throws -> Bool {
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            return try await center.requestAuthorization(options:[.alert,.sound])
        }
        return settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
    }
    func send(_ alert: UsagePanelModel.ContextAlert) async throws {
        let content = UNMutableNotificationContent()
        content.title = "Cảnh báo context · \(alert.provider.title)"
        content.body = alert.message
        content.sound = .default
        // No prompt, session title or transcript content enters notifications.
        try await center.add(UNNotificationRequest(identifier:UUID().uuidString,content:content,trigger:nil))
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner,.sound])
    }
}
