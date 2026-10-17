// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "NoShortUsageMenuBar", platforms: [.macOS(.v14)],
    products: [.executable(name: "NoShortUsageMenuBar", targets: ["NoShortUsageMenuBar"])],
    targets: [
        .target(name: "UsageCore"),
        .executableTarget(name: "NoShortUsageMenuBar", dependencies: ["UsageCore"]),
        .testTarget(name: "UsageCoreTests", dependencies: ["UsageCore"], resources: [.copy("Fixtures")])
    ]
)
