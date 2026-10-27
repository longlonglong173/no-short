import Foundation
import UserNotifications
import UsageCore

@MainActor final class ContextNotificationService: NSObject, UNUserNotificationCenterDelegate, BudgetNotificationSending, InsightNotificationSending {
    private let center = UNUserNotificationCenter.current()
    override init() {
        super.init()
        center.delegate = self
    }
    private func authorizationStatus() async -> Int {
        // Xcode 16.2's SDK does not mark UNNotificationSettings Sendable.
        // Read it inside the callback and move only its scalar status to MainActor.
        let rawStatus: Int = await withCheckedContinuation { continuation in
            center.getNotificationSettings { settings in
                continuation.resume(returning:settings.authorizationStatus.rawValue)
            }
        }
        return rawStatus
    }
    func isAuthorized() async -> Bool {
        let status = UNAuthorizationStatus(rawValue: await authorizationStatus())
        return status == .authorized || status == .provisional
    }
    func authorize() async throws -> Bool {
        let status = UNAuthorizationStatus(rawValue: await authorizationStatus())
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
        try await enqueue(content)
    }
    func sendBudget(_ reading: UsageBudgetReading, language: AppLanguage) async throws {
        let content = UNMutableNotificationContent()
        let provider = reading.rule.provider == "all" ? AppLocalization(language: language).text("Tất cả") : reading.rule.provider == "codex" ? "Codex" : "Claude Code"
        content.title = AppLocalization(language: language).text("Cảnh báo ngân sách · %@", provider)
        content.body = budgetReadingText(reading, language: language)
        content.sound = .default
        try await enqueue(content)
    }
    func sendAnomaly(_ result: UsageInsightsResult, language: AppLanguage) async throws {
        let content = UNMutableNotificationContent()
        let provider = result.provider == "all" ? AppLocalization(language: language).text("Tất cả") : result.provider == "codex" ? "Codex" : "Claude Code"
        content.title = AppLocalization(language: language).text("Cảnh báo mức dùng bất thường · %@", provider)
        content.body = UsageInsightCopy.anomaly(result, language: language) + " " + AppLocalization(language: language).text("Ước tính API · Không phải hóa đơn thuê bao")
        content.sound = .default
        try await enqueue(content)
    }
    private func enqueue(_ content: UNMutableNotificationContent) async throws {
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
