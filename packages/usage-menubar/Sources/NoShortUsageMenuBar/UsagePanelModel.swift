import Foundation
import Combine
import UsageCore

struct DailyCostPoint: Identifiable {
    let id, label: String
    let amount: Double?
    let cost: UsageCost
}

@MainActor final class UsagePanelModel: ObservableObject {
    @Published private(set) var snapshot: UsageSnapshot?
    @Published private(set) var source = ""
    @Published private(set) var isLoading = false
    @Published private(set) var isStale = false
    @Published private(set) var notice: String?
    @Published private(set) var loginState: LoginItemState = .notRegistered
    @Published private(set) var selectedSessionID: String?
    @Published private(set) var providerFilter = "codex"
    @Published private(set) var followedActivity: SessionActivity?
    @Published var connectionNotice: String?
    @Published private(set) var contextAlertThreshold = 70
    @Published private(set) var contextNotificationsEnabled = true
    private var contextAlertTracker = ContextAlertTracker()
    @Published private(set) var language: AppLanguage
    var onLanguageChange: (() -> Void)?
    func l(_ key: String, _ arguments: String...) -> String {
        AppLocalization(language: language).text(key, arguments: arguments)
    }
    func setLanguage(_ value: AppLanguage) {
        guard language != value else { return }
        language = value; defaults?.set(value.rawValue, forKey: "usageLanguage")
        onLanguageChange?()
    }
    private let defaults: UserDefaults?
    private var activities: [SessionActivity] = []
    private var activityNow = Date()
    private var lastSubmissionAt = Date.distantPast
    init(defaults: UserDefaults? = nil, preferredLanguages: [String] = Locale.preferredLanguages) {
        language = AppLanguage.resolve(saved: defaults?.string(forKey: "usageLanguage"), preferred: preferredLanguages)
        self.defaults = defaults
        showsSetup = defaults.map { !$0.bool(forKey: "usageSetupSeen") } ?? false
        let threshold = defaults?.integer(forKey:"usageContextAlertThreshold") ?? 0
        if (1...100).contains(threshold) { contextAlertThreshold = threshold }
        if let enabled = defaults?.object(forKey:"usageContextNotificationsEnabled") as? Bool { contextNotificationsEnabled = enabled }
        if let data = defaults?.data(forKey:"usageContextAlertTracker"), let tracker = try? JSONDecoder().decode(ContextAlertTracker.self,from:data) { contextAlertTracker = tracker }
        let filter = defaults?.string(forKey:"usageProviderFilter") ?? "codex"
        providerFilter = ["all","codex","claude"].contains(filter) ? filter : "codex"
        selectedSessionID = defaults?.string(forKey:"usagePinnedSession")
        if let time = defaults?.object(forKey:"usageLastSubmissionAt") as? Double, time.isFinite {
            lastSubmissionAt = Date(timeIntervalSince1970:time)
        }
    }
    @Published var showsSetup = false
    @Published private(set) var connectionDiagnostics: [ConnectionDiagnostic] = []
    func dismissSetup() {
        showsSetup = false
        defaults?.set(true, forKey: "usageSetupSeen")
    }
    func updateDiagnostics(_ values: [ConnectionDiagnostic]) { connectionDiagnostics = values }
    func receivedLabel(_ date: Date?) -> String {
        guard let date else { return l("Chưa nhận dữ liệu") }
        let f = DateFormatter(); f.locale = language.locale; f.dateStyle = .short; f.timeStyle = .medium
        return l("Nhận gần nhất: %@", f.string(from: date))
    }
    @Published var showsSessions = false
    @Published var search = ""
    var onSelectionChange: (() -> Void)?
    var onRefresh: (() -> Void)?
    var onChooseSource: (() -> Void)?
    var onResetSource: (() -> Void)?
    var onToggleLogin: (() -> Void)?
    var onOpenSettings: (() -> Void)?
    var onAbout: (() -> Void)?
    var onCheckUpdates: (() -> Void)?
    var onReleaseNotes: (() -> Void)?
    var onQuit: (() -> Void)?
    var onChooseClaudeSource: (() -> Void)?
    var onResetClaudeSource: (() -> Void)?
    var onConnectClaudeContext: (() -> Void)?
    var onRemoveClaudeContext: (() -> Void)?
    var onInstallHooks: (() -> Void)?
    var onRemoveHooks: (() -> Void)?
    var onConfigureContextAlerts: (() -> Void)?
    var onContextAlertSettingsChange: (() -> Void)?

    func setContextAlertThreshold(_ value: Int) {
        guard (1...100).contains(value) else { return }
        contextAlertThreshold = value
        defaults?.set(value,forKey:"usageContextAlertThreshold")
        onContextAlertSettingsChange?()
    }
    func setContextNotificationsEnabled(_ enabled: Bool) {
        contextNotificationsEnabled = enabled
        defaults?.set(enabled,forKey:"usageContextNotificationsEnabled")
        onContextAlertSettingsChange?()
    }
    struct ContextAlert {
        let provider: UsageProvider
        let reading: ContextReading
        let threshold: Int
        var language: AppLanguage = .vietnamese
        func l(_ key: String, _ arguments: String...) -> String { AppLocalization(language: language).text(key, arguments: arguments) }
        var message: String { l("Context %@ đã dùng %@%, chạm ngưỡng %@%.", String(provider.title), String(reading.percent), String(threshold)) }
    }
    var activeContextAlerts: [ContextAlert] {
        UsageProvider.allCases.compactMap { provider in
            guard let reading = contextReading(for:provider), reading.fraction * 100 >= Double(contextAlertThreshold) else { return nil }
            return ContextAlert(provider:provider,reading:reading,threshold:contextAlertThreshold,language:language)
        }
    }
    var contextWarning: String? {
        let messages = activeContextAlerts.map(\.message)
        return messages.isEmpty ? nil : messages.joined(separator:"\n")
    }
    func consumeContextAlerts() -> [ContextAlert] {
        var result: [ContextAlert] = []
        for provider in UsageProvider.allCases {
            let reading = contextReading(for:provider)
            let crossed = contextAlertTracker.consume(reading,provider:provider,source:source,threshold:contextAlertThreshold)
            if crossed, contextNotificationsEnabled, let reading {
                result.append(ContextAlert(provider:provider,reading:reading,threshold:contextAlertThreshold,language:language))
            }
        }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        if let data = try? encoder.encode(contextAlertTracker), defaults?.data(forKey:"usageContextAlertTracker") != data {
            defaults?.set(data,forKey:"usageContextAlertTracker")
        }
        return result
    }

    func update(snapshot: UsageSnapshot?, source: String, isLoading: Bool, isStale: Bool, notice: String?, loginState: LoginItemState) {
        if !self.source.isEmpty && self.source != source { selectedSessionID = nil; followedActivity = nil; search = ""; defaults?.removeObject(forKey:"usagePinnedSession") }
        self.snapshot = snapshot; self.source = source
        self.isLoading = isLoading; self.isStale = isStale; self.notice = notice; self.loginState = loginState
    }
    func chooseSession(_ id: String?) {
        if let id, let session = snapshot?.sessions.first(where: { $0.id == id }) { providerFilter = session.usageProvider.rawValue }
        selectedSessionID = id
        if id == nil, let followedActivity { providerFilter = followedActivity.provider.rawValue }
        persist(); showsSessions = false; search = ""; onSelectionChange?()
    }
    func setProviderFilter(_ filter:String) {
        guard ["all","codex","claude"].contains(filter) else { return }
        providerFilter = filter; selectedSessionID = nil; persist(); onSelectionChange?()
    }
    private func persist() {
        defaults?.set(providerFilter,forKey:"usageProviderFilter")
        if let selectedSessionID { defaults?.set(selectedSessionID,forKey:"usagePinnedSession") }
        else { defaults?.removeObject(forKey:"usagePinnedSession") }
    }
    func applyActivities(_ values:[SessionActivity],now:Date = Date()) {
        activityNow = now
        activities = values.filter { now.timeIntervalSince($0.recordedAt) >= -5 && now.timeIntervalSince($0.recordedAt) <= 86_400 }
        let newest = activities.filter { $0.event == .submitted }.max { $0.recordedAt < $1.recordedAt }
        // Restore the followed conversation, but do not replay a handled prompt
        // as a new action that overrides a subsequently selected provider filter.
        if followedActivity == nil { followedActivity = newest }
        if let newest, newest.recordedAt > lastSubmissionAt {
            lastSubmissionAt = newest.recordedAt; followedActivity = newest
            defaults?.set(newest.recordedAt.timeIntervalSince1970,forKey:"usageLastSubmissionAt")
            if selectedSessionID == nil { providerFilter = newest.provider.rawValue; persist() }
        }
        if let followedActivity, now.timeIntervalSince(followedActivity.recordedAt) > 86_400 { self.followedActivity = nil }
    }
    private var visibleSessions:[SessionUsage] { (snapshot?.sessions ?? []).filter { providerFilter == "all" || $0.usageProvider.rawValue == providerFilter } }
    var selectedSession: SessionUsage? {
        guard let snapshot else { return nil }
        if let selectedSessionID { return snapshot.sessions.first { $0.id == selectedSessionID } }
        if providerFilter == "all" { return nil }
        if let followedActivity, followedActivity.provider.rawValue == providerFilter {
            return visibleSessions.first { $0.kind != "subagent" && $0.matches(followedActivity) }
        }
        return visibleSessions.first { $0.kind == "main" } ?? visibleSessions.first { $0.kind != "subagent" }
    }
    var selectionMissing: Bool { snapshot != nil && selectedSessionID != nil && selectedSession == nil }
    var panelHeight: CGFloat {
        712 + ((notice != nil || isStale || selectionMissing || connectionNotice != nil) ? 40 : 0) + (hasUnpricedDays ? 16 : 0) + (contextWarning != nil ? (isAll ? 64 : 44) : 0)
    }
    var isAll:Bool { providerFilter == "all" }
    var waitingForUsage:Bool { !isAll && selectedSessionID == nil && followedActivity?.provider.rawValue == providerFilter && selectedSession == nil }
    var mainCost: String { isAll ? todayCost : selectedSession.map { UsagePresentation.money($0.cost) } ?? "—" }
    var selectionLabel: String {
        if isAll { return l("Tổng Codex và Claude Code hôm nay") }
        if selectionMissing { return l("Phiên đã chọn không còn dữ liệu") }
        if waitingForUsage { return l("Phiên mới · %@ · Chờ dữ liệu", String(followedActivity?.sessionID.prefix(8) ?? "")) }
        return selectedSession.map { UsagePresentation.cleanTitle($0.title) } ?? l("Chưa có phiên chính")
    }
    var activityLabel:String {
        if selectedSessionID != nil { return l("Đã ghim phiên · %@", String(UsageProvider(rawValue:providerFilter)?.title ?? "")) }
        if isAll { return l("Tổng chi phí API quy đổi · Hôm nay") }
        guard let current = followedActivity, current.provider.rawValue == providerFilter else { return l("Tự động · Chờ sự kiện gửi tin nhắn") }
        let ended = activities.contains { event in
            event.provider == current.provider && event.sessionID == current.sessionID && event.recordedAt >= current.recordedAt &&
            (event.event == .stopped || event.event == .ended) && (event.turnID == nil || current.turnID == nil || event.turnID == current.turnID)
        }
        let state = ended ? l("Đã dừng xử lý") : activityNow.timeIntervalSince(current.recordedAt) > 900 ? l("Chờ cập nhật") : l("Đang xử lý")
        return l("Tự động · %@ · %@", String(current.provider.title), String(state))
    }
    var providerBreakdown:ProviderBreakdown? { snapshot?.providerBreakdowns?.first { $0.provider.rawValue == providerFilter } }
    var visibleToday:UsageAggregate? { isAll ? snapshot?.today : providerBreakdown?.today ?? (providerFilter == "codex" && snapshot?.providerBreakdowns == nil ? snapshot?.today : nil) }
    var visibleMonth:UsageAggregate? { isAll ? snapshot?.month : providerBreakdown?.month ?? (providerFilter == "codex" && snapshot?.providerBreakdowns == nil ? snapshot?.month : nil) }
    private var displayTokens:UsageTokens? { isAll ? visibleToday?.tokens : selectedSession?.tokens }
    @Published private(set) var contextReadings: [UsageProvider:ContextReading] = [:]
    var contextSessionIDs: [UsageProvider:String] {
        var result: [UsageProvider:String] = [:]
        for provider in UsageProvider.allCases where isAll || providerFilter == provider.rawValue {
            let session:SessionUsage?
            if !isAll { session=selectedSession }
            else if let activity = activities.filter({ $0.provider == provider && $0.event == .submitted }).max(by:{ $0.recordedAt < $1.recordedAt }) {
                session=snapshot?.sessions.first { $0.kind != "subagent" && $0.matches(activity) }
            } else { session=snapshot?.sessions.first { $0.usageProvider == provider && $0.kind != "subagent" } }
            if let session {
                let id = session.sessionKey ?? session.id.range(of:"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",options:.regularExpression).map { String(session.id[$0]) } ?? session.id
                if ContextReading.validSessionID(id) { result[provider]=id }
            }
        }
        return result
    }
    func updateContexts(_ values:[UsageProvider:ContextReading]) { contextReadings=values }
    func contextReading(for provider:UsageProvider) -> ContextReading? {
        guard !isStale, let value=contextReadings[provider], value.sessionID == contextSessionIDs[provider] else { return nil }
        return value
    }
    var contextLabel:String {
        if isAll { return UsageProvider.allCases.map { "\($0.title): \(contextReading(for:$0).map { "\($0.percent)%" } ?? "—")" }.joined(separator:" · ") }
        let provider = UsageProvider(rawValue:providerFilter) ?? .codex
        guard let value=contextReading(for:provider) else { return l("Context chưa xác định") }
        return l("Context %@% · %@ token · Ước tính", String(value.percent), String(Self.compact(value.limitTokens)))
    }
    var contextTooltip:String {
        let explanation = l("Vòng ngoài: context đã dùng, không phải quota thuê bao hay token cộng dồn.")
        if providerFilter == "claude" && contextReading(for:.claude) == nil { return explanation + l("\nKết nối context Claude Code trong Cài đặt để nhận số liệu từ status line.") }
        return explanation + "\n" + contextLabel + (contextWarning.map { "\n⚠ " + $0 } ?? "")
    }
    var statusTitle: String {
        if snapshot == nil { return isLoading ? "…" : "—" }
        return mainCost + (isStale ? " ⚠" : "")
    }
    var tokenTooltip: String {
        guard let tokens = displayTokens else { return l("Chưa có dữ liệu token") }
        return l("Input: %@\nCache read: %@\nCache write: %@\nOutput: %@\nTổng: %@", String(UsagePresentation.number(tokens.input)), String(UsagePresentation.number(tokens.cacheRead)), String(UsagePresentation.number(tokens.cacheWrite)), String(UsagePresentation.number(tokens.output)), String(UsagePresentation.number(tokens.total)))
    }
    var inputText: String { displayTokens.map { Self.compact($0.input) } ?? "—" }
    var outputText: String { displayTokens.map { Self.compact($0.output) } ?? "—" }
    var cacheText: String { displayTokens.map { Self.compact($0.cacheRead + $0.cacheWrite) } ?? "—" }
    var todayCost: String { visibleToday.map { UsagePresentation.money($0.cost) } ?? "—" }
    var monthCost: String { visibleMonth.map { UsagePresentation.money($0.cost) } ?? "—" }
    var chartPoints: [DailyCostPoint] {
        (isAll ? snapshot?.chart ?? [] : providerBreakdown?.chart ?? (providerFilter == "codex" && snapshot?.providerBreakdowns == nil ? snapshot?.chart ?? [] : [])).map { point in
            let parts = point.date.split(separator: "-")
            let label = parts.count == 3 ? (language == .english ? "\(parts[1])/\(parts[2])" : language == .simplifiedChinese ? "\(parts[1])月\(parts[2])日" : "\(parts[2])/\(parts[1])") : point.date
            let amount = point.cost.status == "unknown" ? nil : (point.cost.amountUSD ?? point.cost.knownCostUSD)
            return DailyCostPoint(id: point.date, label: label, amount: amount, cost: point.cost)
        }
    }
    var hasUnpricedDays: Bool { chartPoints.contains { $0.cost.status != "estimated" } }
    var filteredSessions: [SessionUsage] {
        let all = visibleSessions
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return all }
        return all.filter { $0.title.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil || $0.id.localizedCaseInsensitiveContains(query) }
    }
    var updatedLabel: String {
        guard let snapshot else { return l("Chưa cập nhật") }
        let f = DateFormatter(); f.locale = language.locale
        f.timeZone = TimeZone(identifier: snapshot.timeZone); f.setLocalizedDateFormatFromTemplate("HHmmssMMdd")
        return f.string(from: snapshot.generatedAt)
    }
    static func compact(_ value: Double) -> String {
        let divisor: Double = value >= 1_000_000 ? 1_000_000 : value >= 1000 ? 1000 : 1
        let suffix = divisor == 1_000_000 ? "M" : divisor == 1000 ? "K" : ""
        let formatter = NumberFormatter(); formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .decimal; formatter.maximumFractionDigits = divisor == 1 ? 0 : 1
        formatter.roundingMode = .halfUp
        return (formatter.string(from: NSNumber(value: value / divisor)) ?? "—") + suffix
    }
}
