import SwiftUI
import UsageCore

struct UsageInsightsView: View {
    let value: UsageInsightsResult
    let snapshot: UsageSnapshot?
    let anomalyEnabled, scenarioEnabled: Bool
    let language: AppLanguage
    private var l: AppLocalization { AppLocalization(language: language) }
    private var origins: [String] {
        let rows = snapshot?.history?.days.filter { d in
            (value.provider == "all" || d.provider.rawValue == value.provider) && d.date <= value.today &&
            (d.date >= String(value.today.prefix(7)) + "-01" || value.sampleDates.contains(d.date))
        } ?? []
        return Set(rows.flatMap { $0.aggregate.models }.compactMap { m in m.pricing.map { m.name + " · " + $0.description(language: language) } }).sorted()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(l.text("Bất thường và kịch bản tháng")).font(.headline)
            Text((value.provider == "all" ? l.text("Tất cả") : value.provider == "codex" ? "Codex" : "Claude Code") + " · " + (snapshot?.timeZone ?? "") + " · " + value.today)
            Text(l.text("Phân tích hôm nay %@ và tháng %@, độc lập khoảng lịch sử đã chọn.", value.today, String(value.today.prefix(7))))
            Text(l.text("Mẫu %@/7 ngày quan sát: %@ → %@", String(value.sampleCount), value.sampleDates.first ?? "—", value.sampleDates.last ?? "—"))
            Text(l.text("Trong 30 ngày trước hôm nay từ %@; %@ ngày quan sát thiếu giá.", value.windowStart, String(value.excludedUnpricedDays)))
            if anomalyEnabled {
                Text(l.text("Mức dùng bất thường")).fontWeight(.semibold)
                Text(UsageInsightCopy.anomaly(value, language: language)).foregroundStyle(value.anomaly == true ? Color.orange : Color.primary)
            }
            if scenarioEnabled {
                Text(l.text("Kịch bản chi phí API cuối tháng")).fontWeight(.semibold)
                if let reason = value.scenarioReason { Text(UsageInsightCopy.reason(reason, language: language)) }
                else {
                    Text(UsageInsightCopy.money(value.scenarioUSD) + " USD").font(.title3).monospacedDigit()
                    Text(l.text("Đã ghi nhận %@ + trung bình %@/ngày × %@ ngày sau hôm nay.", UsageInsightCopy.money(value.recordedMonthUSD), UsageInsightCopy.money(value.meanUSD), String(value.remainingDays)))
                }
                Text(l.text("Giả định usage mỗi ngày tới giống 7 ngày quan sát. Đây là kịch bản, không phải dự đoán hóa đơn."))
            }
            Text(l.text("Dùng 7 ngày quan sát gần nhất; nếu một ngày thiếu giá thì chưa đủ căn cứ. Không chèn ngày trống thành $0."))
            Text(l.text("Chỉ thống kê log còn trên máy; không phải toàn bộ lịch sử tài khoản."))
            Text(l.text("Ước tính API · Không phải hóa đơn thuê bao"))
            if let pricing = snapshot?.pricing {
                Text(pricing.description(language: language))
                Text(l.text("Phiên bản cơ sở giá: %@", pricing.configurationRevision))
            } else { Text(l.text("Nguồn chưa cung cấp cơ sở giá chi tiết.")) }
            ForEach(origins, id: \.self) { Text($0).foregroundStyle(.secondary) }
            Text(l.text("Tệp xuất chỉ gồm khoảng đã chọn, không gồm kịch bản."))
        }.font(.system(size: 11)).fixedSize(horizontal: false, vertical: true)
            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
            .accessibilityIdentifier("usage-insights")
    }
}
