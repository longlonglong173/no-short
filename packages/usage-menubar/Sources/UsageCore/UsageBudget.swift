import Foundation
import CryptoKit

public enum UsageBudgetPeriod: String, Codable, Sendable, CaseIterable { case day, month }
public enum UsageBudgetError: Error { case invalidRule }
public struct UsageBudgetRule: Codable, Sendable, Identifiable, Equatable {
    public let provider: String
    public let period: UsageBudgetPeriod
    public let limitUSD: Double
    public var id: String { provider + "-" + period.rawValue }
    public init(provider: String, period: UsageBudgetPeriod, limitUSD: Double) throws {
        guard ["all", "codex", "claude"].contains(provider), limitUSD.isFinite, limitUSD > 0 else { throw UsageBudgetError.invalidRule }
        self.provider = provider; self.period = period; self.limitUSD = limitUSD
    }
    private enum CodingKeys: String, CodingKey { case provider, period, limitUSD }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(provider: c.decode(String.self, forKey: .provider), period: c.decode(UsageBudgetPeriod.self, forKey: .period), limitUSD: c.decode(Double.self, forKey: .limitUSD))
    }
}
public struct UsageBudgetReading: Sendable {
    public let rule: UsageBudgetRule
    public let periodKey: String
    public let cost: UsageCost?
    public var available: Bool { cost != nil }
    public var uncertain: Bool { cost?.status != "estimated" }
    public var exceeded: Bool {
        guard let cost, cost.status != "unknown" else { return false }
        return (cost.amountUSD ?? cost.knownCostUSD) >= rule.limitUSD
    }
}
public enum UsageBudgets {
    public static func evaluate(snapshot: UsageSnapshot?, rules: [UsageBudgetRule], now: Date = Date(), isStale: Bool = false) -> [UsageBudgetReading] {
        let fresh = snapshot.map { !isStale && !$0.isStale(at: now) } ?? false
        let day = UsageHistory.dayString(now, timeZone: snapshot?.timeZone ?? "UTC")
        return rules.map { rule in
            var aggregate: UsageAggregate?
            if fresh, let s = snapshot {
                if rule.provider == "all" { aggregate = rule.period == .day ? s.today : s.month }
                else if let breakdown = s.providerBreakdowns?.first(where: { $0.provider.rawValue == rule.provider }) {
                    aggregate = rule.period == .day ? breakdown.today : breakdown.month
                } else if rule.provider == "codex", s.providerBreakdowns == nil,
                          !s.sessions.contains(where: { $0.usageProvider == .claude }),
                          s.history?.providers.contains(.claude) != true {
                    aggregate = rule.period == .day ? s.today : s.month
                }
            }
            return UsageBudgetReading(rule: rule, periodKey: rule.period == .day ? day : String(day.prefix(7)), cost: aggregate?.cost)
        }
    }
}
/// Once per source/timezone/provider/calendar period, regardless of rule edits or refresh/restart.
public struct UsageBudgetTracker: Codable, Sendable {
    private var records: [String] = []
    public init() {}
    public mutating func consume(_ readings: [UsageBudgetReading], source: String, timeZone: String) -> [UsageBudgetReading] {
        var events: [UsageBudgetReading] = []
        for reading in readings where reading.exceeded {
            let text = [source, timeZone, reading.rule.provider, reading.rule.period.rawValue, reading.periodKey].joined(separator: "\u{0}")
            let key = SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
            guard !records.contains(key) else { continue }
            records.append(key); events.append(reading)
        }
        if records.count > 512 { records.removeFirst(records.count - 512) }
        return events
    }
}
