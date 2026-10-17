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
    @Published var showsSessions = false
    @Published var search = ""
    var onSelectionChange: (() -> Void)?
    var onRefresh: (() -> Void)?
    var onChooseSource: (() -> Void)?
    var onResetSource: (() -> Void)?
    var onToggleLogin: (() -> Void)?
    var onOpenSettings: (() -> Void)?
    var onQuit: (() -> Void)?

    func update(snapshot: UsageSnapshot?, source: String, isLoading: Bool, isStale: Bool, notice: String?, loginState: LoginItemState) {
        if self.source != source { selectedSessionID = nil; search = "" }
        self.snapshot = snapshot; self.source = source
        self.isLoading = isLoading; self.isStale = isStale; self.notice = notice; self.loginState = loginState
    }
    func chooseSession(_ id: String?) {
        selectedSessionID = id; showsSessions = false; search = ""; onSelectionChange?()
    }
    var selectedSession: SessionUsage? {
        guard let snapshot else { return nil }
        if let selectedSessionID { return snapshot.sessions.first { $0.id == selectedSessionID } }
        return snapshot.latestSession
    }
    var selectionMissing: Bool { snapshot != nil && selectedSessionID != nil && selectedSession == nil }
    var panelHeight: CGFloat {
        632 + ((notice != nil || isStale || selectionMissing) ? 40 : 0) + (hasUnpricedDays ? 16 : 0)
    }
    var mainCost: String { selectedSession.map { UsagePresentation.money($0.cost) } ?? "—" }
    var selectionLabel: String {
        if selectionMissing { return "Phiên đã chọn không còn dữ liệu" }
        return selectedSession.map { UsagePresentation.cleanTitle($0.title) } ?? "Chưa có phiên chính"
    }
    var statusTitle: String {
        if snapshot == nil { return isLoading ? "NS …" : "NS —" }
        return "NS \(mainCost)" + (isStale ? " ⚠" : "")
    }
    var tokenTooltip: String {
        guard let tokens = selectedSession?.tokens else { return "Chưa có dữ liệu token" }
        return "Input: \(UsagePresentation.number(tokens.input))\nCache read: \(UsagePresentation.number(tokens.cacheRead))\nCache write: \(UsagePresentation.number(tokens.cacheWrite))\nOutput: \(UsagePresentation.number(tokens.output))\nTổng: \(UsagePresentation.number(tokens.total))"
    }
    var inputText: String { selectedSession.map { Self.compact($0.tokens.input) } ?? "—" }
    var outputText: String { selectedSession.map { Self.compact($0.tokens.output) } ?? "—" }
    var cacheText: String { selectedSession.map { Self.compact($0.tokens.cacheRead + $0.tokens.cacheWrite) } ?? "—" }
    var todayCost: String { snapshot.map { UsagePresentation.money($0.today.cost) } ?? "—" }
    var monthCost: String { snapshot.map { UsagePresentation.money($0.month.cost) } ?? "—" }
    var chartPoints: [DailyCostPoint] {
        (snapshot?.chart ?? []).map { point in
            let parts = point.date.split(separator: "-")
            let label = parts.count == 3 ? "\(parts[2])/\(parts[1])" : point.date
            let amount = point.cost.status == "unknown" ? nil : (point.cost.amountUSD ?? point.cost.knownCostUSD)
            return DailyCostPoint(id: point.date, label: label, amount: amount, cost: point.cost)
        }
    }
    var hasUnpricedDays: Bool { chartPoints.contains { $0.cost.status != "estimated" } }
    var filteredSessions: [SessionUsage] {
        let all = snapshot?.sessions ?? []
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return all }
        return all.filter { $0.title.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil || $0.id.localizedCaseInsensitiveContains(query) }
    }
    var updatedLabel: String {
        guard let snapshot else { return "Chưa cập nhật" }
        let f = DateFormatter(); f.locale = Locale(identifier: "vi_VN")
        f.timeZone = TimeZone(identifier: snapshot.timeZone); f.dateFormat = "HH:mm:ss · dd/MM"
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
