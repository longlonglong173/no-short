import Foundation

/// Keeps a bounded, persistable crossing latch per source/provider/session.
/// Missing readings never rearm a latch; only a measured drop does.
public struct ContextAlertTracker: Codable, Sendable {
    private struct State: Codable, Sendable {
        var above: Bool
        var changedAt: Date
    }
    private var states: [String:State] = [:]
    public init() {}
    public mutating func consume(_ reading: ContextReading?, provider: UsageProvider, source: String, threshold: Int) -> Bool {
        guard let reading, reading.isValid, (1...100).contains(threshold) else { return false }
        let key = String(decoding:(try? JSONEncoder().encode([source,provider.rawValue,reading.sessionID])) ?? Data(),as:UTF8.self)
        let above = reading.fraction * 100 >= Double(threshold)
        let previous = states[key]?.above ?? false
        if states[key] == nil || previous != above {
            states[key] = State(above:above,changedAt:Date())
            if states.count > 512, let oldest = states.filter({ $0.key != key }).min(by:{ $0.value.changedAt < $1.value.changedAt })?.key {
                states.removeValue(forKey:oldest)
            }
        }
        return above && !previous
    }
}
