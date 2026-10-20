import AppKit
import SwiftUI
import UsageCore

struct AppBuildInfo: Sendable {
    let version: String?
    let build: String?
    init(bundle: Bundle = .main) {
        version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String
    }
    init(version: String?, build: String?) { self.version = version; self.build = build }
}

@MainActor final class AboutModel: ObservableObject {
    let info: AppBuildInfo
    @Published private(set) var state: ManualUpdateState = .idle
    @Published var language: AppLanguage
    var onChange: (() -> Void)?
    let native: UpdateCoordinator?
    var nativeState: NativeUpdateState? { native?.hasInstallCapability == true ? native?.state : nil }
    var isCheckingUpdate: Bool { nativeState?.isBusy ?? state.isChecking }
    private let updates: ManualUpdateController
    init(info: AppBuildInfo = AppBuildInfo(), language: AppLanguage, client: any LatestReleaseLoading = GitHubReleaseClient(), native: UpdateCoordinator? = nil) {
        self.info = info; self.language = language; self.native = native
        updates = ManualUpdateController(installedVersion: info.version, client: client)
        native?.onChange = { [weak self] in self?.objectWillChange.send(); self?.onChange?() }
        updates.onChange = { [weak self] in
            guard let self else { return }
            state = updates.state; onChange?()
        }
    }
    func l(_ key: String, _ arguments: String...) -> String { AppLocalization(language: language).text(key, arguments: arguments) }
    private func metadata(_ value: String?) -> String {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return l("Không có thông tin") }
        return value
    }
    var versionText: String { l("Phiên bản: %@", metadata(info.version)) }
    var buildText: String { l("Build: %@", metadata(info.build)) }
    var statusText: String { nativeState?.localizedDescription(language: language) ?? state.localizedDescription(language: language) }
    var releaseNotesURL: URL {
        if let version=native?.releaseVersion { return GitHubReleaseClient.notesURL(for:version) }
        return manualReleaseNotesURL
    }
    private var manualReleaseNotesURL: URL {
        switch state {
        case .available(let release), .current(let release): release.notesURL
        default: GitHubReleaseClient.notesURL(for: info.version)
        }
    }
    func check() async {
        if let native, native.hasInstallCapability { native.check() }
        else { await updates.check() }
    }
}

struct AboutView: View {
    @ObservedObject var model: AboutModel
    let state: ManualUpdateState
    let onCheck: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("No Short Usage").font(.title2.bold())
            VStack(alignment: .leading, spacing: 4) {
                Text(model.versionText)
                Text(model.buildText).foregroundStyle(.secondary)
            }.textSelection(.enabled)
            Divider()
            HStack(alignment: .top, spacing: 10) {
                if model.isCheckingUpdate { ProgressView().controlSize(.small) }
                Text(model.statusText)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("manualUpdateStatus")
            }
            Button(model.l(model.isCheckingUpdate ? "Đang kiểm tra bản cập nhật…" : "Kiểm tra bản cập nhật…"), action: onCheck)
                .disabled(model.isCheckingUpdate || (model.native?.hasInstallCapability == true && model.native?.canCheck != true))
            Link(model.l("Mở ghi chú phát hành"), destination: model.releaseNotesURL)
            Divider()
            Text(model.l(model.nativeState != nil ? "Chỉ kiểm tra khi bạn yêu cầu. Cài đặt cần xác nhận và xác minh chữ ký." : "Chỉ liên hệ GitHub khi bạn bấm kiểm tra. Không tự tải hoặc thay thế app."))
            if model.native != nil && model.native?.hasInstallCapability == false {
                Text(NativeUpdateState.failed(.notConfigured).localizedDescription(language: model.language)).foregroundStyle(.secondary)
            }
            Text(model.l("Chỉ so sánh phiên bản phát hành; không phát hiện tài nguyên thử nghiệm được thay mới dưới cùng phiên bản/tag."))
                .foregroundStyle(.secondary)
        }
        .font(.system(size: 13))
        .padding(24)
        .frame(width: 460, alignment: .leading)
        .background(Color(nsColor: .windowBackgroundColor))
    }
}

/// Observe state at the host level as well, so each async transition reaches AboutView.
struct AboutWindowView: View {
    @ObservedObject var model: AboutModel
    var body: some View { AboutView(model: model, state: model.state, onCheck: { Task { await model.check() } }) }
}

@MainActor final class AboutWindowController: NSWindowController {
    init(model: AboutModel) {
        let host = NSHostingController(rootView: AboutWindowView(model: model))
        let window = NSWindow(contentViewController: host)
        window.title = "No Short Usage"
        window.styleMask = [.titled, .closable, .miniaturizable]
        window.isReleasedWhenClosed = false
        window.center()
        super.init(window: window)
    }
    required init?(coder: NSCoder) { nil }
    func present() {
        showWindow(nil)
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}
