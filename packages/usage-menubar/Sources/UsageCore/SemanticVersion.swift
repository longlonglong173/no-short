import Foundation

/// SemVer 2.0 precedence, with an optional GitHub `v` tag prefix.
/// Numeric strings avoid overflow; build metadata never changes precedence.
public struct SemanticVersion: Comparable, Sendable {
    private let core: [String]
    private let prerelease: [String]

    public init?(_ value: String) {
        let text = value.hasPrefix("v") ? String(value.dropFirst()) : value
        let buildParts = text.split(separator: "+", omittingEmptySubsequences: false)
        guard buildParts.count <= 2 else { return nil }
        func identifiers(_ text: Substring) -> [String]? {
            let parts = text.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
            guard parts.allSatisfy({ !$0.isEmpty && $0.utf8.allSatisfy { (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0 == 45 } }) else { return nil }
            return parts
        }
        if buildParts.count == 2, identifiers(buildParts[1]) == nil { return nil }
        let versionParts = buildParts[0].split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        let numbers = versionParts[0].split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard numbers.count == 3, numbers.allSatisfy({ Self.isNumber($0) && ($0.count == 1 || !$0.hasPrefix("0")) }) else { return nil }
        core = numbers
        if versionParts.count == 2 {
            guard let values = identifiers(versionParts[1]), values.allSatisfy({ !Self.isNumber($0) || $0.count == 1 || !$0.hasPrefix("0") }) else { return nil }
            prerelease = values
        } else { prerelease = [] }
    }
    private static func isNumber(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.allSatisfy { (48...57).contains($0) }
    }
    private static func numericLess(_ lhs: String, _ rhs: String) -> Bool {
        lhs.count == rhs.count ? lhs < rhs : lhs.count < rhs.count
    }
    public static func < (lhs: Self, rhs: Self) -> Bool {
        for (a, b) in zip(lhs.core, rhs.core) where a != b { return numericLess(a, b) }
        if lhs.prerelease.isEmpty || rhs.prerelease.isEmpty { return !lhs.prerelease.isEmpty && rhs.prerelease.isEmpty }
        for (a, b) in zip(lhs.prerelease, rhs.prerelease) where a != b {
            let an = isNumber(a), bn = isNumber(b)
            if an != bn { return an }
            return an ? numericLess(a, b) : a < b
        }
        return lhs.prerelease.count < rhs.prerelease.count
    }
}
