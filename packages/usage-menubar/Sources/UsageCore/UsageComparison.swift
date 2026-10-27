import Foundation

public struct UsageComparisonDelta: Sendable {
    public let absolute: Double
    public let percent: Double?
}
public struct UsageCacheComparison: Sendable {
    public let current: Double?
    public let previous: Double?
    public let percentagePoints: Double?
}
public struct UsageComparisonRow: Sendable, Identifiable {
    public let name: String
    public var id: String { name }
    public let current: UsageAggregate
    public let previous: UsageAggregate
    public let tokens: UsageComparisonDelta
    public let cost: UsageComparisonDelta?
    public let cache: UsageCacheComparison
}
public struct UsageComparisonResult: Sendable {
    public let currentRange: UsageHistoryRange
    public let previousRange: UsageHistoryRange
    public let summary: UsageComparisonRow
    public let providers: [UsageComparisonRow]
    public let models: [UsageComparisonRow]
}
/// Comparison is a projection of retained local logs, never proof of account-wide coverage.
public enum UsageComparison {
    public static func compare(_ snapshot: UsageSnapshot, provider: String, range: UsageHistoryRange, isStale: Bool = false) -> UsageComparisonResult? {
        guard let current = UsageHistory.project(snapshot, provider: provider, range: range),
              let calendar = UsageHistory.calendar(timeZone: snapshot.timeZone),
              let start = UsageHistory.date(range.start, timeZone: snapshot.timeZone),
              let end = UsageHistory.date(range.end, timeZone: snapshot.timeZone),
              let difference = calendar.dateComponents([.day], from: start, to: end).day,
              let previousStart = calendar.date(byAdding: .day, value: -(difference + 1), to: start),
              let previousEnd = calendar.date(byAdding: .day, value: -1, to: start),
              calendar.component(.era, from: previousStart) == 1,
              calendar.component(.year, from: previousStart) >= 1 else { return nil }
        let previousRange = UsageHistoryRange(start: UsageHistory.dayString(previousStart, timeZone: snapshot.timeZone),
            end: UsageHistory.dayString(previousEnd, timeZone: snapshot.timeZone))
        guard let previous = UsageHistory.project(snapshot, provider: provider, range: previousRange), let history = snapshot.history else { return nil }
        let fresh = !isStale && snapshot.status != "stale"
        var providers: [UsageComparisonRow] = [], models: [UsageComparisonRow] = []
        for source in history.providers where provider == "all" || source.rawValue == provider {
            guard let a = UsageHistory.project(snapshot, provider: source.rawValue, range: range)?.aggregate,
                  let b = UsageHistory.project(snapshot, provider: source.rawValue, range: previousRange)?.aggregate else { return nil }
            providers.append(row(source.rawValue, a, b, fresh: fresh))
            let names = Set((a.models + b.models).map(\.name)).sorted()
            for name in names {
                models.append(row(source.rawValue + " / " + name, modelAggregate(a, name), modelAggregate(b, name), fresh: fresh))
            }
        }
        return UsageComparisonResult(currentRange: range, previousRange: previousRange,
            summary: row("all", current.aggregate, previous.aggregate, fresh: fresh), providers: providers, models: models)
    }
    private static func delta(_ current: Double, _ previous: Double) -> UsageComparisonDelta {
        UsageComparisonDelta(absolute: current - previous, percent: previous > 0 ? (current - previous) / previous * 100 : nil)
    }
    private static func cache(_ aggregate: UsageAggregate) -> Double? {
        let t = aggregate.tokens, denominator = t.input + t.cacheRead + t.cacheWrite
        return denominator > 0 ? t.cacheRead / denominator : nil
    }
    private static func row(_ name: String, _ current: UsageAggregate, _ previous: UsageAggregate, fresh: Bool) -> UsageComparisonRow {
        let a = cache(current), b = cache(previous)
        let cost: UsageComparisonDelta? = fresh && current.cost.status == "estimated" && previous.cost.status == "estimated"
            ? delta(current.cost.amountUSD!, previous.cost.amountUSD!) : nil
        return UsageComparisonRow(name: name, current: current, previous: previous,
            tokens: delta(current.tokens.total, previous.tokens.total), cost: cost,
            cache: UsageCacheComparison(current: a, previous: b, percentagePoints: a.flatMap { a in b.map { (a - $0) * 100 } }))
    }
    private static func modelAggregate(_ aggregate: UsageAggregate, _ name: String) -> UsageAggregate {
        if let model = aggregate.models.first(where: { $0.name == name }) {
            return UsageAggregate(tokens: model.tokens, cost: model.cost, models: [model])
        }
        return UsageAggregate(tokens: UsageTokens(input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0),
            cost: UsageCost(amountUSD: 0, knownCostUSD: 0, status: "estimated"), models: [])
    }
}
