import Foundation
import CoreFoundation

/// Latest context occupancy, separate from cumulative tokens used for billing.
public struct ContextReading: Codable, Sendable, Equatable {
    public let sessionID: String
    public let usedTokens, limitTokens: Double
    public let recordedAt: Date
    public var fraction: Double { min(max(usedTokens / limitTokens,0),1) }
    public var percent: Int { Int((fraction * 100).rounded()) }
    public static func validSessionID(_ value:String) -> Bool {
        !value.isEmpty && value.count <= 160 && value.range(of:"^[A-Za-z0-9_-]+$",options:.regularExpression) != nil
    }
    public var isValid: Bool {
        Self.validSessionID(sessionID) && usedTokens.isFinite && usedTokens >= 0 && limitTokens.isFinite && limitTokens > 0 && recordedAt.timeIntervalSince1970.isFinite
    }
    private static func number(_ value:Any?) -> Double? {
        guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(), value.doubleValue.isFinite else { return nil }
        return value.doubleValue
    }
    public static func codex(_ data:Data,sessionID:String) -> Self? {
        var reading:Self?
        let dates = ISO8601DateFormatter()
        for line in String(decoding:data,as:UTF8.self).components(separatedBy:"\n").dropLast() {
            guard line.first == "{", let object = try? JSONSerialization.jsonObject(with:Data(line.utf8)) as? [String:Any] else { continue }
            if object["type"] as? String == "compacted" { reading=nil; continue }
            guard object["type"] as? String == "event_msg", let payload = object["payload"] as? [String:Any],
                  payload["type"] as? String == "token_count", let info = payload["info"] as? [String:Any] else { continue }
            reading=nil
            guard let limit = number(info["model_context_window"]), let last = info["last_token_usage"] as? [String:Any],
                  let used = number(last["total_tokens"]), let timestamp = object["timestamp"] as? String else { continue }
            dates.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
            var date = dates.date(from:timestamp)
            if date == nil { dates.formatOptions = [.withInternetDateTime]; date=dates.date(from:timestamp) }
            if let date {
                let value = Self(sessionID:sessionID,usedTokens:used,limitTokens:limit,recordedAt:date)
                if value.isValid { reading=value }
            }
        }
        return reading
    }
    public static func claudeStatusLine(_ data:Data,now:Date = Date()) -> Self? {
        guard data.count <= 8_388_608,
              let object = try? JSONSerialization.jsonObject(with:data) as? [String:Any],
              let session = object["session_id"] as? String, validSessionID(session), !session.hasPrefix("agent-"),
              (object["agent_id"] as? String ?? "").isEmpty,
              !(object["transcript_path"] as? String ?? "").contains("/subagents/"),
              let context = object["context_window"] as? [String:Any],
              let limit = number(context["context_window_size"]), let percent = number(context["used_percentage"]),
              (0...100).contains(percent) else { return nil }
        let value = Self(sessionID:session,usedTokens:limit * percent / 100,limitTokens:limit,recordedAt:now)
        return value.isValid ? value : nil
    }
}
