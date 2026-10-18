import SwiftUI
import Charts
import UsageCore

struct UsagePopoverView: View {
    @ObservedObject var model: UsagePanelModel
    @Environment(\.colorScheme) private var colorScheme
    private var accent: Color { colorScheme == .dark ? Color(red: 0.46, green: 0.83, blue: 0.79) : Color(red: 0, green: 0.43, blue: 0.45) }
    var body: some View {
        VStack(spacing: 0) {
            header.padding(.bottom, 12)
            Picker("Công cụ",selection:Binding(get:{ model.providerFilter },set:{ model.setProviderFilter($0) })) {
                Text("Tất cả").tag("all")
                Text("Codex").tag("codex")
                Text("Claude Code").tag("claude")
            }.pickerStyle(.segmented).labelsHidden().frame(maxWidth:.infinity).padding(.bottom,7)
            Text(model.activityLabel).font(.system(size:10)).foregroundStyle(.secondary)
                .frame(maxWidth:.infinity,alignment:.leading).lineLimit(1).padding(.bottom,12)
            if model.showsSessions { sessions } else { dashboard }
        }
        .padding(22)
        .frame(width: 400, height: model.panelHeight, alignment: .top)
        .background(Color(nsColor: .windowBackgroundColor))
        .tint(accent)
    }
    private var header: some View {
        HStack(alignment: .center) {
            Text("No Short Usage").font(.system(size: 21, weight: .bold)).tracking(-0.5)
            Spacer()
            HStack(spacing: 6) {
                Circle().fill(model.isStale || model.notice != nil ? Color.orange : model.isLoading ? Color.secondary : accent).frame(width: 7, height: 7)
                Text(model.isStale || model.notice != nil ? "Cần cập nhật" : model.isLoading ? "Đang cập nhật" : model.snapshot == nil ? "Chưa có dữ liệu" : "Đã cập nhật")
                    .font(.system(size: 10)).foregroundStyle(.secondary)
            }.accessibilityElement(children: .combine)
        }
    }
    private var dashboard: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 7) {
                Text(model.isAll ? "Chi phí hôm nay theo công cụ" : "Phiên đang theo dõi").font(.system(size: 12)).foregroundStyle(.secondary)
                if model.isAll {
                    HStack {
                        ForEach(UsageProvider.allCases,id:\.self) { provider in
                            let cost = model.snapshot?.providerBreakdowns?.first { $0.provider == provider }?.today.cost
                            HStack {
                                Text(provider.title).font(.system(size:11)).foregroundStyle(.secondary)
                                Spacer(minLength:4)
                                Text(cost.map(UsagePresentation.money) ?? "—").font(.system(size:13,weight:.semibold)).monospacedDigit()
                            }.padding(.horizontal,10).frame(height:35)
                                .background(Color.primary.opacity(0.04),in:RoundedRectangle(cornerRadius:7))
                        }
                    }
                } else {
                Button { model.showsSessions = true } label: {
                    HStack {
                        Text(model.selectionLabel).lineLimit(1).truncationMode(.middle)
                        Spacer(minLength: 8); Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
                    }
                    .font(.system(size: 13)).foregroundStyle(.primary)
                    .padding(.horizontal, 11).frame(height: 35)
                    .background(RoundedRectangle(cornerRadius: 7).fill(Color.primary.opacity(0.025)))
                    .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Color.primary.opacity(0.12)))
                }
                .buttonStyle(.plain).frame(maxWidth: .infinity)
                .help(model.selectionLabel).accessibilityLabel("Chọn phiên đang theo dõi")
                }
            }.padding(.bottom, 16)
            if let warning = warning {
                Label(warning, systemImage: "exclamationmark.circle")
                    .font(.system(size: 11)).foregroundStyle(.orange)
                    .frame(maxWidth: .infinity, alignment: .leading).lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true).help(warning)
                    .padding(.bottom, 10)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .center, spacing: 10) {
                    Text(model.mainCost).font(.system(size: 49, weight: .semibold)).tracking(-1.8)
                        .monospacedDigit().foregroundStyle(accent).lineLimit(1).minimumScaleFactor(0.45)
                        .accessibilityLabel("Chi phí phiên \(model.mainCost) đô la Mỹ, ước tính")
                    Spacer(minLength: 0)
                    Text("Ước tính").font(.system(size: 11, weight: .medium)).foregroundStyle(accent)
                        .padding(.horizontal, 10).padding(.vertical, 5).background(accent.opacity(0.12), in: Capsule())
                }
                Text(model.isAll ? "Chi phí API quy đổi · Hôm nay" : "Chi phí API quy đổi · Phiên này").font(.system(size: 13)).foregroundStyle(.secondary)
            }.padding(.bottom, 20)
            HStack(spacing: 0) {
                token("Input", model.inputText)
                Divider().frame(height: 34)
                token("Cache", model.cacheText)
                Divider().frame(height: 34)
                token("Output", model.outputText)
            }.help(model.tokenTooltip).accessibilityLabel(model.tokenTooltip).padding(.bottom, 18)
            Text(model.contextLabel).font(.system(size:11)).foregroundStyle(.secondary)
                .frame(maxWidth:.infinity,alignment:.leading).help(model.contextTooltip).padding(.bottom,14)
            Divider().padding(.bottom, 14)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Chi phí theo ngày").font(.system(size: 12, weight: .medium))
                    Spacer()
                    Text("7 ngày · Tất cả phiên").font(.system(size: 10)).foregroundStyle(.secondary)
                }
                costChart.frame(height: 124)
                if model.hasUnpricedDays {
                    Text("Ngày thiếu giá hiển thị phần đã biết hoặc —.").font(.system(size: 9)).foregroundStyle(.secondary)
                }
            }.padding(.bottom, 18)
            HStack(spacing: 0) {
                period("Hôm nay", model.todayCost)
                Divider().frame(height: 40)
                period("Tháng này", model.monthCost)
            }.padding(.bottom, 17)
            Spacer(minLength: 4)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Nguồn: ccusage · Log trên máy").help(model.source)
                    Spacer()
                    Text(model.updatedLabel).help("Múi giờ: \(model.snapshot?.timeZone ?? "hệ thống")")
                }.font(.system(size: 9)).foregroundStyle(.secondary)
                Text("Ước tính API · Không phải hóa đơn thuê bao")
                    .font(.system(size: 9)).foregroundStyle(.secondary)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 12)
            footer
        }
    }
    private var warning: String? {
        if let connection = model.connectionNotice { return connection }
        if model.selectionMissing { return "Phiên đã chọn không còn dữ liệu. Chọn phiên khác để tiếp tục." }
        if let notice = model.notice { return notice }
        return model.isStale ? "Dữ liệu cũ · đang chờ cập nhật" : nil
    }
    private func token(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.system(size: 11)).foregroundStyle(.secondary)
            Text(value).font(.system(size: 20, weight: .semibold)).monospacedDigit()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.leading, title == "Input" ? 0 : 21)
    }
    private func period(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 11)).foregroundStyle(.secondary)
            Text(value).font(.system(size: 23, weight: .semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.leading, title == "Hôm nay" ? 0 : 30)
        .help("\(title) · Tổng tất cả phiên · \(value) USD")
    }
    @ViewBuilder private var costChart: some View {
        if model.chartPoints.isEmpty {
            RoundedRectangle(cornerRadius: 6).fill(Color.primary.opacity(0.025))
                .overlay(Text(model.isLoading ? "Đang đọc thống kê…" : "Chưa có dữ liệu biểu đồ").font(.system(size: 11)).foregroundStyle(.secondary))
        } else {
            Chart {
                ForEach(model.chartPoints) { point in
                    if let amount = point.amount {
                        BarMark(x: .value("Ngày", point.label), y: .value("USD", amount), width: .ratio(0.55))
                            .foregroundStyle(accent.opacity(0.62)).cornerRadius(2)
                            .accessibilityLabel("Ngày \(point.label)")
                            .accessibilityValue("\(UsagePresentation.money(point.cost)) đô la Mỹ")
                    }
                }
            }
            .chartXScale(domain: model.chartPoints.map(\.label))
            .chartYScale(domain: 0...(max(model.chartPoints.compactMap(\.amount).max() ?? 0, 0.01) * 1.15))
            .chartXAxis {
                AxisMarks(values: model.chartPoints.map(\.label)) { _ in AxisValueLabel().font(.system(size: 9)).foregroundStyle(Color.secondary) }
            }
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                    AxisGridLine().foregroundStyle(Color.primary.opacity(0.09))
                    AxisValueLabel {
                        if let amount = value.as(Double.self) { Text("$\(amount, format: .number.precision(.fractionLength(0...2)))").font(.system(size: 9)).foregroundStyle(Color.secondary) }
                    }
                }
            }
            .help(model.chartPoints.map { "\($0.label): \(UsagePresentation.money($0.cost))" }.joined(separator: "\n"))
        }
    }
    private var footer: some View {
        HStack(spacing: 8) {
            Button { model.showsSessions = true } label: {
                Label("Xem các phiên", systemImage: "list.bullet").font(.system(size: 12))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }.buttonStyle(FooterButtonStyle())
            Button { model.onRefresh?() } label: { Image(systemName: "arrow.clockwise").frame(width: 14, height: 14) }
                .buttonStyle(FooterButtonStyle()).disabled(model.isLoading).help("Làm mới").accessibilityLabel("Làm mới")
            Menu {
                Text("Nguồn: \(model.source)")
                Button("Chọn thư mục log Codex…") { model.onChooseSource?() }
                Button("Dùng log Codex mặc định") { model.onResetSource?() }
                Button("Chọn thư mục log Claude Code…") { model.onChooseClaudeSource?() }
                Button("Dùng log Claude Code mặc định") { model.onResetClaudeSource?() }
                Divider()
                Button("Kết nối context Claude Code…") { model.onConnectClaudeContext?() }
                Button("Ngắt context Claude Code") { model.onRemoveClaudeContext?() }
                Divider()
                Button("Kết nối tự theo dõi chat…") { model.onInstallHooks?() }
                Button("Gỡ hooks theo dõi chat") { model.onRemoveHooks?() }
                if model.connectionNotice != nil { Button("Ẩn thông báo kết nối") { model.connectionNotice=nil } }
                Divider()
                Toggle(isOn: Binding(get: { model.loginState == .enabled || model.loginState == .requiresApproval }, set: { _ in model.onToggleLogin?() })) { Text(model.loginState == .requiresApproval ? "Mở cùng macOS · Cần phê duyệt" : "Mở cùng macOS") }
                if model.loginState == .requiresApproval || model.loginState == .notFound { Button("Mở cài đặt Login Items…") { model.onOpenSettings?() } }
                Divider()
                Button("Thoát No Short Usage") { model.onQuit?() }.keyboardShortcut("q")
            } label: { Color.clear.frame(width: 34, height: 34) }
            .menuStyle(.borderlessButton).menuIndicator(.hidden).frame(width: 34, height: 34)
            .background(Color.primary.opacity(0.055), in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.primary.opacity(0.14)))
            // The native borderless menu reserves indicator space even when hidden.
            // Draw its icon over the full control to keep the visible glyph centered.
            .overlay(Image(systemName: "gearshape").font(.system(size: 14)).foregroundStyle(.primary).allowsHitTesting(false))
            .contentShape(Rectangle())
            .help("Cài đặt").accessibilityLabel("Cài đặt")
        }
    }
    private var sessions: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { model.showsSessions = false } label: { Label("Quay lại thống kê", systemImage: "chevron.left") }.buttonStyle(.plain).foregroundStyle(accent)
            TextField("Tìm tên hoặc ID phiên", text: $model.search).textFieldStyle(.roundedBorder).accessibilityLabel("Tìm phiên")
            Button { model.chooseSession(nil) } label: {
                Label("Tự theo dõi chat vừa gửi tin nhắn", systemImage: "arrow.triangle.2.circlepath").font(.system(size: 12)).frame(maxWidth: .infinity, alignment: .leading)
            }.buttonStyle(.bordered)
            Text("\(model.filteredSessions.count) phiên · Chọn để xem chi phí và token")
                .font(.system(size: 10)).foregroundStyle(.secondary)
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(model.filteredSessions, id: \.id) { session in
                        Button { model.chooseSession(session.id) } label: {
                            HStack(alignment: .top, spacing: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(UsagePresentation.cleanTitle(session.title)).font(.system(size: 12, weight: .medium)).lineLimit(2)
                                    Text(session.usageProvider.title + " · " + (session.kind == "subagent" ? "Tác vụ con" : session.kind == "main" ? "Phiên chính" : "Chưa xác định loại phiên")).font(.system(size: 9)).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                Text(UsagePresentation.money(session.cost)).font(.system(size: 12, weight: .medium)).monospacedDigit()
                            }.foregroundStyle(.primary).padding(.vertical, 12).padding(.horizontal, 4).frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }.buttonStyle(.plain).help(session.title)
                        Divider()
                    }
                    if model.filteredSessions.isEmpty { Text("Không tìm thấy phiên phù hợp").font(.system(size: 12)).foregroundStyle(.secondary).padding(.vertical, 30) }
                }
            }
            Spacer(minLength: 0)
        }.font(.system(size: 12))
    }
}


private struct FooterButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(isEnabled ? Color.primary : Color.secondary)
            .padding(.horizontal, 10)
            .frame(height: 34)
            .background(Color.primary.opacity(configuration.isPressed ? 0.11 : 0.055), in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.primary.opacity(0.14)))
            .contentShape(RoundedRectangle(cornerRadius: 6))
            .opacity(isEnabled ? 1 : 0.45)
    }
}
