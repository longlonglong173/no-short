import Foundation

public struct UsageHistory: Decodable, Sendable {
    public let version: Int
    public let providers: [UsageProvider]
    public let days: [UsageHistoryDay]

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decode(Int.self, forKey: .version)
        providers = try c.decode([UsageProvider].self, forKey: .providers)
        days = try c.decode([UsageHistoryDay].self, forKey: .days)
        guard version == 1, !providers.isEmpty, Set(providers).count == providers.count else { throw SnapshotError.invalid }
        var seen = Set<String>()
        for day in days {
            guard providers.contains(day.provider), Self.date(day.date, timeZone: "UTC") != nil,
                  seen.insert(day.date + ":" + day.provider.rawValue).inserted else { throw SnapshotError.invalid }
            try day.aggregate.validate()
            guard day.aggregate.models.allSatisfy({ !$0.name.isEmpty }) else { throw SnapshotError.invalid }
            for cost in [day.aggregate.cost] + day.aggregate.models.map(\.cost) {
                guard cost.status != "unknown" || cost.knownCostUSD == 0,
                      cost.status != "estimated" || cost.amountUSD == cost.knownCostUSD else { throw SnapshotError.invalid }
            }
        }
    }
    private enum CodingKeys: String, CodingKey { case version, providers, days }

    public static func calendar(timeZone: String) -> Calendar? {
        guard let zone = TimeZone(identifier: timeZone) else { return nil }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = zone
        return calendar
    }
    public static func date(_ text: String, timeZone: String) -> Date? {
        let bytes = Array(text.utf8)
        guard bytes.count == 10, bytes[4] == 45, bytes[7] == 45,
              bytes.enumerated().allSatisfy({ $0.offset == 4 || $0.offset == 7 || (48...57).contains($0.element) }),
              let calendar = calendar(timeZone: timeZone) else { return nil }
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, parts[0] >= 1,
              let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)) else { return nil }
        let actual = calendar.dateComponents([.year, .month, .day], from: date)
        guard actual.year == parts[0], actual.month == parts[1], actual.day == parts[2] else { return nil }
        return date
    }
    public static func dayString(_ date: Date, timeZone: String) -> String {
        guard let calendar = calendar(timeZone: timeZone) else { return "" }
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
    public static func range(_ preset: UsageHistoryPreset, now: Date, timeZone: String, custom: UsageHistoryRange? = nil) -> UsageHistoryRange? {
        guard let calendar = calendar(timeZone: timeZone) else { return nil }
        let today = calendar.startOfDay(for: now), todayString = dayString(today, timeZone: timeZone)
        if preset == .custom {
            guard let custom, date(custom.start, timeZone: timeZone) != nil, date(custom.end, timeZone: timeZone) != nil,
                  custom.start <= custom.end, custom.end <= todayString else { return nil }
            return custom
        }
        let start: Date, end: Date
        switch preset {
        case .sevenDays, .thirtyDays:
            start = calendar.date(byAdding: .day, value: preset == .sevenDays ? -6 : -29, to: today)!; end = today
        case .month:
            start = calendar.dateInterval(of: .month, for: today)!.start; end = today
        case .previousMonth:
            let monthStart = calendar.dateInterval(of: .month, for: today)!.start
            start = calendar.date(byAdding: .month, value: -1, to: monthStart)!
            end = calendar.date(byAdding: .day, value: -1, to: monthStart)!
        case .custom: return nil
        }
        return UsageHistoryRange(start: dayString(start, timeZone: timeZone), end: dayString(end, timeZone: timeZone))
    }

    public static func project(_ snapshot: UsageSnapshot, provider: String, range: UsageHistoryRange) -> UsageHistoryProjection? {
        guard snapshot.status != "error", let history = snapshot.history, !history.providers.isEmpty,
              provider == "all" || history.providers.contains(where: { $0.rawValue == provider }),
              date(range.start, timeZone: snapshot.timeZone) != nil, date(range.end, timeZone: snapshot.timeZone) != nil,
              range.start <= range.end else { return nil }
        let rows = history.days.filter { (provider == "all" || $0.provider.rawValue == provider) && $0.date >= range.start && $0.date <= range.end }
        guard let aggregate = sum(rows.map(\.aggregate)) else { return nil }
        let grouped = Dictionary(grouping: rows, by: \.date)
        var days: [UsageHistoryProjection.Day] = []
        for date in grouped.keys.sorted() {
            guard let total = sum(grouped[date]!.map(\.aggregate)) else { return nil }
            days.append(.init(date: date, aggregate: total))
        }
        return UsageHistoryProjection(range: range, provider: provider, aggregate: aggregate, days: days)
    }
    private static func sum(_ values: [UsageAggregate]) -> UsageAggregate? {
        let grouped: [String: [ModelUsage]] = Dictionary(grouping: values.flatMap(\.models), by: \.name)
        var models: [ModelUsage] = grouped.map { name, rows in
            ModelUsage(name: name, tokens: tokens(rows.map(\.tokens)), cost: cost(rows.map(\.cost)), pricing: ModelPricing.merge(rows.map(\.pricing)))
        }
        models.sort { left, right in
            if left.cost.knownCostUSD == right.cost.knownCostUSD { return left.name < right.name }
            return left.cost.knownCostUSD > right.cost.knownCostUSD
        }
        // An empty provider/day adds no evidence about whether real usage was priced.
        let pricedValues = values.filter { row in
            let t = row.tokens
            return !(row.cost.status == "estimated" && row.cost.amountUSD == 0 && row.models.isEmpty &&
                [t.input, t.output, t.cacheRead, t.cacheWrite, t.total].allSatisfy { $0 == 0 })
        }
        let result = UsageAggregate(tokens: tokens(values.map(\.tokens)), cost: cost(pricedValues.map(\.cost)), models: models)
        guard (try? result.validate()) != nil else { return nil }
        return result
    }
    private static func tokens(_ values: [UsageTokens]) -> UsageTokens {
        UsageTokens(input: values.reduce(0) { $0 + $1.input }, output: values.reduce(0) { $0 + $1.output },
            cacheRead: values.reduce(0) { $0 + $1.cacheRead }, cacheWrite: values.reduce(0) { $0 + $1.cacheWrite }, total: values.reduce(0) { $0 + $1.total })
    }
    private static func cost(_ values: [UsageCost]) -> UsageCost {
        let known = values.reduce(0) { $0 + $1.knownCostUSD }
        let status = values.allSatisfy { $0.status == "estimated" } ? "estimated" :
            values.contains { $0.status != "unknown" } ? "partial" : "unknown"
        return UsageCost(amountUSD: status == "estimated" ? known : nil, knownCostUSD: known, status: status)
    }
}
public struct UsageHistoryDay: Decodable, Sendable {
    public let date: String
    public let provider: UsageProvider
    public let aggregate: UsageAggregate
    private enum Keys: String, CodingKey { case date, provider, aggregate, cost, models, amountUSD }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        date = try c.decode(String.self, forKey: .date)
        provider = try c.decode(UsageProvider.self, forKey: .provider)
        aggregate = try c.decode(UsageAggregate.self, forKey: .aggregate)
        let raw = try c.nestedContainer(keyedBy: Keys.self, forKey: .aggregate)
        try Self.requirePriceField(raw)
        var models = try raw.nestedUnkeyedContainer(forKey: .models)
        while !models.isAtEnd { try Self.requirePriceField(models.nestedContainer(keyedBy: Keys.self)) }
    }
    private static func requirePriceField(_ c: KeyedDecodingContainer<Keys>) throws {
        let cost = try c.nestedContainer(keyedBy: Keys.self, forKey: .cost)
        guard cost.contains(.amountUSD) else { throw SnapshotError.invalid }
    }
}
public enum UsageHistoryPreset: String, CaseIterable, Sendable, Identifiable {
    case sevenDays = "7d", thirtyDays = "30d", month, previousMonth = "previous", custom
    public var id: String { rawValue }
}
public struct UsageHistoryRange: Sendable, Equatable {
    public let start, end: String
    public init(start: String, end: String) { self.start = start; self.end = end }
}
public struct UsageHistoryProjection: Sendable {
    public struct Day: Sendable, Identifiable {
        public let date: String
        public let aggregate: UsageAggregate
        public var id: String { date }
    }
    public let range: UsageHistoryRange
    public let provider: String
    public let aggregate: UsageAggregate
    public let days: [Day]
}
