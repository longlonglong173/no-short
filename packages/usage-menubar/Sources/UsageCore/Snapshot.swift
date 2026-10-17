import Foundation

public enum SnapshotError: Error { case incompatible, invalid }
public struct UsageCost: Decodable, Sendable {
    public let amountUSD: Double?
    public let knownCostUSD: Double
    public let status: String
    func validate() throws {
        guard knownCostUSD.isFinite, knownCostUSD >= 0, ["estimated", "partial", "unknown"].contains(status),
              amountUSD.map({ $0.isFinite && $0 >= 0 }) ?? true,
              status != "estimated" || amountUSD != nil,
              status == "estimated" || amountUSD == nil else { throw SnapshotError.invalid }
    }
}
public struct UsageTokens: Decodable, Sendable {
    public let input, output, cacheRead, cacheWrite, total: Double
    func validate() throws {
        guard [input, output, cacheRead, cacheWrite, total].allSatisfy({ $0.isFinite && $0 >= 0 }) else { throw SnapshotError.invalid }
    }
}
public struct ModelUsage: Decodable, Sendable {
    public let name: String
    public let tokens: UsageTokens
    public let cost: UsageCost
}
public struct UsageAggregate: Decodable, Sendable {
    public let tokens: UsageTokens
    public let cost: UsageCost
    public let models: [ModelUsage]
    func validate() throws {
        try tokens.validate(); try cost.validate()
        for model in models { try model.tokens.validate(); try model.cost.validate() }
    }
}
public struct SessionUsage: Decodable, Sendable {
    public let id, title, kind: String
    public let lastActivity: String?
    public let tokens: UsageTokens
    public let cost: UsageCost
    public let models: [ModelUsage]
}
public struct ChartDay: Decodable, Sendable { public let date: String; public let cost: UsageCost }
public struct UsageSnapshot: Decodable, Sendable {
    public let schemaVersion: Int
    public let source, ccusageVersion: String
    public let generatedAt: Date
    public let timeZone, status, pricingSource: String
    public let notice: String?
    public let sessions: [SessionUsage]
    public let today, month: UsageAggregate
    public let chart: [ChartDay]
    public var latestSession: SessionUsage? {
        sessions.first { $0.kind == "main" } ?? sessions.first { $0.kind != "subagent" }
    }
    public static func decode(_ data: Data) throws -> UsageSnapshot {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: text) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            guard let date = formatter.date(from: text) else { throw SnapshotError.invalid }
            return date
        }
        let s = try decoder.decode(Self.self, from: data)
        guard s.schemaVersion == 1, s.source == "ccusage", s.ccusageVersion == "20.0.34" else { throw SnapshotError.incompatible }
        guard TimeZone(identifier: s.timeZone) != nil, ["ready", "empty", "stale", "error"].contains(s.status),
              ["online", "cached"].contains(s.pricingSource) else { throw SnapshotError.invalid }
        try s.today.validate(); try s.month.validate()
        for session in s.sessions {
            guard ["main", "unknown", "subagent"].contains(session.kind), !session.id.isEmpty else { throw SnapshotError.invalid }
            try session.tokens.validate(); try session.cost.validate()
            for model in session.models { try model.tokens.validate(); try model.cost.validate() }
        }
        for point in s.chart { try point.cost.validate() }
        return s
    }
    public func isStale(at now: Date) -> Bool {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone)!
        let age = now.timeIntervalSince(generatedAt)
        return status == "stale" || status == "error" || age > 45 || age < -60 || !calendar.isDate(now, inSameDayAs: generatedAt)
    }
}
