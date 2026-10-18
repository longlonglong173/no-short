import AppKit
import SwiftUI
import UsageCore

@MainActor final class LogSourcesEditorModel: ObservableObject {
    @Published private(set) var urls: [URL]
    @Published private(set) var errors: [String: String] = [:]
    @Published private(set) var notice: String?
    let provider: UsageProvider
    let language: AppLanguage
    private let store: LogSourceStore

    init(store: LogSourceStore, provider: UsageProvider, language: AppLanguage) {
        self.store = store; self.provider = provider; self.language = language
        urls = store.sourceURLs(provider: provider)
        revalidate()
    }
    func l(_ key: String) -> String { AppLocalization(language: language).text(key) }
    func add(_ values: [URL]) {
        urls = LogSourceStore.uniqueURLs(urls + values)
        revalidate()
    }
    func remove(_ url: URL) {
        urls.removeAll { $0.standardizedFileURL.path == url.standardizedFileURL.path }
        revalidate()
    }
    private func revalidate() {
        errors = [:]; notice = nil
        for url in urls {
            if let error = store.selectionError(for: url, provider: provider) { errors[url.path] = l(error.localizedDescription) }
        }
        if urls.isEmpty { notice = l(LogSourceSelectionError.emptySelection.localizedDescription) }
    }
    func save() -> Bool {
        revalidate()
        guard errors.isEmpty, !urls.isEmpty else { return false }
        do { try store.choose(urls, provider: provider); return true }
        catch { revalidate(); notice = l(error.localizedDescription); return false }
    }
}

struct LogSourcesEditorView: View {
    @ObservedObject var model: LogSourcesEditorModel
    let onAdd: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(model.l("Quản lý danh sách thư mục. Chỉ lưu khi tất cả nguồn hợp lệ; hủy để giữ cấu hình cũ."))
                .font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(model.urls, id: \.absoluteString) { url in
                        VStack(alignment: .leading, spacing: 5) {
                            HStack(alignment: .top) {
                                Text(url.path).font(.system(size: 11, design: .monospaced))
                                    .textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                                Button { model.remove(url) } label: { Image(systemName: "minus.circle") }
                                    .help(model.l("Bỏ khỏi danh sách") + ": " + url.path)
                                    .accessibilityLabel(model.l("Bỏ khỏi danh sách") + ": " + url.path)
                            }
                            if let error = model.errors[url.path] {
                                Label(error, systemImage: "exclamationmark.triangle")
                                    .font(.system(size: 11)).foregroundStyle(.orange)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Divider()
                        }
                    }
                }.padding(4)
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
            if let notice = model.notice {
                Text(notice).font(.system(size: 11)).foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true)
            }
            Button(action: onAdd) { Label(model.l("Thêm thư mục…"), systemImage: "plus") }
        }
        .padding(8)
        .frame(width: 520, height: 340)
        .background(Color(nsColor: .windowBackgroundColor))
        .environment(\.locale, model.language.locale)
    }
}
