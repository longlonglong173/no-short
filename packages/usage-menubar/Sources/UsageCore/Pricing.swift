import Foundation

public struct PriceRates: Codable, Sendable, Equatable {
    public let input, output, cacheRead, cacheWrite: Double
    var valid: Bool { [input, output, cacheRead, cacheWrite].allSatisfy { $0.isFinite && $0 >= 0 } }
}
public struct ModelPricing: Codable, Sendable, Equatable {
    public let source: String
    public let provider, updatedAt: String?
    public let rates: PriceRates?
    public init(source: String, provider: String? = nil, updatedAt: String? = nil, rates: PriceRates? = nil) {
        self.source = source; self.provider = provider; self.updatedAt = updatedAt; self.rates = rates
    }
    var valid: Bool {
        ["ccusage", "custom", "fallback", "unpriced", "mixed"].contains(source) &&
        (provider == nil || ["codex", "claude"].contains(provider!)) && (rates?.valid ?? true) &&
        (updatedAt == nil || PricingConfig.validTimestamp(updatedAt!))
    }
    public static func merge(_ values: [Self?]) -> Self? {
        guard let first = values.first else { return nil }
        return values.allSatisfy { $0 == first } ? first : .init(source: "mixed")
    }
    public func description(language: AppLanguage) -> String {
        let l = AppLocalization(language: language)
        let key = source == "custom" ? "Giá tùy chỉnh" : source == "fallback" ? "Giá fallback chưa được xác nhận" :
            source == "unpriced" ? "Chưa biết giá" : source == "mixed" ? "Nhiều nguồn giá" : "Giá theo ccusage"
        var text = l.text(key)
        if let updatedAt { text += " · " + l.text("Cấu hình cập nhật: %@", arguments: [updatedAt]) }
        if let rates {
            text += " · " + l.text("USD/1M token: Input %@ · Output %@ · Cache read %@ · Cache write %@", arguments: [String(rates.input), String(rates.output), String(rates.cacheRead), String(rates.cacheWrite)])
        } else if source == "ccusage" { text += " · " + l.text("Đơn giá và ngày hiệu lực chưa được nguồn cung cấp.") }
        return text
    }
}
public struct SnapshotPricing: Codable, Sendable {
    public let basis, configurationRevision: String
    public let updatedAt: String?
    var valid: Bool {
        ["ccusage-report", "current-custom-rates"].contains(basis) && !configurationRevision.isEmpty &&
        (updatedAt == nil || PricingConfig.validTimestamp(updatedAt!))
    }
    public func description(language: AppLanguage) -> String {
        AppLocalization(language: language).text(basis == "current-custom-rates"
            ? "Có giá tùy chỉnh: lịch sử được tính lại theo cấu hình hiện tại, không phải giá tại thời điểm sử dụng."
            : "Giá theo báo cáo ccusage; chưa có ngày hiệu lực đơn giá.")
    }
}
public struct PriceOverride: Codable, Sendable, Equatable, Identifiable {
    public var provider, model: String
    public var input, output, cacheRead, cacheWrite: Double
    public var id: String { provider + "\u{0}" + model }
    public init(provider: String, model: String, input: Double, output: Double, cacheRead: Double, cacheWrite: Double) {
        self.provider = provider; self.model = model; self.input = input; self.output = output; self.cacheRead = cacheRead; self.cacheWrite = cacheWrite
    }
    var valid: Bool {
        ["codex", "claude"].contains(provider) && !model.isEmpty && model.utf16.count <= 200 &&
        model.trimmingCharacters(in: .whitespacesAndNewlines) == model &&
        !model.unicodeScalars.contains { $0.value < 32 || $0.value == 127 } &&
        [input, output, cacheRead, cacheWrite].allSatisfy { $0.isFinite && $0 >= 0 }
    }
}
public enum PricingConfigError: Error { case invalid, unsafePath }
public struct PricingConfig: Codable, Sendable {
    public let version: Int
    public let updatedAt: String?
    public let overrides: [PriceOverride]
    public init(version: Int = 1, updatedAt: String? = nil, overrides: [PriceOverride] = []) {
        self.version = version; self.updatedAt = updatedAt; self.overrides = overrides
    }
    public func validate() throws {
        guard version == 1, overrides.count <= 512, overrides.allSatisfy(\.valid), Set(overrides.map(\.id)).count == overrides.count,
              updatedAt == nil || Self.validTimestamp(updatedAt!) else { throw PricingConfigError.invalid }
    }
    static func validTimestamp(_ value: String) -> Bool {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if f.date(from: value) != nil { return true }
        f.formatOptions = [.withInternetDateTime]; return f.date(from: value) != nil
    }
}
public struct PricingConfigStore: Sendable {
    public let url: URL
    public static var defaultURL: URL {
        if let path = ProcessInfo.processInfo.environment["NO_SHORT_USAGE_PRICING_FILE"] { return URL(fileURLWithPath: path) }
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/no-short/usage/pricing.json")
    }
    public init(url: URL = defaultURL) { self.url = url }
    private func checkPath() throws {
        if let attrs = try? FileManager.default.attributesOfItem(atPath: url.path), attrs[.type] as? FileAttributeType != .typeRegular { throw PricingConfigError.unsafePath }
        if let attrs = try? FileManager.default.attributesOfItem(atPath: url.deletingLastPathComponent().path), attrs[.type] as? FileAttributeType != .typeDirectory { throw PricingConfigError.unsafePath }
    }
    public func load() throws -> PricingConfig {
        try checkPath()
        let data: Data
        do { data = try Data(contentsOf: url) }
        catch let e as NSError where e.domain == NSCocoaErrorDomain && e.code == NSFileReadNoSuchFileError { return .init() }
        guard data.count <= 1_048_576 else { throw PricingConfigError.invalid }
        let config = try JSONDecoder().decode(PricingConfig.self, from: data)
        try config.validate(); return config
    }
    public func save(_ overrides: [PriceOverride], now: Date = Date()) throws {
        let f = ISO8601DateFormatter(); let config = PricingConfig(updatedAt: f.string(from: now), overrides: overrides)
        try config.validate(); try checkPath()
        let parent = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try checkPath()
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(config).write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}
