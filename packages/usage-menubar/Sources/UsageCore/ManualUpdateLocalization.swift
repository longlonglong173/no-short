import Foundation

extension ManualUpdateState {
    public func localizedDescription(language: AppLanguage) -> String {
        let l = AppLocalization(language: language)
        switch self {
        case .idle: return l.text("Chưa kiểm tra bản cập nhật.")
        case .checking: return l.text("Đang kiểm tra bản cập nhật…")
        case .available(let release): return l.text("Có phiên bản mới: %@", release.tag)
        case .current(let release): return l.text("Không có bản mới hơn. Bản phát hành mới nhất: %@", release.tag)
        case .failed(.network): return l.text("Không kiểm tra được bản cập nhật. Kiểm tra kết nối mạng rồi thử lại.")
        case .failed(.http(let code)): return l.text("GitHub trả về HTTP %@. Vui lòng thử lại sau.", String(code))
        case .failed(.malformed): return l.text("Phản hồi bản phát hành không hợp lệ. Vui lòng thử lại sau.")
        case .failed(.invalidInstalledVersion): return l.text("Không xác định được phiên bản app đang chạy. Mở trang phát hành để kiểm tra thủ công.")
        }
    }
}
