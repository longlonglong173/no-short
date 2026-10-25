import SwiftUI
import UsageCore

struct AppUpdatePresentation: Equatable {
    var installedVersion: String?
    var latestVersion: String? = nil
    var state: NativeUpdateState = .idle
    var lastCheckedAt: Date? = nil
    var canCheck = true
    var hasInstallCapability = false
    var automaticChecksEnabled = true
    var versionText: String { installedVersion.map { $0.hasPrefix("v") ? $0 : "v"+$0 } ?? "—" }
    var isOutdated: Bool {
        guard let installedVersion,let installed=SemanticVersion(installedVersion),let latestVersion,let latest=SemanticVersion(latestVersion) else { return false }
        return latest > installed
    }
    func statusText(language: AppLanguage) -> String {
        let l=AppLocalization(language:language)
        switch state {
        case .checking,.downloading,.installing,.failed: return state.localizedDescription(language:language)
        default: break
        }
        if isOutdated,let latestVersion { return l.text("Có phiên bản mới: %@",latestVersion) }
        if lastCheckedAt != nil || state == .current { return l.text("Không có bản cập nhật mới hơn.") }
        return l.text("Chưa kiểm tra cập nhật.")
    }
    func actionTitle(language: AppLanguage) -> String {
        AppLocalization(language:language).text(isOutdated ? "Cập nhật…" : "Kiểm tra cập nhật…")
    }
    func checkedText(language: AppLanguage) -> String? {
        guard let lastCheckedAt else { return nil }
        let formatter=DateFormatter();formatter.locale=language.locale;formatter.dateStyle = .short;formatter.timeStyle = .short
        return AppLocalization(language:language).text("Kiểm tra gần nhất: %@",formatter.string(from:lastCheckedAt))
    }
}

struct AppUpdateStatusView: View {
    let presentation: AppUpdatePresentation
    let language: AppLanguage
    let onCheck: () -> Void
    private var l: AppLocalization { AppLocalization(language:language) }
    var body: some View {
        VStack(alignment:.leading,spacing:6) {
            HStack(alignment:.firstTextBaseline,spacing:8) {
                Text(presentation.versionText).font(.system(size:11,weight:.medium)).monospacedDigit()
                    .accessibilityLabel(l.text("Phiên bản ứng dụng: %@",presentation.versionText))
                Spacer(minLength:4)
                if presentation.state.isBusy { ProgressView().controlSize(.mini) }
                Button(presentation.actionTitle(language:language),action:onCheck)
                    .font(.system(size:11,weight:presentation.isOutdated ? .semibold : .regular))
                    .buttonStyle(.link).disabled(!presentation.canCheck)
                    .accessibilityIdentifier("appUpdateAction")
            }
            HStack(alignment:.top,spacing:5) {
                if presentation.isOutdated { Image(systemName:"arrow.up.circle.fill").foregroundStyle(.orange) }
                Text(presentation.statusText(language:language))
                    .foregroundStyle(presentation.isOutdated ? .primary : .secondary)
                    .fixedSize(horizontal:false,vertical:true)
            }.font(.system(size:11)).accessibilityIdentifier("appUpdateStatus")
            if let checked=presentation.checkedText(language:language) {
                Text(checked).font(.system(size:9)).foregroundStyle(.secondary)
            }
        }.frame(maxWidth:.infinity,alignment:.leading)
    }
}
