import Foundation
import Combine
import UsageCore

/// Window-local state. This model consumes snapshots; it never scans logs or mutates panel selection.
@MainActor final class UsageHistoryModel: ObservableObject {
    @Published private(set) var snapshot: UsageSnapshot?
    @Published private(set) var source = ""
    @Published private(set) var isLoading = false
    @Published private(set) var isStale = false
    @Published private(set) var notice: String?
    @Published private(set) var language: AppLanguage
    @Published private(set) var provider: String
    @Published private(set) var preset: UsageHistoryPreset = .thirtyDays
    @Published private(set) var range: UsageHistoryRange?
    @Published private(set) var customRange: UsageHistoryRange?
    @Published private(set) var projection: UsageHistoryProjection?
    @Published private(set) var selectedDay: String?
    @Published private var validationFailed = false
    @Published private var customRangeInvalid = false
    var validationMessage: String? {
        (validationFailed || customRangeInvalid) ? l("Ngày không hợp lệ. Dùng YYYY-MM-DD, bắt đầu ≤ kết thúc và không vượt hôm nay.") : nil
    }
    @Published var customStart = ""
    @Published var customEnd = ""
    var onRefresh: (() -> Void)?
    private let now: () -> Date

    init(provider: String, language: AppLanguage, now: @escaping () -> Date = { Date() }) {
        self.provider = ["all", "codex", "claude"].contains(provider) ? provider : "all"
        self.language = language; self.now = now
    }
    func l(_ key: String, _ arguments: String...) -> String { AppLocalization(language: language).text(key, arguments: arguments) }
    var activeHistory: UsageHistory? { snapshot?.status == "error" ? nil : snapshot?.history }
    var timeZone: String { snapshot?.timeZone ?? TimeZone.current.identifier }
    var chartPoints: [UsageHistoryChartPoint] {
        (projection?.days ?? []).map { day in
            let key = day.aggregate.cost.status == "estimated" ? "Ước tính" :
                day.aggregate.cost.status == "partial" ? "Thiếu một phần giá" : "Chưa biết giá"
            return UsageHistoryChartPoint(date: day.date, cost: day.aggregate.cost, pricingLabel: l(key))
        }
    }
    var modelRows: [ModelUsage] {
        if let selectedDay { return projection?.days.first { $0.date == selectedDay }?.aggregate.models ?? [] }
        return projection?.aggregate.models ?? []
    }
    var scopeLabel: String { range.map { l("Khoảng đã chọn: %@ → %@", $0.start, $0.end) } ?? "—" }
    var breakdownLabel: String { selectedDay.map { l("Model trong ngày %@", $0) } ?? l("Model trong toàn khoảng") }
    var updatedLabel: String {
        guard let snapshot else { return l("Chưa cập nhật") }
        let formatter = DateFormatter(); formatter.locale = language.locale
        formatter.timeZone = TimeZone(identifier: snapshot.timeZone)
        formatter.dateStyle = .medium; formatter.timeStyle = .medium
        return l("Cập nhật: %@ (%@)", formatter.string(from: snapshot.generatedAt), snapshot.timeZone)
    }
    func presetTitle(_ value: UsageHistoryPreset) -> String {
        switch value {
        case .sevenDays: l("7 ngày")
        case .thirtyDays: l("30 ngày")
        case .month: l("Tháng này")
        case .previousMonth: l("Tháng trước")
        case .custom: l("Tùy chỉnh")
        }
    }
    func update(snapshot: UsageSnapshot?, source: String, isLoading: Bool, isStale: Bool, notice: String?, language: AppLanguage) {
        if self.source != source { selectedDay = nil }
        self.snapshot = snapshot; self.source = source; self.isLoading = isLoading
        self.isStale = isStale; self.notice = notice; self.language = language
        rebuild()
    }
    func setProvider(_ value: String) {
        guard ["all", "codex", "claude"].contains(value) else { return }
        provider = value; selectedDay = nil; rebuild()
    }
    func setPreset(_ value: UsageHistoryPreset) {
        if value == .custom {
            if customRange == nil { customRange = range }
            customStart = customRange?.start ?? ""; customEnd = customRange?.end ?? ""
        }
        preset = value; validationFailed = false; rebuild()
    }
    @discardableResult func applyCustom(start: String, end: String) -> Bool {
        let draft = UsageHistoryRange(start: start, end: end)
        guard let valid = UsageHistory.range(.custom, now: now(), timeZone: timeZone, custom: draft) else {
            validationFailed = true
            return false
        }
        preset = .custom; customRange = valid; range = valid; customStart = start; customEnd = end
        validationFailed = false; rebuild(); return true
    }
    func selectDay(_ value: String?) {
        selectedDay = value.flatMap { date in projection?.days.contains { $0.date == date } == true ? date : nil }
    }
    private func rebuild() {
        range = UsageHistory.range(preset, now: now(), timeZone: timeZone, custom: customRange)
        customRangeInvalid = preset == .custom && range == nil
        if let snapshot, let range { projection = UsageHistory.project(snapshot, provider: provider, range: range) }
        else { projection = nil }
        if let selectedDay, projection?.days.contains(where: { $0.date == selectedDay }) != true { self.selectedDay = nil }
    }
}

/// Marker positions are the actual known cost, including zero; unknown days have no bar.
struct UsageHistoryChartPoint: Identifiable {
    let date: String
    let cost: UsageCost
    let pricingLabel: String
    var id: String { date }
    var amount: Double? { cost.status == "unknown" ? nil : cost.amountUSD ?? cost.knownCostUSD }
    var markerAmount: Double? { cost.status == "estimated" ? nil : cost.knownCostUSD }
    var description: String { date + " · " + UsagePresentation.money(cost) + " · " + pricingLabel }
}
