// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "NoShortUsageMenuBar", platforms: [.macOS(.v14)],
    products: [.executable(name: "NoShortUsageMenuBar", targets: ["NoShortUsageMenuBar"])],
    targets: [
        .target(name: "UsageCore"),
        .executableTarget(name: "NoShortUsageMenuBar", dependencies: ["UsageCore"], resources: [.process("Resources")]),
        .testTarget(name: "UsageCoreTests", dependencies: ["UsageCore", "NoShortUsageMenuBar"], resources: [.copy("Fixtures")])
    ]
)
