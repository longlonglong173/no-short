import SwiftUI
import UsageCore

struct UsageComparisonView: View {
    let value: UsageComparisonResult
    let language: AppLanguage
    private func l(_ key: String, _ args: String...) -> String { AppLocalization(language: language).text(key, arguments: args) }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(l("So sánh hai khoảng thời gian")).font(.headline)
            Text(l("Kỳ đã chọn: %@ → %@", value.currentRange.start, value.currentRange.end))
            Text(l("Kỳ trước: %@ → %@", value.previousRange.start, value.previousRange.end))
            row(value.summary, summary: true)
            Text(l("Theo công cụ")).font(.headline)
            ForEach(value.providers) { row($0) }
            if !value.models.isEmpty {
                Text(l("Theo model")).font(.headline)
                ForEach(value.models) { row($0) }
            }
            Text(l("Cache read / (Input + Cache read + Cache write); không gồm Output."))
            Text(l("Chỉ log hiện còn trên máy · Không phải toàn bộ lịch sử tài khoản."))
            Text(l("Tệp xuất chỉ gồm khoảng đã chọn, không gồm kỳ so sánh."))
        }.font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("history-comparison")
    }
    private func row(_ row: UsageComparisonRow, summary: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if !summary { Text(row.name == "codex" ? "Codex" : row.name == "claude" ? "Claude Code" : row.name).fontWeight(.semibold).textSelection(.enabled) }
            Text(l("Hiện tại %@ · Trước %@", UsagePresentation.money(row.current.cost), UsagePresentation.money(row.previous.cost)))
                .foregroundStyle(.secondary)
            metric(l("Thay đổi chi phí"), cost(row.cost))
            metric(l("Thay đổi token"), number(row.tokens.absolute) + " · " + percent(row.tokens.percent))
            metric(l("Tỷ lệ cache read"), ratio(row.cache.previous) + " → " + ratio(row.cache.current))
            metric(l("Thay đổi cache"), row.cache.percentagePoints.map { l("%@ điểm phần trăm", number($0, digits: 1)) } ?? l("Không áp dụng"))
        }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
            .accessibilityElement(children: .combine)
    }
    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).foregroundStyle(.secondary)
            Text(value).monospacedDigit()
        }
    }
    private func number(_ value: Double, digits: Int = 0, signed: Bool = true) -> String {
        let formatter = NumberFormatter(); formatter.locale = language.locale; formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = digits; formatter.maximumFractionDigits = digits
        return (signed && value > 0 ? "+" : "") + (formatter.string(from: NSNumber(value: value)) ?? "—")
    }
    private func percent(_ value: Double?) -> String { value.map { number($0, digits: 1) + "%" } ?? l("Không áp dụng") }
    private func ratio(_ value: Double?) -> String { value.map { number($0 * 100, digits: 1, signed: false) + "%" } ?? l("Không áp dụng") }
    private func cost(_ value: UsageComparisonDelta?) -> String {
        guard let value else { return l("Chưa đủ dữ liệu giá hoặc dữ liệu đã cũ.") }
        let sign = value.absolute < 0 ? "−" : value.absolute > 0 ? "+" : ""
        return sign + String(format: "$%.2f", abs(value.absolute)) + " · " + percent(value.percent)
    }
}
