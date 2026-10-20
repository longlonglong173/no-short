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
            if model.showsSetup {
                ConnectionSetupView(model: model)
            } else {
            Picker(model.l("Công cụ"),selection:Binding(get:{ model.providerFilter },set:{ model.setProviderFilter($0) })) {
                Text(model.l("Tất cả")).tag("all")
                Text("Codex").tag("codex")
                Text("Claude Code").tag("claude")
            }.pickerStyle(.segmented).labelsHidden().frame(maxWidth:.infinity).padding(.bottom,7)
            Text(model.activityLabel).font(.system(size:10)).foregroundStyle(.secondary)
                .frame(maxWidth:.infinity,alignment:.leading).lineLimit(1).padding(.bottom,12)
            if model.showsModels { modelDetails } else if model.showsSessions { sessions } else { dashboard }
            }
        }
        .padding(22)
        .frame(width: 400, height: model.panelHeight, alignment: .top)
        .background(Color(nsColor: .windowBackgroundColor))
        .tint(accent)
        .environment(\.locale, model.language.locale)
    }
    private var header: some View {
        HStack(alignment: .center) {
            Text("No Short Usage").font(.system(size: 21, weight: .bold)).tracking(-0.5)
            Spacer()
            HStack(spacing: 6) {
                Circle().fill(model.isStale || model.notice != nil ? Color.orange : model.isLoading ? Color.secondary : accent).frame(width: 7, height: 7)
                Text(model.isStale || model.notice != nil ? model.l("Cần cập nhật") : model.isLoading ? model.l("Đang cập nhật") : model.snapshot == nil ? model.l("Chưa có dữ liệu") : model.l("Đã cập nhật"))
                    .font(.system(size: 10)).foregroundStyle(.secondary)
            }.accessibilityElement(children: .combine)
        }
    }
    private var dashboard: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 7) {
                Text(model.isAll ? model.l("Chi phí hôm nay theo công cụ") : model.l("Phiên đang theo dõi")).font(.system(size: 12)).foregroundStyle(.secondary)
                if model.isAll {
                    HStack {
                        ForEach(model.totalProviders,id:\.self) { provider in
                            let cost = model.providerTodayCost(provider)
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
                .help(model.selectionLabel).accessibilityLabel(model.l("Chọn phiên đang theo dõi"))
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
                        .accessibilityLabel(model.costScopeLabel + ": " + model.mainCost + " USD")
                    Spacer(minLength: 0)
                    Button { model.showModelCosts() } label: {
                        Label(model.l("Model"), systemImage: "list.bullet.rectangle")
                            .font(.system(size: 11, weight: .medium))
                            .padding(.horizontal, 10).padding(.vertical, 5)
                    }.buttonStyle(.bordered).help(model.l("Chi phí theo model"))
                        .accessibilityLabel(model.l("Chi phí theo model"))
                }
                Text(model.costScopeLabel).font(.system(size: 11)).foregroundStyle(.secondary)
                    .lineLimit(1).minimumScaleFactor(0.8).help(model.costScopeLabel)
            }.padding(.bottom, 20)
            HStack(spacing: 0) {
                token(model.l("Input"), model.inputText)
                Divider().frame(height: 34)
                token(model.l("Cache"), model.cacheText)
                Divider().frame(height: 34)
                token(model.l("Output"), model.outputText)
            }.help(model.tokenTooltip).accessibilityLabel(model.tokenTooltip).padding(.bottom, 18)
            Text(model.contextLabel).font(.system(size:11)).foregroundStyle(.secondary)
                .frame(maxWidth:.infinity,alignment:.leading).help(model.contextTooltip).padding(.bottom,14)
            if let warning = model.contextWarning {
                Label(warning,systemImage:"exclamationmark.triangle.fill")
                    .font(.system(size:11,weight:.medium)).foregroundStyle(.red)
                    .frame(maxWidth:.infinity,alignment:.leading)
                    .fixedSize(horizontal:false,vertical:true).padding(.bottom,14)
            }
            Divider().padding(.bottom, 14)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(model.l("Chi phí theo ngày")).font(.system(size: 12, weight: .medium))
                    Spacer()
                    Text(model.l("7 ngày · Tất cả phiên · %@", model.aggregateProviderLabel)).font(.system(size: 9)).foregroundStyle(.secondary)
                }
                costChart.frame(height: 124)
                if model.hasUnpricedDays {
                    Text(model.l("Ngày thiếu giá hiển thị phần đã biết hoặc —.")).font(.system(size: 9)).foregroundStyle(.secondary)
                }
            }.padding(.bottom, 18)
            HStack(spacing: 0) {
                period(model.l("Hôm nay"), model.todayCost)
                Divider().frame(height: 40)
                period(model.l("Tháng này"), model.monthCost)
            }.padding(.bottom, 17)
            Spacer(minLength: 4)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(model.l("Nguồn: ccusage · Log trên máy")).help(model.source)
                    Spacer()
                    Text(model.updatedLabel).help(model.l("Múi giờ: %@", String(model.snapshot?.timeZone ?? model.l("hệ thống"))))
                }.font(.system(size: 9)).foregroundStyle(.secondary)
                Text(model.l("Ước tính API · Không phải hóa đơn thuê bao"))
                    .font(.system(size: 9)).foregroundStyle(.secondary)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 12)
            footer
        }
    }
    var warning: String? {
        // Data problems take precedence over retained setup/connection feedback.
        if let notice = model.notice { return model.l(notice) }
        if model.selectionMissing { return model.l("Phiên đã chọn không còn dữ liệu. Chọn phiên khác để tiếp tục.") }
        if model.isStale { return model.l("Dữ liệu cũ · đang chờ cập nhật") }
        return model.connectionNotice.map { model.l($0) }
    }
    private func token(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.system(size: 11)).foregroundStyle(.secondary)
            Text(value).font(.system(size: 20, weight: .semibold)).monospacedDigit()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.leading, title == model.l("Input") ? 0 : 21)
    }
    private func period(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 11)).foregroundStyle(.secondary)
            Text(value).font(.system(size: 23, weight: .semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.leading, title == model.l("Hôm nay") ? 0 : 30)
        .help(model.l("%@ · %@ · Tổng tất cả phiên · %@ USD", title, model.aggregateProviderLabel, value))
    }
    @ViewBuilder private var costChart: some View {
        if model.chartPoints.isEmpty {
            RoundedRectangle(cornerRadius: 6).fill(Color.primary.opacity(0.025))
                .overlay(Text(model.isLoading ? model.l("Đang đọc thống kê…") : model.l("Chưa có dữ liệu biểu đồ")).font(.system(size: 11)).foregroundStyle(.secondary))
        } else {
            Chart {
                ForEach(model.chartPoints) { point in
                    if let amount = point.amount {
                        BarMark(x: .value(model.l("Ngày"), point.label), y: .value("USD", amount), width: .ratio(0.55))
                            .foregroundStyle(accent.opacity(0.62)).cornerRadius(2)
                            .accessibilityLabel(model.l("Ngày %@", String(point.label)))
                            .accessibilityValue(model.l("%@ đô la Mỹ", String(UsagePresentation.money(point.cost))))
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
                Label(model.l("Xem các phiên"), systemImage: "list.bullet").font(.system(size: 12))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }.buttonStyle(FooterButtonStyle())
            Button { model.onRefresh?() } label: { Image(systemName: "arrow.clockwise").frame(width: 14, height: 14) }
                .buttonStyle(FooterButtonStyle()).disabled(model.isLoading).help(model.l("Làm mới")).accessibilityLabel(model.l("Làm mới"))
            Button { model.showsSetup = true } label: { Image(systemName: "stethoscope").frame(width: 14, height: 14) }
                .buttonStyle(FooterButtonStyle()).help(model.l("Hướng dẫn và kết nối")).accessibilityLabel(model.l("Hướng dẫn và kết nối"))
            Menu {
                Menu(model.l("Ngôn ngữ")) {
                    ForEach(AppLanguage.allCases) { language in
                        Button { model.setLanguage(language) } label: {
                            if model.language == language { Label(language.title, systemImage: "checkmark") }
                            else { Text(language.title) }
                        }
                    }
                }
                Divider()
                Button(model.l("Hướng dẫn và kết nối")) { model.showsSetup = true }
                Text(model.l("Nguồn: %@", String(model.source)))
                Button(model.l("Chọn thư mục log Codex…")) { model.onChooseSource?() }
                Button(model.l("Dùng log Codex mặc định")) { model.onResetSource?() }
                Button(model.l("Chọn thư mục log Claude Code…")) { model.onChooseClaudeSource?() }
                Button(model.l("Dùng log Claude Code mặc định")) { model.onResetClaudeSource?() }
                Divider()
                Button(model.l("Ngưỡng cảnh báo context: %@%…", String(model.contextAlertThreshold))) { model.onConfigureContextAlerts?() }
                Toggle(model.l("Thông báo macOS khi vượt ngưỡng"),isOn:Binding(get:{ model.contextNotificationsEnabled },set:{ model.setContextNotificationsEnabled($0) }))
                Divider()
                Button(model.l("Kết nối context Claude Code…")) { model.onConnectClaudeContext?() }
                Button(model.l("Ngắt context Claude Code")) { model.onRemoveClaudeContext?() }
                Divider()
                Button(model.l("Kết nối tự theo dõi chat…")) { model.onInstallHooks?() }
                Button(model.l("Gỡ hooks theo dõi chat")) { model.onRemoveHooks?() }
                if model.connectionNotice != nil { Button(model.l("Ẩn thông báo kết nối")) { model.connectionNotice=nil } }
                Divider()
                Toggle(isOn: Binding(get: { model.loginState == .enabled || model.loginState == .requiresApproval }, set: { _ in model.onToggleLogin?() })) { Text(model.loginState == .requiresApproval ? model.l("Mở cùng macOS · Cần phê duyệt") : model.l("Mở cùng macOS")) }
                if model.loginState == .requiresApproval || model.loginState == .notFound { Button(model.l("Mở cài đặt Login Items…")) { model.onOpenSettings?() } }
                Divider()
                Button(model.l("Giới thiệu No Short Usage…")) { model.onAbout?() }
                Button(model.l("Kiểm tra bản cập nhật…")) { model.onCheckUpdates?() }
                Button(model.l("Ghi chú phát hành…")) { model.onReleaseNotes?() }
                Divider()
                Button(model.l("Thoát No Short Usage")) { model.onQuit?() }.keyboardShortcut("q")
            } label: { Color.clear.frame(width: 34, height: 34) }
            .menuStyle(.borderlessButton).menuIndicator(.hidden).frame(width: 34, height: 34)
            .background(Color.primary.opacity(0.055), in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.primary.opacity(0.14)))
            // The native borderless menu reserves indicator space even when hidden.
            // Draw its icon over the full control to keep the visible glyph centered.
            .overlay(Image(systemName: "gearshape").font(.system(size: 14)).foregroundStyle(.primary).allowsHitTesting(false))
            .contentShape(Rectangle())
            .help(model.l("Cài đặt")).accessibilityLabel(model.l("Cài đặt"))
        }
    }
    private var sessions: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { model.showsSessions = false } label: { Label(model.l("Quay lại thống kê"), systemImage: "chevron.left") }.buttonStyle(.plain).foregroundStyle(accent)
            TextField(model.l("Tìm tên hoặc ID phiên"), text: $model.search).textFieldStyle(.roundedBorder).accessibilityLabel(model.l("Tìm phiên"))
            Button { model.chooseSession(nil) } label: {
                Label(model.l("Tự theo dõi chat vừa gửi tin nhắn"), systemImage: "arrow.triangle.2.circlepath").font(.system(size: 12)).frame(maxWidth: .infinity, alignment: .leading)
            }.buttonStyle(.bordered)
            Text(model.l("%@ phiên · Chọn để xem chi phí và token", String(model.filteredSessions.count)))
                .font(.system(size: 10)).foregroundStyle(.secondary)
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(model.filteredSessions, id: \.id) { session in
                        Button { model.chooseSession(session.id) } label: {
                            HStack(alignment: .top, spacing: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(UsagePresentation.cleanTitle(session.title)).font(.system(size: 12, weight: .medium)).lineLimit(2)
                                    Text(session.usageProvider.title + " · " + (session.kind == "subagent" ? model.l("Tác vụ con") : session.kind == "main" ? model.l("Phiên chính") : model.l("Chưa xác định loại phiên"))).font(.system(size: 9)).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                Text(UsagePresentation.money(session.cost)).font(.system(size: 12, weight: .medium)).monospacedDigit()
                            }.foregroundStyle(.primary).padding(.vertical, 12).padding(.horizontal, 4).frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }.buttonStyle(.plain).help(session.title)
                        Divider()
                    }
                    if model.filteredSessions.isEmpty { Text(model.l("Không tìm thấy phiên phù hợp")).font(.system(size: 12)).foregroundStyle(.secondary).padding(.vertical, 30) }
                }
            }
            Spacer(minLength: 0)
        }.font(.system(size: 12))
    }

    private var modelDetails: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { model.showsModels = false } label: {
                Label(model.l("Quay lại thống kê"), systemImage: "chevron.left")
            }.buttonStyle(.plain).foregroundStyle(accent)
            Text(model.l("Chi phí theo model")).font(.system(size: 17, weight: .semibold))
            VStack(alignment: .leading, spacing: 4) {
                Text(model.costScopeLabel).font(.system(size: 11, weight: .medium))
                if !model.isAll {
                    Text(model.selectionLabel).font(.system(size: 11)).foregroundStyle(.secondary)
                        .lineLimit(2).help(model.selectionLabel)
                }
                HStack(alignment: .firstTextBaseline) {
                    Text(model.mainCost).font(.system(size: 24, weight: .semibold)).monospacedDigit()
                    Text("USD").font(.system(size: 11)).foregroundStyle(.secondary)
                    if let cost = model.mainUsageCost {
                        Text(model.pricingLabel(cost)).font(.system(size: 10)).foregroundStyle(.secondary)
                    }
                }
            }
            if let warning {
                Label(warning, systemImage: "exclamationmark.circle").font(.system(size: 11))
                    .foregroundStyle(.orange).lineLimit(2).help(warning)
            }
            HStack {
                Text(model.l("Model")).frame(maxWidth: .infinity, alignment: .leading)
                Text(model.l("Token")).frame(width: 65, alignment: .trailing)
                Text("USD").frame(width: 96, alignment: .trailing)
            }.font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary)
            Divider()
            ScrollView {
                LazyVStack(spacing: 0) {
                    // Snapshot names need not be unique; keep every source row.
                    ForEach(Array(model.modelUsages.enumerated()), id: \.offset) { _, row in
                        HStack(alignment: .top) {
                            Text(UsagePresentation.cleanTitle(row.name)).font(.system(size: 12, weight: .medium))
                                .lineLimit(2).frame(maxWidth: .infinity, alignment: .leading).help(row.name)
                            Text(UsagePresentation.number(row.tokens.total)).font(.system(size: 11)).monospacedDigit()
                                .frame(width: 65, alignment: .trailing)
                            VStack(alignment: .trailing, spacing: 4) {
                                Text(UsagePresentation.money(row.cost)).font(.system(size: 12, weight: .medium)).monospacedDigit()
                                Text(model.pricingLabel(row.cost)).font(.system(size: 9)).foregroundStyle(.secondary)
                            }.frame(width: 96, alignment: .trailing)
                        }.padding(.vertical, 12).accessibilityElement(children: .combine)
                        Divider()
                    }
                    if model.modelUsages.isEmpty {
                        Text(model.l("Chưa có dữ liệu theo model")).font(.system(size: 12)).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity).padding(.vertical, 30)
                    }
                }
            }.frame(maxHeight: .infinity)
            Text(model.l("≥ là phần chi phí đã biết; — là giá chưa biết, không phải $0."))
                .font(.system(size: 10)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Text(model.l("Nguồn: ccusage · Log trên máy")).help(model.source)
                .font(.system(size: 9)).foregroundStyle(.secondary)
            Text(model.l("Ước tính API · Không phải hóa đơn thuê bao"))
                .font(.system(size: 9)).foregroundStyle(.secondary)
        }.frame(maxHeight: .infinity, alignment: .top)
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
