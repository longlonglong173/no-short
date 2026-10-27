import Foundation
import CryptoKit

public enum UsageInsightReason: String, Sendable { case stale, unavailable, history, baseline, today, pricing, overflow }
public struct UsageInsightsResult: Sendable {
    public var provider: String
    public var today = "", windowStart = "", sampleDates: [String] = []
    public var sampleCount: Int { sampleDates.count }
    public var excludedUnpricedDays = 0
    public var medianUSD: Double?, meanUSD: Double?, thresholdUSD: Double?, todayUSD: Double?
    public var anomaly: Bool?, anomalyReason: UsageInsightReason? = .unavailable
    public var recordedMonthUSD: Double?, remainingDays = 0, scenarioUSD: Double?, scenarioReason: UsageInsightReason? = .unavailable
}
/// Pure, sparse retained-log projection. A scenario is not an account bill or a billing prediction.
public enum UsageInsights {
    private static func complete(_ a: UsageAggregate) -> Bool {
        a.cost.status == "estimated" && a.cost.amountUSD?.isFinite == true && a.models.allSatisfy {
            $0.cost.status == "estimated" && $0.cost.amountUSD?.isFinite == true && !["fallback", "unpriced", "mixed"].contains($0.pricing?.source ?? "")
        }
    }
    public static func evaluate(_ snapshot: UsageSnapshot, provider: String, now: Date = Date(), isStale: Bool = false) -> UsageInsightsResult {
        var v = UsageInsightsResult(provider: provider)
        guard let calendar = UsageHistory.calendar(timeZone: snapshot.timeZone),
              let start = calendar.date(byAdding: .day, value: -30, to: now),
              let month = calendar.dateInterval(of: .month, for: now),
              let last = calendar.date(byAdding: .day, value: -1, to: month.end) else { return v }
        v.today = UsageHistory.dayString(now, timeZone: snapshot.timeZone)
        v.windowStart = UsageHistory.dayString(start, timeZone: snapshot.timeZone)
        v.remainingDays = calendar.component(.day, from: last) - calendar.component(.day, from: now)
        guard !isStale, !snapshot.isStale(at: now), snapshot.status != "error" else {
            v.anomalyReason = .stale; v.scenarioReason = .stale; return v
        }
        guard let history = snapshot.history,
              let view = UsageHistory.project(snapshot, provider: provider, range: .init(start: v.windowStart, end: v.today)),
              let recorded = UsageHistory.project(snapshot, provider: provider, range: .init(start: String(v.today.prefix(7)) + "-01", end: v.today)) else { return v }
        let rows = history.days.filter { provider == "all" || $0.provider.rawValue == provider }
        func dayComplete(_ day: String) -> Bool { rows.filter { $0.date == day }.allSatisfy { complete($0.aggregate) } }
        let prior = view.days.filter { $0.date < v.today }, sample = Array(prior.suffix(7))
        v.excludedUnpricedDays = prior.filter { !dayComplete($0.date) }.count
        v.sampleDates = sample.map(\.date)
        let today = view.days.first { $0.date == v.today }
        if let today, dayComplete(v.today) { v.todayUSD = today.aggregate.cost.amountUSD }
        let monthComplete = !recorded.days.isEmpty && recorded.days.allSatisfy { dayComplete($0.date) }
        if monthComplete { v.recordedMonthUSD = recorded.aggregate.cost.amountUSD }
        guard sample.count == 7 else { v.anomalyReason = .history; v.scenarioReason = .history; return v }
        guard sample.allSatisfy({ dayComplete($0.date) }) else { v.anomalyReason = .pricing; v.scenarioReason = .pricing; return v }
        let costs = sample.map { $0.aggregate.cost.amountUSD! }.sorted()
        v.medianUSD = costs[3]; v.meanUSD = costs.reduce(0) { $0 + $1 / 7 }
        let threshold = costs[3] * 2
        if threshold.isFinite { v.thresholdUSD = threshold }
        v.anomalyReason = today == nil ? .today : v.todayUSD == nil ? .pricing : costs[3] <= 0 ? .baseline : v.thresholdUSD == nil ? .overflow : nil
        if v.anomalyReason == nil { v.anomaly = v.todayUSD! > v.thresholdUSD! }
        v.scenarioReason = today == nil ? .today : monthComplete ? nil : .pricing
        if v.scenarioReason == nil {
            let total = v.recordedMonthUSD! + v.meanUSD! * Double(v.remainingDays)
            if total.isFinite { v.scenarioUSD = total } else { v.scenarioReason = .overflow }
        }
        return v
    }
}
/// Separate from budget/context dedup; persisted BEFORE an attempt so errors/restart cannot spam.
public struct UsageAnomalyTracker: Codable, Sendable {
    private var records: [String] = []
    public init() {}
    public mutating func consume(source: String, timeZone: String, provider: String, day: String) -> Bool {
        let text = [source, timeZone, provider, day].joined(separator: "\u{0}")
        let key = SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
        guard !records.contains(key) else { return false }
        records.append(key)
        return true
    }
}
