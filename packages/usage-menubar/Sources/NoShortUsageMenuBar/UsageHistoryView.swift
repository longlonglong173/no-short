import SwiftUI
import Charts
import UsageCore

struct UsageHistoryView: View {
    @ObservedObject var model: UsageHistoryModel
    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 20) {
                Text(model.l("Chi tiết sử dụng")).font(.title2.bold())
                controls
                exportControls
                if model.preset == .custom { customDates }
                VStack(alignment: .leading, spacing: 5) {
                    Text(model.scopeLabel).fontWeight(.medium)
                    Text(model.updatedLabel)
                    Text(model.l("Nguồn: %@", model.source)).textSelection(.enabled)
                    Text(model.l("Chỉ log hiện còn trên máy · Không phải toàn bộ lịch sử tài khoản."))
                    Text(model.l("Ước tính API · Không phải hóa đơn thuê bao"))
                }.font(.system(size: 11)).foregroundStyle(.secondary)
                if let pricing = model.snapshot?.pricing {
                    Text(pricing.description(language: model.language)).font(.system(size: 11)).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let failure = model.exportFailureMessage { warning(failure) }
                if let validation = model.validationMessage { warning(validation) }
                if let notice = model.notice { warning(model.l(notice)) }
                if model.isStale { warning(model.l("Dữ liệu cũ · đang chờ cập nhật")) }
                if model.isLoading { ProgressView(model.l("Đang cập nhật…")).controlSize(.small) }
                if let projection = model.projection {
                    summary(projection.aggregate)
                    if projection.days.isEmpty {
                        Text(model.l("Không có usage trong log hiện còn cho khoảng này.")).foregroundStyle(.secondary)
                    } else {
                        dailyChart(projection)
                    }
                    models
                } else {
                    Text(model.l("Lịch sử chưa khả dụng cho nguồn này. Làm mới bằng runtime hỗ trợ lịch sử."))
                        .foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
        }
        .focusable()
        .background(Color(nsColor: .windowBackgroundColor))
        .environment(\.locale, model.language.locale)
    }
    private var controls: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), alignment: .leading)], alignment: .leading, spacing: 12) {
            Picker(model.l("Công cụ"), selection: Binding(get: { model.provider }, set: { model.setProvider($0) })) {
                Text(model.l("Tất cả")).tag("all")
                Text("Codex").tag("codex")
                Text("Claude Code").tag("claude")
            }.accessibilityIdentifier("history-provider")
            Picker(model.l("Khoảng ngày"), selection: Binding(get: { model.preset }, set: { model.setPreset($0) })) {
                ForEach(UsageHistoryPreset.allCases) { preset in Text(model.presetTitle(preset)).tag(preset) }
            }.accessibilityIdentifier("history-range")
            Button(model.l("Làm mới")) { model.onRefresh?() }
                .keyboardShortcut("r").disabled(model.isLoading)
        }
    }
    private var exportControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button(model.l("Lưu CSV…")) { model.onExport?(.csv, model.includeSessionIdentifiers) }
                    .accessibilityIdentifier("history-export-csv")
                Button(model.l("Lưu JSON…")) { model.onExport?(.json, model.includeSessionIdentifiers) }
                    .accessibilityIdentifier("history-export-json")
            }.disabled(model.projection == nil || model.isExporting)
            Toggle(isOn: $model.includeSessionIdentifiers) {
                Text(model.l("Kèm ID và tên phiên có hoạt động cuối trong khoảng; chỉ tham chiếu, không phân bổ chi phí hoặc token."))
                    .font(.system(size: 11)).fixedSize(horizontal: false, vertical: true)
            }.toggleStyle(.checkbox).disabled(model.isExporting)
                .accessibilityIdentifier("history-export-references")
        }
    }
    private var customDates: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), alignment: .leading)], alignment: .leading, spacing: 10) {
            TextField(model.l("Từ ngày (YYYY-MM-DD)"), text: $model.customStart)
            TextField(model.l("Đến ngày (YYYY-MM-DD)"), text: $model.customEnd)
            Button(model.l("Áp dụng")) { model.applyCustom(start: model.customStart, end: model.customEnd) }
        }.textFieldStyle(.roundedBorder)
    }
    private func warning(_ text: String) -> some View {
        Label(text, systemImage: "exclamationmark.triangle").font(.system(size: 12))
            .foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true)
    }
    private func summary(_ aggregate: UsageAggregate) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(model.l("Tổng trong khoảng đã chọn")).font(.headline)
            HStack(alignment: .firstTextBaseline) {
                Text(UsagePresentation.money(aggregate.cost)).font(.system(size: 32, weight: .semibold)).monospacedDigit()
                Text("USD").foregroundStyle(.secondary)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), alignment: .leading)], alignment: .leading, spacing: 10) {
                token("Input", aggregate.tokens.input); token("Output", aggregate.tokens.output)
                token("Cache read", aggregate.tokens.cacheRead); token("Cache write", aggregate.tokens.cacheWrite)
                token("Tổng token", aggregate.tokens.total)
            }
            Text(model.l("≥ là phần chi phí đã biết; — là giá chưa biết, không phải $0."))
                .font(.system(size: 11)).foregroundStyle(.secondary)
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
    }
    private func token(_ title: String, _ value: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(model.l(title)).font(.system(size: 11)).foregroundStyle(.secondary)
            Text(UsagePresentation.number(value)).monospacedDigit()
        }
    }
    private func dailyChart(_ projection: UsageHistoryProjection) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(model.l("Chi phí theo ngày")).font(.headline)
            Chart {
                ForEach(model.chartPoints) { point in
                    if let amount = point.amount {
                        BarMark(x: .value(model.l("Ngày"), point.date), y: .value("USD", amount))
                            .foregroundStyle(point.markerAmount == nil ? Color.accentColor.opacity(0.8) : Color.orange.opacity(0.6))
                            .opacity(model.selectedDay == nil || model.selectedDay == point.date ? 1 : 0.4)
                            .accessibilityLabel(point.description)
                    }
                    if let knownAmount = point.markerAmount {
                        PointMark(x: .value(model.l("Ngày"), point.date), y: .value("USD", knownAmount))
                            .symbol(.triangle).symbolSize(70).foregroundStyle(.orange)
                            .annotation(position: .top) {
                                Text(point.pricingLabel).font(.system(size: 9)).foregroundStyle(.orange)
                                    .help(point.description)
                            }
                            .accessibilityLabel(point.description)
                    }
                }
            }
            .chartXScale(domain: projection.days.map(\.date))
            .chartYScale(domain: 0...max(0.01, (projection.days.map { $0.aggregate.cost.amountUSD ?? $0.aggregate.cost.knownCostUSD }.max() ?? 0) * 1.1))
            .chartXSelection(value: Binding(get: { model.selectedDay }, set: { model.selectDay($0) }))
            .frame(height: 180)
            Text(model.l("Ngày không có dòng: không có usage trong log hiện còn. Giá chưa biết không được vẽ thành $0."))
                .font(.system(size: 11)).foregroundStyle(.secondary)
            Picker(model.l("Xem model theo ngày"), selection: Binding(get: { model.selectedDay ?? "" }, set: { model.selectDay($0.isEmpty ? nil : $0) })) {
                Text(model.l("Toàn khoảng")).tag("")
                ForEach(model.chartPoints) { point in
                    Text(point.description).tag(point.date)
                }
            }.accessibilityIdentifier("history-day")
        }
    }
    private var models: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(model.breakdownLabel).font(.headline)
            if model.modelRows.isEmpty {
                Text(model.l("Chưa có dữ liệu theo model")).foregroundStyle(.secondary)
            } else {
                ScrollView(.horizontal) {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack {
                            Text(model.l("Model")).frame(width: 220, alignment: .leading)
                            ForEach(["Input", "Output", "Cache read", "Cache write", "Tổng token", "USD"], id: \.self) { title in
                                Text(model.l(title)).frame(width: 86, alignment: .trailing)
                            }
                        }.font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary).padding(.vertical, 8)
                        Divider()
                        ForEach(Array(model.modelRows.enumerated()), id: \.offset) { _, row in
                            modelRow(row)
                            Divider()
                        }
                    }.textSelection(.enabled)
                }
            }
        }
    }
    private func modelRow(_ row: ModelUsage) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 5) {
                Text(UsagePresentation.cleanTitle(row.name)).help(row.name)
                if let pricing = row.pricing { Text(pricing.description(language: model.language)).font(.system(size: 10)).foregroundStyle(.secondary) }
            }.frame(width: 220, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            ForEach(Array([row.tokens.input, row.tokens.output, row.tokens.cacheRead, row.tokens.cacheWrite, row.tokens.total].enumerated()), id: \.offset) { _, value in
                Text(UsagePresentation.number(value)).monospacedDigit().frame(width: 86, alignment: .trailing)
            }
            Text(UsagePresentation.money(row.cost)).monospacedDigit().frame(width: 86, alignment: .trailing)
        }.font(.system(size: 12)).padding(.vertical, 10).accessibilityElement(children: .combine)
    }
}
