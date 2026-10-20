import SwiftUI
import UsageCore

struct ConnectionSetupView: View {
    @ObservedObject var model: UsagePanelModel
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button { model.dismissSetup() } label: { Label(model.l("Quay lại thống kê"), systemImage: "chevron.left") }
                    .buttonStyle(.plain)
                Spacer()
                Button(model.l("Làm mới")) { model.onRefresh?() }
            }
            Text(model.l("Hướng dẫn và kết nối")).font(.headline)
            Text(model.l("Usage đọc log trên máy. Hooks và context Claude Code là tùy chọn; chỉ bật khi bạn chọn Kết nối. Đã cấu hình chưa có nghĩa là đã nhận dữ liệu."))
                .font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if model.connectionDiagnostics.isEmpty { Text(model.l("Đang kiểm tra kết nối…")) }
                    ForEach(model.connectionDiagnostics) { item in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(model.l(item.title)).font(.system(size: 13, weight: .semibold))
                            Label(model.l(item.status.label), systemImage: item.status == .error ? "exclamationmark.triangle" : item.status == .active ? "checkmark.circle" : "circle")
                                .foregroundStyle(item.status == .error ? Color.orange : .secondary)
                            Text(model.receivedLabel(item.lastReceived)).foregroundStyle(.secondary)
                            Text(model.l(item.guidance)).fixedSize(horizontal: false, vertical: true)
                            ForEach(item.paths, id: \.self) { path in
                                Text(path).font(.system(size: 10, design: .monospaced)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                            }
                            actions(item.id)
                        }.font(.system(size: 11)).frame(maxWidth: .infinity, alignment: .leading)
                        Divider()
                    }
                    Link(model.l("Xem hướng dẫn cài đặt"), destination: URL(string: "https://no-short.io.vn/usage.html")!)
                }.padding(.trailing, 8)
            }
            if let notice = model.connectionNotice {
                Text(model.l(notice)).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
    @ViewBuilder private func actions(_ id: String) -> some View {
        if id == "logs-codex" {
            Button(model.l("Chọn thư mục log Codex…")) { model.onChooseSource?() }
        } else if id == "logs-claude" {
            Button(model.l("Chọn thư mục log Claude Code…")) { model.onChooseClaudeSource?() }
        } else if id.hasPrefix("hooks-") {
            Button(model.l("Kết nối hooks cho cả hai công cụ…")) { model.onInstallHooks?() }
        } else if id == "context-claude" {
            Button(model.l("Kết nối context Claude Code…")) { model.onConnectClaudeContext?() }
        }
    }
}
