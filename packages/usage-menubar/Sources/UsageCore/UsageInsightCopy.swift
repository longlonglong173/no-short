import Foundation

public enum UsageInsightCopy {
    public static func reason(_ value: UsageInsightReason, language: AppLanguage) -> String {
        let key: String
        switch value {
        case .stale: key = "Dữ liệu cũ hoặc lỗi; cần làm mới."
        case .unavailable: key = "Lịch sử chưa khả dụng cho công cụ này."
        case .history: key = "Cần 7 ngày có quan sát trong 30 ngày trước hôm nay."
        case .baseline: key = "Trung vị bằng 0; chưa đủ cơ sở xác định bất thường."
        case .today: key = "Chưa có ngày hiện tại được quan sát; không coi là $0."
        case .pricing: key = "Thiếu cơ sở giá đầy đủ; không suy ra từ phần đã biết."
        case .overflow: key = "Chi phí vượt giới hạn tính toán; chưa đủ căn cứ."
        }
        return AppLocalization(language: language).text(key)
    }
    public static func money(_ value: Double?) -> String { value.map { String(format: "$%.2f", $0) } ?? "—" }
    public static func anomaly(_ value: UsageInsightsResult, language: AppLanguage) -> String {
        let l = AppLocalization(language: language)
        if let reason = value.anomalyReason { return Self.reason(reason, language: language) }
        return l.text(value.anomaly == true ? "Chi phí hôm nay vượt ngưỡng bất thường." : "Chi phí hôm nay chưa vượt ngưỡng bất thường.") + " " +
            l.text("Ngưỡng: 2 × %@ = %@; hôm nay %@.", money(value.medianUSD), money(value.thresholdUSD), money(value.todayUSD))
    }
}
