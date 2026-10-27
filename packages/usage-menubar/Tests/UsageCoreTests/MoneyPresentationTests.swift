import XCTest
@testable import UsageCore

final class MoneyPresentationTests: XCTestCase {
    func testSharedPanelNativeMoneyContractAndRounding() throws {
        struct Row: Decodable { let name: String; let cost: UsageCost; let expected: String }
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../usage/tests/fixtures/money-presentation.json").standardized
        let rows = try JSONDecoder().decode([Row].self, from: Data(contentsOf: root))
        for row in rows { XCTAssertEqual(UsagePresentation.money(row.cost), row.expected, row.name) }
    }
}
