import Foundation

public struct UsagePresentation: Sendable {
    public let statusTitle, tooltip: String
    public let todayLines, monthLines, sessionLines: [String]
    public static func money(_ cost: UsageCost) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2; formatter.maximumFractionDigits = 2
        let amount = formatter.string(from: NSNumber(value: cost.amountUSD ?? cost.knownCostUSD)) ?? "—"
        switch cost.status { case "estimated": return "$" + amount; case "partial": return "≥$" + amount; default: return "—" }
    }
    public static func number(_ value: Double) -> String {
        let formatter = NumberFormatter(); formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .decimal; formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value)) ?? "—"
    }
    public static func make(snapshot: UsageSnapshot?, stale: Bool, loading: Bool, now: Date) -> Self {
        guard let s = snapshot else {
            return Self(statusTitle: loading ? "NS …" : "NS —", tooltip: "No Short Usage · Chưa có dữ liệu", todayLines: [], monthLines: [], sessionLines: [])
        }
        let old = stale || s.isStale(at: now)
        let tokens = s.today.tokens
        let today = ["Hôm nay: \(money(s.today.cost))", "Input: \(number(tokens.input)) · Output: \(number(tokens.output))", "Cache read: \(number(tokens.cacheRead)) · Cache write: \(number(tokens.cacheWrite))", "Tổng token: \(number(tokens.total))"]
        let month = ["Tháng này: \(money(s.month.cost)) · \(number(s.month.tokens.total)) token"]
        let session = s.latestSession.map { ["Phiên: \(cleanTitle($0.title))", "\(money($0.cost)) · \(number($0.tokens.total)) token"] } ?? ["Chưa có phiên chính"]
        let updated = DateFormatter(); updated.locale = Locale(identifier: "vi_VN"); updated.timeZone = TimeZone(identifier: s.timeZone)
        updated.dateFormat = "HH:mm:ss dd/MM/yyyy"
        var tooltipLines = ["No Short Usage · Ước tính tương đương API · USD"]
        tooltipLines.append(contentsOf: today)
        tooltipLines.append(contentsOf: month)
        tooltipLines.append(contentsOf: session)
        tooltipLines.append("Cập nhật: \(updated.string(from: s.generatedAt)) (\(s.timeZone))")
        if old { tooltipLines.append("⚠ Dữ liệu cũ hoặc không khả dụng") }
        let tip = tooltipLines.joined(separator: "\n")
        return Self(statusTitle: "NS \(money(s.today.cost))" + (old ? " ⚠" : ""), tooltip: tip, todayLines: today, monthLines: month, sessionLines: session)
    }
    public static func cleanTitle(_ value: String) -> String {
        String(value.unicodeScalars.map { CharacterSet.controlCharacters.contains($0) ? " " : String($0) }.joined())
    }
}
