import XCTest
@testable import UsageCore

final class ContextReadingTests: XCTestCase {
    func testCodexUsesLastTurnInsteadOfAccumulatedBillingTokensAndIgnoresPartialLines() throws {
        let log = #"{"type":"event_msg","timestamp":"2026-10-18T08:00:00Z","payload":{"type":"token_count","info":{"model_context_window":1000,"total_token_usage":{"total_tokens":90000},"last_token_usage":{"total_tokens":250,"input_tokens":240,"cached_input_tokens":200,"output_tokens":10}}}}"# + "\n" + #"{"type":"event_msg","payload":{"unfinished":"#
        let reading = try XCTUnwrap(ContextReading.codex(Data(log.utf8),sessionID:"main"))
        XCTAssertEqual(reading.usedTokens,250)
        XCTAssertEqual(reading.limitTokens,1000)
        XCTAssertEqual(reading.percent,25)
        XCTAssertEqual(reading.sessionID,"main")
    }
    func testCompactionInvalidatesAnOldReadingUntilAnotherTokenEvent() throws {
        let event = #"{"type":"event_msg","timestamp":"2026-10-18T08:00:00Z","payload":{"type":"token_count","info":{"model_context_window":1000,"last_token_usage":{"total_tokens":900}}}}"# + "\n"
        XCTAssertNil(ContextReading.codex(Data((event + "{\"type\":\"compacted\"}\n").utf8),sessionID:"a"))
        let reset = event.replacingOccurrences(of:"900",with:"100")
        XCTAssertEqual(ContextReading.codex(Data((event + "{\"type\":\"compacted\"}\n" + reset).utf8),sessionID:"a")?.percent,10)
    }
    func testClaudeUsesReportedWindowAndPercentageWithoutModelNameGuessesOrMessageContent() throws {
        let data = Data(#"{"session_id":"claude-main","model":{"id":"unknown-custom-model"},"context_window":{"context_window_size":1000000,"used_percentage":37.5},"transcript_path":"PRIVATE_PATH","prompt":"PRIVATE_PROMPT"}"#.utf8)
        let reading = try XCTUnwrap(ContextReading.claudeStatusLine(data))
        XCTAssertEqual(reading.limitTokens,1000000)
        XCTAssertEqual(reading.percent,38)
        XCTAssertFalse(String(decoding:try JSONEncoder().encode(reading),as:UTF8.self).contains("PRIVATE"))
        XCTAssertNil(ContextReading.claudeStatusLine(Data(#"{"session_id":"a","context_window":{"context_window_size":200000,"used_percentage":null}}"#.utf8)))
        XCTAssertNil(ContextReading.claudeStatusLine(Data(#"{"session_id":"../a","context_window":{"context_window_size":200000,"used_percentage":30}}"#.utf8)))
    }
    func testInvalidLimitsStayUnknownButZeroAndOverfullWindowsHaveDistinctValidValues() throws {
        func event(_ used:Int,_ limit:Int) -> Data { Data(("{\"type\":\"event_msg\",\"timestamp\":\"2026-10-18T08:00:00Z\",\"payload\":{\"type\":\"token_count\",\"info\":{\"model_context_window\":\(limit),\"last_token_usage\":{\"total_tokens\":\(used)}}}}\n").utf8) }
        XCTAssertNil(ContextReading.codex(event(0,0),sessionID:"a"))
        XCTAssertNil(ContextReading.codex(event(-1,100),sessionID:"a"))
        XCTAssertEqual(ContextReading.codex(event(0,100),sessionID:"a")?.percent,0)
        XCTAssertEqual(ContextReading.codex(event(150,100),sessionID:"a")?.percent,100)
    }
}
