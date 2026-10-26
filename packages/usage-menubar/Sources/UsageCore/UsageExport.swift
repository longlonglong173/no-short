import Foundation

public enum UsageExportFormat: String, CaseIterable, Sendable { case csv, json }

/// An immutable copy of the selected daily projection. Session references never contribute usage.
public struct UsageExport: Encodable, Sendable {
    public let formatVersion = 1
    public let costBasis = "api-equivalent-estimate-not-billing"
    public let provider, start, end, timeZone, generatedAt, status: String
    public let pricing: SnapshotPricing?
    public let aggregate: UsageAggregate
    public let days: [Day]
    public let grouping: UsageGroupingExport?
    public let sessionReferences: SessionReferences?
    public struct Day: Encodable, Sendable {
        public let date: String
        public let aggregate: UsageAggregate
    }
    public struct SessionReferences: Encodable, Sendable {
        public let scope = "last-activity-in-range-not-cost-attribution"
        public let items: [Item]
        public struct Item: Encodable, Sendable {
            public let id, title: String
            public let provider: UsageProvider
            public let lastActivity: String
        }
    }
    public static func create(_ snapshot: UsageSnapshot, provider: String, start: String, end: String,
                              includeSessionIdentifiers: Bool = false, isStale: Bool = false, groupBy: String = "none") -> Self? {
        guard let projection = UsageHistory.project(snapshot, provider: provider, range: .init(start: start, end: end)) else { return nil }
        var grouping: UsageGroupingExport?
        if groupBy != "none" {
            guard ["project","work"].contains(groupBy),let groups=UsageGrouping.project(snapshot,provider:provider,range:.init(start:start,end:end)),groups.reconciliationIssue != "tokens" else { return nil }
            grouping=UsageGroupingExport.create(groups,by:groupBy,includeIdentifiers:includeSessionIdentifiers)
        }
        var references: SessionReferences?
        if includeSessionIdentifiers {
            let items: [SessionReferences.Item] = snapshot.sessions.compactMap { session in
                guard (provider == "all" || session.usageProvider.rawValue == provider),
                      snapshot.history?.providers.contains(session.usageProvider) == true,
                      let activity = session.lastActivity, let date = activityDate(activity) else { return nil }
                let day = UsageHistory.dayString(date, timeZone: snapshot.timeZone)
                guard day >= start, day <= end else { return nil }
                return .init(id: session.id, title: session.title, provider: session.usageProvider, lastActivity: activity)
            }
            references = SessionReferences(items: items)
        }
        return Self(provider: provider, start: start, end: end, timeZone: snapshot.timeZone,
            generatedAt: snapshot.generatedAtText, status: isStale ? "stale" : snapshot.status,
            pricing: snapshot.pricing, aggregate: projection.aggregate, days: projection.days.map { Day(date: $0.date, aggregate: $0.aggregate) }, grouping: grouping, sessionReferences: references)
    }
    public func serialize(_ format: UsageExportFormat) throws -> String {
        if format == .json {
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
            return String(decoding: try encoder.encode(self), as: UTF8.self) + "\n"
        }
        var columns = ["recordType", "scope", "date", "provider", "model", "input", "output", "cacheRead", "cacheWrite", "total",
            "amountUSD", "knownCostUSD", "pricingStatus", "timezone", "start", "end", "generatedAt", "status", "costBasis"]
        if pricing != nil { columns += ["pricingBasis", "pricingOrigin", "pricingUpdatedAt", "inputUSDPerMillion", "outputUSDPerMillion", "cacheReadUSDPerMillion", "cacheWriteUSDPerMillion"] }
        if sessionReferences != nil { columns += ["sessionId", "sessionTitle", "lastActivity"] }
        if grouping != nil { columns += ["groupBy","groupLabel","groupSource","groupConfidence","groupReconciled","groupReconciliationIssue","depth"] }
        var lines = [columns.map { Self.csvCell(.text($0)) }.joined(separator: ",")]
        let metadata: [String: Cell] = ["timezone": .text(timeZone), "start": .text(start), "end": .text(end),
            "generatedAt": .text(generatedAt), "status": .text(status), "costBasis": .text(costBasis), "pricingBasis": .text(pricing?.basis ?? "ccusage-report")]
        func write(_ row: [String: Cell]) {
            let record = metadata.merging(row) { _, new in new }
            lines.append(columns.map { Self.csvCell(record[$0]) }.joined(separator: ","))
        }
        func usage(_ type: String, _ scope: String, _ date: String, _ tokens: UsageTokens, _ cost: UsageCost, _ model: String = "", _ pricing: ModelPricing? = nil, _ extra: [String:Cell] = [:]) {
            var row: [String: Cell] = ["recordType": .text(type), "scope": .text(scope), "date": .text(date), "provider": .text(provider), "model": .text(model),
                "input": .number(tokens.input), "output": .number(tokens.output), "cacheRead": .number(tokens.cacheRead),
                "cacheWrite": .number(tokens.cacheWrite), "total": .number(tokens.total), "knownCostUSD": .number(cost.knownCostUSD), "pricingStatus": .text(cost.status)]
            if let pricing {
                row["pricingOrigin"] = .text(pricing.source)
                if let updatedAt = pricing.updatedAt { row["pricingUpdatedAt"] = .text(updatedAt) }
                if let rates = pricing.rates {
                    row["inputUSDPerMillion"] = .number(rates.input); row["outputUSDPerMillion"] = .number(rates.output)
                    row["cacheReadUSDPerMillion"] = .number(rates.cacheRead); row["cacheWriteUSDPerMillion"] = .number(rates.cacheWrite)
                }
            }
            if let amount = cost.amountUSD { row["amountUSD"] = .number(amount) }
            write(row.merging(extra) { _,new in new })
        }
        usage("aggregate", "selected-range", "", aggregate.tokens, aggregate.cost)
        for model in aggregate.models { usage("model", "selected-range", "", model.tokens, model.cost, model.name, model.pricing) }
        for day in days {
            usage("day", "day", day.date, day.aggregate.tokens, day.aggregate.cost)
            for model in day.aggregate.models { usage("day-model", "day", day.date, model.tokens, model.cost, model.name, model.pricing) }
        }
        if let grouping {
            for group in grouping.groups {
                let extra:[String:Cell] = ["groupBy":.text(grouping.by),"groupLabel":.text(group.label),"groupSource":.text(group.source ?? ""),"groupConfidence":.text(group.confidence ?? ""),"groupReconciled":.text(String(grouping.reconciled)),"groupReconciliationIssue":.text(grouping.reconciliationIssue ?? "")]
                usage("group","selected-range-rollup","",group.aggregate.tokens,group.aggregate.cost,"",nil,extra)
                for model in group.aggregate.models { usage("group-model","selected-range-rollup","",model.tokens,model.cost,model.name,model.pricing,extra) }
                for session in group.sessions ?? [] {
                    let fields=extra.merging(["sessionId":.text(session.id),"sessionTitle":.text(session.title),"provider":.text(session.provider.rawValue),"depth":.number(Double(session.depth))]) { _,new in new }
                    usage("group-session","selected-range-direct","",session.aggregate.tokens,session.aggregate.cost,"",nil,fields)
                    for model in session.aggregate.models { usage("group-session-model","selected-range-direct","",model.tokens,model.cost,model.name,model.pricing,fields) }
                }
            }
        }
        if let sessionReferences {
            for session in sessionReferences.items {
                let date = Self.activityDate(session.lastActivity).map { UsageHistory.dayString($0, timeZone: timeZone) } ?? ""
                write(["recordType": .text("session-reference"), "scope": .text(sessionReferences.scope), "date": .text(date),
                    "provider": .text(session.provider.rawValue), "sessionId": .text(session.id), "sessionTitle": .text(session.title), "lastActivity": .text(session.lastActivity)])
            }
        }
        return lines.joined(separator: "\r\n") + "\r\n"
    }
    private enum Cell { case text(String), number(Double) }
    private static func csvCell(_ value: Cell?) -> String {
        switch value {
        case nil: return ""
        case .number(let number):
            let text = String(number)
            return text.hasSuffix(".0") ? String(text.dropLast(2)) : text
        case .text(let value):
            let trimmed = value.drop(while: { $0.isWhitespace || $0 == "\u{feff}" })
            let unsafe = trimmed.first.map { "=+-@".contains($0) } ?? false
            let safe = unsafe ? "'" + value : value
            return "\"" + safe.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
    }
    private static func activityDate(_ text: String) -> Date? {
        let pattern = #"^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]+)?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$"#
        guard text.range(of: pattern, options: .regularExpression) != nil,
              UsageHistory.date(String(text.prefix(10)), timeZone: "UTC") != nil else { return nil }
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: text) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: text)
    }
}
