#!/usr/bin/env python3
"""Build a test-only History app without installing it. Run from any directory.
Requires an existing native debug build (`swift build --package-path packages/usage-menubar`).
Prints the executable path. This script never launches the app or reads real usage logs.
"""
import pathlib
import plistlib
import subprocess

repo = pathlib.Path(__file__).resolve().parents[3]
package = repo / "packages/usage-menubar"
build = package / ".build"
# Swift Build (Xcode 26+) and classic SwiftPM layouts.
products = build / "out/Products/Debug"
if not (products / "UsageCore.swiftmodule").exists():
    products = (build / "debug").resolve()
core = [products / "UsageCore.o"]
if not core[0].exists():
    core = list((products / "UsageCore.build").glob("*.o"))
if not core or not (products / "UsageCore.swiftmodule").exists():
    raise SystemExit("Run swift build --package-path packages/usage-menubar first")
app = build / "ns22-fixture/NS22 Chart Fixture.app"
executable = app / "Contents/MacOS/NS22ChartFixture"
executable.parent.mkdir(parents=True, exist_ok=True)
sources = package / "Sources/NoShortUsageMenuBar"
subprocess.run(["swiftc", "-parse-as-library", "-I", str(products), *map(str, core),
                *[str(sources / name) for name in ["UsageHistoryModel.swift", "UsageHistoryView.swift",
                    "UsageComparisonView.swift", "UsageGroupingView.swift", "UsageInsightsView.swift"]],
                str(package / "scripts/fixtures/HistoryAccessibilityFixture.swift"), "-o", str(executable)], check=True)
with (app / "Contents/Info.plist").open("wb") as output:
    plistlib.dump({"CFBundleIdentifier": "dev.noshort.ns22-fixture", "CFBundleName": "NS22 Chart Fixture",
                  "CFBundleExecutable": executable.name, "CFBundlePackageType": "APPL",
                  "CFBundleShortVersionString": "0.7.0", "CFBundleVersion": "NS22-local"}, output)
print(executable)
