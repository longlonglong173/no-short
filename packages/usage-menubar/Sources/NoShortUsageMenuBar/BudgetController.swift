import Foundation
import Combine
import UsageCore

@MainActor protocol BudgetNotificationSending {
    func authorize() async throws -> Bool
    func isAuthorized() async -> Bool
    func sendBudget(_ reading: UsageBudgetReading, language: AppLanguage) async throws
}

@MainActor final class BudgetController: ObservableObject {
    private struct Configuration: Codable { let rules: [UsageBudgetRule]; let notificationsEnabled: Bool }
    @Published private(set) var rules: [UsageBudgetRule] = []
    @Published private(set) var notificationsEnabled = false
    @Published private(set) var readings: [UsageBudgetReading] = []
    @Published private(set) var notificationNotice: String?
    var onChange: (() -> Void)?
    private let defaults: UserDefaults
    private let notifications: any BudgetNotificationSending
    private let now: () -> Date
    private var tracker = UsageBudgetTracker()
    private var failedPeriods = Set<String>()
    private var permissionDenied = false, authorizationFailed = false
    private var snapshot: UsageSnapshot?, source = "", isStale = false, delivering = false
    private let configurationKey = "usageBudgetConfigurationV1", trackerKey = "usageBudgetTrackerV1"
    init(defaults: UserDefaults, notifications: any BudgetNotificationSending, now: @escaping () -> Date = { Date() }) {
        self.defaults = defaults; self.notifications = notifications; self.now = now
        if let data = defaults.data(forKey: configurationKey), let value = try? JSONDecoder().decode(Configuration.self, from: data),
           (try? Self.validate(value.rules)) != nil {
            rules = value.rules; notificationsEnabled = value.notificationsEnabled
        }
        if let data = defaults.data(forKey: trackerKey), let value = try? JSONDecoder().decode(UsageBudgetTracker.self, from: data) { tracker = value }
    }
    private static func validate(_ rules: [UsageBudgetRule]) throws {
        guard Set(rules.map(\.id)).count == rules.count else { throw BudgetSettingsError.invalid }
        for rule in rules { _ = try UsageBudgetRule(provider: rule.provider, period: rule.period, limitUSD: rule.limitUSD) }
    }
    func apply(rules: [UsageBudgetRule], notificationsEnabled: Bool) throws {
        try Self.validate(rules)
        let data = try JSONEncoder().encode(Configuration(rules: rules, notificationsEnabled: notificationsEnabled))
        defaults.set(data, forKey: configurationKey)
        self.rules = rules; self.notificationsEnabled = notificationsEnabled
        if !notificationsEnabled || rules.isEmpty {
            failedPeriods.removeAll(); permissionDenied = false; authorizationFailed = false
        }
        reevaluate(); onChange?()
    }
    func update(snapshot: UsageSnapshot?, source: String, isStale: Bool) {
        if self.source != source { failedPeriods.removeAll() }
        self.snapshot = snapshot; self.source = source; self.isStale = isStale
        reevaluate()
    }
    private func failureKey(_ reading: UsageBudgetReading) -> String {
        [snapshot?.timeZone ?? "", reading.rule.id, reading.periodKey].joined(separator: "|")
    }
    private func reevaluate() {
        readings = UsageBudgets.evaluate(snapshot: snapshot, rules: rules, now: now(), isStale: isStale)
        failedPeriods.formIntersection(Set(readings.map(failureKey)))
        publishNotice()
    }
    private func publishNotice() {
        let text: String? = permissionDenied ? "Thông báo ngân sách chưa được cho phép. Cảnh báo trong app vẫn hoạt động." :
            (!failedPeriods.isEmpty || authorizationFailed) ? "Không gửi được thông báo ngân sách. Cảnh báo trong app vẫn hoạt động." : nil
        updateNotice(text)
    }

    /// Called only by a successful settings Save that explicitly changes notification opt-in to on.
    func authorizeFromExplicitEnable() async {
        guard notificationsEnabled else { return }
        do {
            permissionDenied = !(try await notifications.authorize())
            authorizationFailed = false
        } catch { authorizationFailed = true; permissionDenied = false }
        publishNotice()
    }
    func deliverIfNeeded(language: AppLanguage) async {
        guard notificationsEnabled, !delivering, !rules.isEmpty else { return }
        delivering = true; defer { delivering = false }
        let requestedSource = source
        let allowed = await notifications.isAuthorized()
        guard notificationsEnabled, source == requestedSource else { return }
        permissionDenied = !allowed
        if allowed { authorizationFailed = false }
        publishNotice()
        guard allowed else { return }
        reevaluate()
        let candidates = readings.filter(\.exceeded).map { $0.rule.id }
        for id in candidates {
            guard notificationsEnabled, source == requestedSource, let snapshot else { break }
            let fresh = UsageBudgets.evaluate(snapshot: snapshot, rules: rules, now: now(), isStale: isStale)
            guard let reading = fresh.first(where: { $0.rule.id == id && $0.exceeded }) else { continue }
            let events = tracker.consume([reading], source: source, timeZone: snapshot.timeZone)
            guard !events.isEmpty else { continue }
            // Persist before attempting delivery so restart/errors cannot spam the same period.
            if let data = try? JSONEncoder().encode(tracker) { defaults.set(data, forKey: trackerKey) }
            do { try await notifications.sendBudget(reading, language: language) }
            catch { if source == requestedSource { failedPeriods.insert(failureKey(reading)) } }
            publishNotice()
        }
    }
    private func updateNotice(_ text: String?) {
        guard notificationNotice != text else { return }
        notificationNotice = text; onChange?()
    }
}

func budgetReadingText(_ reading: UsageBudgetReading, language: AppLanguage) -> String {
    let l = AppLocalization(language: language)
    let provider = reading.rule.provider == "all" ? l.text("Tất cả") : reading.rule.provider == "codex" ? "Codex" : "Claude Code"
    let period = l.text(reading.rule.period == .day ? "Hôm nay" : "Tháng này")
    let state = !reading.available ? "Dữ liệu ngân sách chưa khả dụng" : reading.exceeded ? "Đạt/vượt ngân sách · Ước tính" :
        reading.uncertain ? "Thiếu giá · Chưa xác định trạng thái ngân sách" : "Dưới ngân sách · Ước tính"
    return l.text("%@ · %@: %@ / %@ USD · %@", provider, period, reading.cost.map(UsagePresentation.money) ?? "—", String(reading.rule.limitUSD), l.text(state))
}
