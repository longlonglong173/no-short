import Foundation
import Combine
import UsageCore

@MainActor protocol InsightNotificationSending {
    func authorize() async throws -> Bool
    func isAuthorized() async -> Bool
    func sendAnomaly(_ result: UsageInsightsResult, language: AppLanguage) async throws
}
@MainActor final class InsightsController: ObservableObject {
    private struct Configuration: Codable {
        let anomalyEnabled, scenarioEnabled, notificationsEnabled: Bool
        let provider: String
    }
    @Published private(set) var anomalyEnabled = false
    @Published private(set) var scenarioEnabled = false
    @Published private(set) var notificationsEnabled = false
    @Published private(set) var provider = "all"
    @Published private(set) var result: UsageInsightsResult?
    @Published private(set) var notificationNotice: String?
    var onChange: (() -> Void)?
    private let defaults: UserDefaults, notifications: any InsightNotificationSending, now: () -> Date
    private var snapshot: UsageSnapshot?, source = "", isStale = false, delivering = false
    private var tracker = UsageAnomalyTracker()
    private var failedKey: String?, denied = false, authorizationFailed = false
    private let configurationKey = "usageInsightsConfigurationV1", trackerKey = "usageAnomalyTrackerV1"
    init(defaults: UserDefaults, notifications: any InsightNotificationSending, now: @escaping () -> Date = { Date() }) {
        self.defaults = defaults; self.notifications = notifications; self.now = now
        if let data = defaults.data(forKey: configurationKey), let c = try? JSONDecoder().decode(Configuration.self, from: data), ["all", "codex", "claude"].contains(c.provider) {
            anomalyEnabled = c.anomalyEnabled; scenarioEnabled = c.scenarioEnabled; notificationsEnabled = c.notificationsEnabled; provider = c.provider
        }
        if let data = defaults.data(forKey: trackerKey), let t = try? JSONDecoder().decode(UsageAnomalyTracker.self, from: data) { tracker = t }
    }
    func apply(anomalyEnabled: Bool, scenarioEnabled: Bool, notificationsEnabled: Bool, provider: String) {
        guard ["all", "codex", "claude"].contains(provider) else { return }
        self.anomalyEnabled = anomalyEnabled; self.scenarioEnabled = scenarioEnabled
        self.notificationsEnabled = notificationsEnabled; self.provider = provider
        let config = Configuration(anomalyEnabled: anomalyEnabled, scenarioEnabled: scenarioEnabled, notificationsEnabled: notificationsEnabled, provider: provider)
        if let data = try? JSONEncoder().encode(config) { defaults.set(data, forKey: configurationKey) }
        if !notificationsEnabled || !anomalyEnabled { denied = false; failedKey = nil; authorizationFailed = false }
        reevaluate(); onChange?()
    }
    func update(snapshot: UsageSnapshot?, source: String, isStale: Bool) {
        self.snapshot = snapshot; self.source = source; self.isStale = isStale; reevaluate()
    }
    private var key: String { [source, snapshot?.timeZone ?? "", provider, result?.today ?? ""].joined(separator: "\u{0}") }
    private func reevaluate() {
        result = (anomalyEnabled || scenarioEnabled) ? snapshot.map { UsageInsights.evaluate($0, provider: provider, now: now(), isStale: isStale) } : nil
        if failedKey != key { failedKey = nil }
        publishNotice()
    }
    private func publishNotice() {
        let next: String? = denied ? "Thông báo bất thường chưa được cho phép. Cảnh báo trong app vẫn hoạt động." :
            failedKey != nil || authorizationFailed ? "Không gửi được thông báo bất thường. Cảnh báo trong app vẫn hoạt động." : nil
        guard next != notificationNotice else { return }
        notificationNotice = next; onChange?()
    }
    /// Only settings Save changing the explicit notification toggle from off to on invokes this.
    func authorizeFromExplicitEnable() async {
        guard notificationsEnabled else { return }
        do { denied = !(try await notifications.authorize()); authorizationFailed = false }
        catch { authorizationFailed = true; denied = false }
        publishNotice()
    }
    func deliverIfNeeded(language: AppLanguage) async {
        guard anomalyEnabled, notificationsEnabled, !delivering else { return }
        delivering = true; defer { delivering = false }
        reevaluate()
        let requestedKey = key
        let allowed = await notifications.isAuthorized()
        guard anomalyEnabled, notificationsEnabled, key == requestedKey else { return }
        denied = !allowed; if allowed { authorizationFailed = false }; publishNotice()
        guard allowed else { return }
        reevaluate()
        guard key == requestedKey, let result, result.anomaly == true, let snapshot else { return }
        guard tracker.consume(source: source, timeZone: snapshot.timeZone, provider: provider, day: result.today) else { return }
        if let data = try? JSONEncoder().encode(tracker) { defaults.set(data, forKey: trackerKey) }
        do { try await notifications.sendAnomaly(result, language: language) }
        catch { if key == requestedKey { failedKey = requestedKey } }
        publishNotice()
    }
}
