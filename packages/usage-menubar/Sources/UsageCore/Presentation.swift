import Foundation

public struct UsagePresentation: Sendable {
    public let statusTitle, tooltip: String
    public let todayLines, monthLines, sessionLines: [String]
    public static func money(_ cost: UsageCost) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .decimal
        // Match Intl.NumberFormat USD half-expand rounding in the panel.
        formatter.roundingMode = .halfUp
        formatter.minimumFractionDigits = 2; formatter.maximumFractionDigits = 2
        let amount = formatter.string(from: NSNumber(value: cost.amountUSD ?? cost.knownCostUSD)) ?? "—"
        switch cost.status { case "estimated": return "$" + amount; case "partial": return "≥$" + amount; default: return "—" }
    }
    public static func number(_ value: Double) -> String {
        let formatter = NumberFormatter(); formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .decimal; formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value)) ?? "—"
    }
    public static func make(snapshot: UsageSnapshot?, stale: Bool, loading: Bool, now: Date, language: AppLanguage = .vietnamese) -> Self {
        func l(_ key: String, _ arguments: String...) -> String { AppLocalization(language: language).text(key, arguments: arguments) }
        guard let s = snapshot else {
            return Self(statusTitle: loading ? "NS …" : "NS —", tooltip: l("No Short Usage · Chưa có dữ liệu"), todayLines: [], monthLines: [], sessionLines: [])
        }
        let old = stale || s.isStale(at: now)
        let tokens = s.today.tokens
        let today = [l("Hôm nay: %@", String(money(s.today.cost))), l("Input: %@ · Output: %@", number(tokens.input), number(tokens.output)), l("Cache read: %@ · Cache write: %@", number(tokens.cacheRead), number(tokens.cacheWrite)), l("Tổng token: %@", String(number(tokens.total)))]
        let month = [l("Tháng này: %@ · %@ token", String(money(s.month.cost)), String(number(s.month.tokens.total)))]
        let session = s.latestSession.map { [l("Phiên: %@", String(cleanTitle($0.title))), "\(money($0.cost)) · \(number($0.tokens.total)) token"] } ?? [l("Chưa có phiên chính")]
        let updated = DateFormatter(); updated.locale = language.locale; updated.timeZone = TimeZone(identifier: s.timeZone)
        updated.setLocalizedDateFormatFromTemplate("HHmmssyyyyMMdd")
        var tooltipLines = [l("No Short Usage · Ước tính tương đương API · USD")]
        tooltipLines.append(contentsOf: today)
        tooltipLines.append(contentsOf: month)
        tooltipLines.append(contentsOf: session)
        tooltipLines.append(l("Cập nhật: %@ (%@)", String(updated.string(from: s.generatedAt)), String(s.timeZone)))
        if old { tooltipLines.append(l("⚠ Dữ liệu cũ hoặc không khả dụng")) }
        let tip = tooltipLines.joined(separator: "\n")
        return Self(statusTitle: "NS \(money(s.today.cost))" + (old ? " ⚠" : ""), tooltip: tip, todayLines: today, monthLines: month, sessionLines: session)
    }
    public static func cleanTitle(_ value: String) -> String {
        String(value.unicodeScalars.map { CharacterSet.controlCharacters.contains($0) ? " " : String($0) }.joined())
    }
}
