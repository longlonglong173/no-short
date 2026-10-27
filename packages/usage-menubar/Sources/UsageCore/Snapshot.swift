import Foundation

public enum SnapshotError: Error { case incompatible, invalid }
public struct UsageCost: Codable, Sendable {
    public let amountUSD: Double?
    public let knownCostUSD: Double
    public let status: String
    private enum CodingKeys: String, CodingKey { case amountUSD, knownCostUSD, status }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        if let amountUSD { try c.encode(amountUSD, forKey: .amountUSD) }
        else { try c.encodeNil(forKey: .amountUSD) }
        try c.encode(knownCostUSD, forKey: .knownCostUSD)
        try c.encode(status, forKey: .status)
    }
    func validate() throws {
        guard knownCostUSD.isFinite, knownCostUSD >= 0, ["estimated", "partial", "unknown"].contains(status),
              amountUSD.map({ $0.isFinite && $0 >= 0 }) ?? true,
              status != "estimated" || amountUSD != nil,
              status == "estimated" || amountUSD == nil else { throw SnapshotError.invalid }
    }
}
public struct UsageTokens: Codable, Sendable {
    public let input, output, cacheRead, cacheWrite, total: Double
    func validate() throws {
        guard [input, output, cacheRead, cacheWrite, total].allSatisfy({ $0.isFinite && $0 >= 0 }) else { throw SnapshotError.invalid }
    }
}
public struct ModelUsage: Codable, Sendable {
    public let name: String
    public let tokens: UsageTokens
    public let cost: UsageCost
    public var pricing: ModelPricing? = nil
    public init(name: String, tokens: UsageTokens, cost: UsageCost, pricing: ModelPricing? = nil) {
        self.name = name; self.tokens = tokens; self.cost = cost; self.pricing = pricing
    }
    private enum CodingKeys: String, CodingKey { case name, tokens, cost, pricing }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name); tokens = try c.decode(UsageTokens.self, forKey: .tokens)
        cost = try c.decode(UsageCost.self, forKey: .cost)
        if let value = try? c.decode(ModelPricing.self, forKey: .pricing), value.valid { pricing = value }
    }
}
public struct UsageAggregate: Codable, Sendable {
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
    public let provider: UsageProvider?
    public let sessionKey: String?
    public var usageProvider: UsageProvider { provider ?? .codex }
    public func matches(_ activity: SessionActivity) -> Bool {
        guard usageProvider == activity.provider else { return false }
        if let sessionKey { return sessionKey == activity.sessionID }
        if id == activity.sessionID { return true }
        // Legacy Codex reports identify sessions by dated rollout filenames.
        let pattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
        guard let range = id.range(of:pattern,options:.regularExpression) else { return false }
        return id[range].lowercased() == activity.sessionID.lowercased()
    }
    public let lastActivity: String?
    public let tokens: UsageTokens
    public let cost: UsageCost
    public let models: [ModelUsage]
    public let grouping: SessionGrouping?
    private enum CodingKeys:String,CodingKey { case id,title,kind,provider,sessionKey,lastActivity,tokens,cost,models,grouping }
    public init(from decoder:Decoder) throws {
        let c=try decoder.container(keyedBy:CodingKeys.self)
        id=try c.decode(String.self,forKey:.id);title=try c.decode(String.self,forKey:.title);kind=try c.decode(String.self,forKey:.kind)
        provider=try c.decodeIfPresent(UsageProvider.self,forKey:.provider);sessionKey=try c.decodeIfPresent(String.self,forKey:.sessionKey)
        lastActivity=try c.decodeIfPresent(String.self,forKey:.lastActivity);tokens=try c.decode(UsageTokens.self,forKey:.tokens)
        cost=try c.decode(UsageCost.self,forKey:.cost);models=try c.decode([ModelUsage].self,forKey:.models)
        let optional=try? c.decode(SessionGrouping.self,forKey:.grouping);grouping=optional?.valid == true ? optional : nil
    }
}
public struct ChartDay: Decodable, Sendable { public let date: String; public let cost: UsageCost }
public struct ProviderBreakdown: Decodable, Sendable {
    public let provider: UsageProvider
    public let today, month: UsageAggregate
    public let chart: [ChartDay]
}
public struct UsageSnapshot: Decodable, Sendable {
    public let schemaVersion: Int
    public let source, ccusageVersion: String
    public let generatedAt: Date
    public let generatedAtText: String
    public let timeZone, status, pricingSource: String
    public let notice: String?
    public let sessions: [SessionUsage]
    public let today, month: UsageAggregate
    public let chart: [ChartDay]
    public let providerBreakdowns: [ProviderBreakdown]?
    public let history: UsageHistory?
    public let pricing: SnapshotPricing?
    private enum CodingKeys: String, CodingKey {
        case schemaVersion, source, ccusageVersion, generatedAt, timeZone, status, pricingSource, notice
        case sessions, today, month, chart, providerBreakdowns, history, pricing
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decode(Int.self, forKey: .schemaVersion)
        source = try c.decode(String.self, forKey: .source)
        ccusageVersion = try c.decode(String.self, forKey: .ccusageVersion)
        generatedAt = try c.decode(Date.self, forKey: .generatedAt)
        generatedAtText = try c.decode(String.self, forKey: .generatedAt)
        timeZone = try c.decode(String.self, forKey: .timeZone)
        status = try c.decode(String.self, forKey: .status)
        pricingSource = try c.decode(String.self, forKey: .pricingSource)
        notice = try c.decodeIfPresent(String.self, forKey: .notice)
        sessions = try c.decode([SessionUsage].self, forKey: .sessions)
        today = try c.decode(UsageAggregate.self, forKey: .today)
        month = try c.decode(UsageAggregate.self, forKey: .month)
        chart = try c.decode([ChartDay].self, forKey: .chart)
        providerBreakdowns = try c.decodeIfPresent([ProviderBreakdown].self, forKey: .providerBreakdowns)
        // An unsupported or malformed optional extension must not discard a valid v1 dashboard.
        history = try? c.decode(UsageHistory.self, forKey: .history)
        let value = try? c.decode(SnapshotPricing.self, forKey: .pricing)
        pricing = value?.valid == true ? value : nil
    }
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
        for provider in s.providerBreakdowns ?? [] {
            try provider.today.validate(); try provider.month.validate()
            for point in provider.chart { try point.cost.validate() }
        }
        return s
    }
    public func isStale(at now: Date) -> Bool {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone)!
        let age = now.timeIntervalSince(generatedAt)
        return status == "stale" || status == "error" || age > 45 || age < -60 || !calendar.isDate(now, inSameDayAs: generatedAt)
    }
}
