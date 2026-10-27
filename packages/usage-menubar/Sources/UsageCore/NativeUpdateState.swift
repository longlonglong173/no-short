import Foundation

public enum NativeUpdateFailure: Error, Equatable, Sendable {
    case notConfigured, unsupportedArchitecture, network, verification, unexpected
}
public enum NativeUpdateState: Equatable, Sendable {
    case idle, checking, available(version: String), downloading, installing, current, failed(NativeUpdateFailure)
    public var isBusy: Bool {
        switch self {
        case .checking, .available, .downloading, .installing: true
        default: false
        }
    }
}

public extension NativeUpdateState {
    func localizedDescription(language: AppLanguage) -> String {
        let l=AppLocalization(language:language)
        switch self {
        case .idle: return l.text("Sẵn sàng kiểm tra và cài bản cập nhật có xác nhận.")
        case .checking: return l.text("Đang kiểm tra bản cập nhật…")
        case .available(let version): return l.text("Có phiên bản mới: %@",version)
        case .downloading: return l.text("Đang tải bản cập nhật đã ký…")
        case .installing: return l.text("Đang chuẩn bị cài đặt và mở lại app…")
        case .current: return l.text("Bạn đang dùng phiên bản mới nhất.")
        case .failed(let failure):
            switch failure {
            case .notConfigured: return l.text("Bản build này chưa cấu hình cập nhật có chữ ký. Hãy tải ZIP thủ công.")
            case .unsupportedArchitecture: return l.text("Cập nhật trong app hiện chỉ hỗ trợ Apple Silicon.")
            case .verification: return l.text("Không thể xác minh bản cập nhật. App hiện tại không bị thay thế.")
            case .network: return l.text("Không thể tải thông tin cập nhật. Hãy thử lại.")
            case .unexpected: return l.text("Cập nhật không hoàn tất. Hãy thử lại hoặc tải ZIP thủ công.")
            }
        }
    }
}
