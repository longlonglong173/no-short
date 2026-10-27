// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "NoShortUsageMenuBar", platforms: [.macOS(.v14)],
    products: [.executable(name: "NoShortUsageMenuBar", targets: ["NoShortUsageMenuBar"])],
    dependencies: [.package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.10.0")],
    targets: [
        .target(name: "UsageCore"),
        .executableTarget(name: "NoShortUsageMenuBar", dependencies: ["UsageCore", .product(name: "Sparkle", package: "Sparkle")], resources: [.process("Resources")], linkerSettings: [.unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"])]),
        .testTarget(name: "UsageCoreTests", dependencies: ["UsageCore", "NoShortUsageMenuBar"], resources: [.copy("Fixtures")])
    ]
)
