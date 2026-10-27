# NS-09 — Lịch sử sử dụng và cửa sổ chi tiết

Ngày: 2026-10-20. Trạng thái: **đã triển khai local theo yêu cầu làm lần lượt NS-07 đến NS-12; chưa phát hành**.
Nhánh: `codex/ns09-usage-history-window`, xuất phát từ `origin/main`
`827dbb63e8412ad8b8639e752408810db7c4c4a2` sau khi PR #25 (NS-06) đã merge.

## 1. Mục tiêu và phạm vi đã thống nhất

Giữ menu-bar popover để xem nhanh. Thêm cửa sổ native “Chi tiết sử dụng”
để xem lịch sử mà không tự đóng khi người dùng bấm ra ngoài. Bản đầu có:

- Bộ lọc Tất cả / Codex / Claude Code theo nguồn được cấu hình.
- Khoảng 7 ngày, 30 ngày, tháng này, tháng trước và ngày tùy chọn.
- Tổng token, chi phí API ước tính, biểu đồ theo ngày và bảng theo model.
- Chọn ngày trên biểu đồ để xem breakdown model của ngày đó.
- Cùng khả năng lọc lịch sử trong panel MCP, không mở website/dashboard mới.

Người dùng đã đồng ý hướng cửa sổ riêng, tổng quan, biểu đồ ngày và bảng model.
Các quyết định chi tiết dưới đây là đề xuất cần duyệt trong spec này.
Không triển khai trước khi người dùng duyệt spec, sau đó duyệt kế hoạch thực hiện.

Ngoài phạm vi: chi tiết phiên theo khoảng ngày, nhóm dự án/cha–con, xuất CSV/JSON
(NS-10), ngân sách (NS-11), cloud sync, provider mới, tự cập nhật, phát hành.
NS-07 vẫn là task riêng cho kích thước/khả năng cuộn của popover.
NS-08 vẫn theo dõi hiệu năng quét metadata và điều tra deduplication của ccusage.

## 2. Hiện trạng và lựa chọn thiết kế

Đã kiểm tra các tệp `packages/usage/src/{adapter,runner,service,cache,types}.ts`,
`packages/usage/ui/model.ts`, `UsageCore/Snapshot.swift` và các controller native.

- `runner.ts` lấy `daily,session` trong cùng báo cáo ccusage 20.0.34.
- Daily rows đã có token, breakdown model và các provider trong `agents`.
- Adapter hiện chỉ giữ today/month và chart 7 ngày; chart chỉ chứa chi phí.
- Snapshot schema v1 và cache/scan lock được dùng chung giữa plugin và native.
- NS-06 có bảng model bên trong popover, chưa có cửa sổ lịch sử riêng.
- App đã có mẫu `NSWindowController` cho About; popover có behavior transient.

Ba phương án:

1. **Cửa sổ native riêng, dùng chung snapshot — chọn.** Phù hợp việc phân tích,
   có chỗ cho bộ lọc/bảng dài và không thêm runtime hoặc bộ quét khác.
2. Nhét toàn bộ lịch sử vào popover: ít controller mới nhưng chật và dễ đóng
   mất ngữ cảnh; không chọn.
3. Dashboard web/local server mới: tăng runtime, quyền và luồng dữ liệu không
   cần thiết; không chọn. Panel MCP hiện có vẫn được mở rộng trong host.

## 3. Luồng cửa sổ native

- Nút “Xem chi tiết…” trong popover và mục tương ứng trong menu chuột phải.
  Đóng popover trước khi đưa cửa sổ lên, theo mẫu About đang có.
- `AppDelegate` sở hữu một `UsageHistoryWindowController` giữ lại khi đóng.
  Bấm lại chỉ đưa cửa sổ hiện có lên trước; không mở bản sao.
- Cửa sổ resizable, khởi tạo khoảng 960×700 point và giới hạn trong visibleFrame
  của màn hình. Trên vùng nhỏ dùng bố cục xếp dọc/cuộn, không để nút ngoài màn hình.
- Toolbar: provider, preset, hai ô ngày khi chọn tùy chỉnh, Làm mới.
- Thân: cảnh báo nguồn/dữ liệu → tổng quan → biểu đồ → bảng model.
- Hiển thị phạm vi ngày, múi giờ của snapshot và thời điểm cập nhật.
- Tổng quan luôn là **khoảng đã chọn**. Chọn ngày chỉ đổi vùng breakdown model
  phía dưới, có tiêu đề ngày rõ ràng; có “Toàn khoảng” để bỏ chọn ngày.
- Bảng model có Input / Output / Cache read / Cache write / Total và chi phí,
  sắp xếp mặc định theo chi phí đã biết giảm dần, tên model để phá hòa.
  Tên dài có thể đọc đầy đủ; bảng cuộn và có biểu diễn tương đương bằng bàn phím.
- Đóng cửa sổ không thoát app, dừng đọc nền, ngắt hooks/context hoặc đổi login.
  Không thêm Dock icon chỉ để mở cửa sổ này.

### State độc lập

`UsageHistoryModel` giữ provider/khoảng ngày/ngày đang xem riêng. Nó nhận snapshot,
loading, stale/error và ngôn ngữ từ luồng hiện có; không tạo `SnapshotClient`,
`RefreshController` hay timer riêng. Làm mới gọi controller hiện có.

Lần tạo đầu: preset 30 ngày; provider sao chép bộ lọc popover hiện tại. Mở lại
trong cùng tiến trình giữ bộ lọc, khoảng ngày và kích thước cửa sổ. Khởi động
lại dùng mặc định trên; chưa thêm lưu bộ lọc lịch sử ra ổ đĩa trong bản đầu.

Đổi bộ lọc lịch sử tuyệt đối không gọi `chooseSession`/`setProviderFilter`
của popover, không thay `usagePinnedSession`, phiên follow, context hoặc cảnh báo.
Đổi nguồn xóa ngày đang chọn và dữ liệu lịch sử cũ ngay; không giữ tổng của nguồn
cũ dưới nhãn nguồn mới trong lúc tải. Đổi ngôn ngữ cập nhật cửa sổ đang mở.

## 4. Hợp đồng dữ liệu và tương thích

Thêm trường **optional** `history` vào `UsageSnapshot`, giữ `schemaVersion: 1`,
các field hiện có và tên/input tool. Hình dạng đề xuất:

```ts
history?: {
  version: 1;
  providers: UsageProvider[];
  days: { date: string; provider: UsageProvider; aggregate: Aggregate }[];
}
```

- `date` là ngày Gregorian hợp lệ `YYYY-MM-DD`, theo `snapshot.timeZone`.
  Chỉ chấp nhận provider đã cấu hình. Mỗi cặp date/provider có tối đa một aggregate.
- Các dòng trùng được hợp nhất từ cùng nguồn daily trong adapter; không cộng
  đồng thời row tổng và các `agents` của row đó. Giữ cơ chế dedup hiện có của ccusage.
- Giữ toàn bộ ngày có trong báo cáo daily thành công, không chỉ 7/30 ngày;
  không thêm tên/ID phiên, nội dung hội thoại hoặc đường dẫn vào history.
- Không tạo history từ `sessions`, `lastActivity` hoặc metadata phiên.
- Tổng theo khoảng = tổng daily aggregates đúng provider/ngày. Bảng model và
  token theo khoảng/ngày lấy từ cùng daily aggregates, không từ lifetime sessions.
- Viết hàm tạo projection lịch sử thuần ở TS và Swift, dùng fixture chung để
  đối chiếu hai implementation. Không kéo UI native vào engine hoặc ngược lại.
- `providers` phân biệt nguồn rỗng đã đọc thành công với provider không có trong
  snapshot. Nếu một provider không có trong history, không mượn tổng provider khác.
- Không có dòng cho ngày trong **báo cáo thành công** được thể hiện là không có
  usage trong log giữ lại. Không khẳng định log đủ lịch sử tài khoản hoặc bị xóa
  là chưa từng có usage. Ghi rõ phạm vi là log hiện còn trên máy.
- Snapshot lỗi không tạo history rỗng mang nghĩa đọc thành công. Lỗi khi có cache
  giữ số cũ kèm stale/error; khi chưa có dữ liệu hiển thị unavailable, không giả 0.
- Snapshot cũ thiếu history vẫn dùng được cho dashboard/phiên hiện có. Vùng lịch sử
  báo cần cập nhật dữ liệu/runtime, không dựng token/model lịch sử từ chart cũ.

### Cache, transport và xác thực

- `service.ts` vẫn dùng một lần `runReport`, cùng phạm vi nguồn/múi giờ và scan lock.
  Đổi bộ lọc không phát thêm tool call hay quét log.
- Dùng revision riêng trong cache scope cho engine có history để không coi snapshot
  cũ thiếu history là cache mới đủ khả năng; không đổi schema chung thành v2.
- Native decode và panel kiểm tra history optional: version/provider, ngày thực,
  số hữu hạn không âm, giá hợp lệ, cặp date/provider không trùng. History hỏng
  được loại riêng và hiển thị unavailable, không phá dashboard schema v1 hợp lệ.
- Giữ ghi cache atomic và quyền riêng tư đang có. Cache cũ không bị xóa tự động.
- History nằm trong dữ liệu widget `_meta`/snapshot như dữ liệu hiện có; không
  đẩy toàn bộ lịch sử vào `structuredContent` hoặc phần text cho model.
- Kiểm tra kích thước/transport với nhiều năm dữ liệu. Không cắt bớt lịch sử rồi
  hiển thị như đầy đủ. Nếu vượt giới hạn hiện có, báo lỗi/giữ cache cũ với cảnh báo;
  không bỏ giới hạn bảo vệ bộ nhớ hiện tại để “cho qua”.

## 5. Ngày, phạm vi và giá

- 7/30 ngày gồm hôm nay và 6/29 ngày trước, theo snapshot.timeZone.
- Tháng này: ngày đầu tháng đến hôm nay. Tháng trước: toàn tháng lịch trước.
- Tùy chỉnh: hai đầu ngày inclusive; kiểm tra ngày có thật, bắt đầu ≤ kết thúc,
  và không chấp nhận ngày kết thúc sau hôm nay. Lỗi không thay projection hợp lệ.
- Dùng phép toán ngày lịch, không trừ cố định 24 giờ để vượt ngày DST.
- Khi đổi ngày/múi giờ, preset tính lại theo snapshot; bỏ chọn ngày ngoài khoảng.
  Khoảng tùy chỉnh giữ ngày người dùng đã chọn, nhưng vẫn kiểm tra lại.
- Khoảng không có usage sau lần đọc thành công hiển thị zero/empty rõ ràng;
  ngày thiếu giá hiển thị unknown/partial, không vẽ thành $0.
- `estimated` là chi phí quy đổi khi đủ giá, không phải hóa đơn thực tế.
  `partial` là phần đã biết + phần thiếu giá, kể cả phần đã biết bằng $0.
  `unknown` khi không có phần usage nào được định giá. Trạng thái không suy ra
  chỉ từ việc tổng USD lớn hơn 0 hay không. Models thiếu giá vẫn có token.
- Duy trì ý nghĩa today/month, chart 7 ngày và chi phí toàn phiên hiện có.
  NS-09 không được sửa chart cũ thành 30 ngày hoặc đổi chi phí toàn phiên.

## 6. Panel MCP và ngôn ngữ

Thêm vùng/chế độ “Lịch sử” ngay trong panel hiện có, có bộ lọc provider, preset,
ngày tùy chọn, tổng, chart và bảng model tương đương native. Ở 320px xếp dọc,
cuộn hợp lý, không ép một cửa sổ desktop vào iframe. Không mở cửa sổ native từ host.

State lịch sử riêng với tab/phiên đang ghim và bộ lọc dashboard của NS-06; trong
một lần mount giữ state khi đổi chế độ. Chưa ghi state lịch sử vào persistent
widgetState/localStorage trong bản đầu; state phiên hiện có không bị thay đổi.
Tool request chỉ định phiên vẫn chọn phiên theo quy tắc hiện có, không bị bộ lọc
lịch sử chặn. Giữ các hồi quy host khôi phục state muộn và metadata replay của NS-06.

Tất cả nhãn, empty/error, tooltip, accessibility labels: EN / VI / 简体中文.
Sáng/tối, bàn phím và biểu diễn văn bản của chart đều cần kiểm tra.

## 7. Kiểm chứng và tiêu chí nghiệm thu

### Engine / contract

- Fixture hai provider, nhiều model, phiên xuyên nhiều ngày/tháng: tổng lịch sử
  khớp daily nguồn và khác đúng với lifetime session.
- Chỉ Codex schema v1 cũ; nguồn Claude rỗng; không có history; history sai;
  mixed providers thiếu breakdown; không lấy nhầm combined totals làm Codex.
- Giá đủ, unknown, partial có phần đã biết dương hoặc bằng 0, chi phí $0 hợp lệ.
- Ngày/tháng/năm nhuận, DST, UTC+/UTC−, ranh giới tháng/năm, custom sai và empty.
- Kiểm tra cache revision, nguồn đổi, lỗi/stale, lock dùng chung và nhiều request.
- Fixture lớn qua CLI stdout và native SnapshotClient; bộ lọc không thêm lần đọc.
- ccusage thật trên fixture synthetic xác nhận daily model/provider semantics.
  Va chạm timestamp/token đã ghi ở NS-08 vẫn là giới hạn theo dõi riêng;
  không tuyên bố NS-09 đã sửa ccusage hoặc tổng là hóa đơn chính xác.

### UI / vòng đời

- Native: single-window, reopen/focus, resize trên màn hình thấp, Cmd-W,
  đóng không quit; không thêm controller/timer quét. Giữ nguyên pin/follow/context.
- Panel: mọi preset/provider, chọn/bỏ chọn ngày, model table, bàn phím, 320px,
  cả theme và ba ngôn ngữ; các regression NS-06 vẫn qua.
- Native model/render test tương ứng, bảng dài và warning. Ghi riêng synthetic
  render khỏi thao tác app đã cài, VoiceOver, máy sạch và Intel runtime.
- Chạy Usage unit tests, browser tests, Swift/packaging tests, typecheck,
  validation, build UI/runtime/native và smoke/provenance/signature.

## 8. Tích hợp và bàn giao

- Chỉ viết spec trong giai đoạn hiện tại. Duyệt spec → viết kế hoạch có thứ tự,
  ranh giới tệp/test và phương thức thực hiện → người dùng duyệt kế hoạch → TDD.
- Cập nhật BACKLOG và hướng dẫn native/panel khi thực sự có implementation/evidence;
  không đánh dấu NS-09 hoàn thành vì đã có spec.
- Task hoàn tất có commit/push và **PR riêng NS-09**, kèm kết quả kiểm chứng và
  giới hạn còn lại. Nếu phải tách PR để review, ghi rõ phần nào chưa hoàn tất task.
- Không bump phiên bản, merge, tự cài thay app, deploy website hoặc publish release
  trong phạm vi này. Bản download công khai chỉ thay đổi khi có yêu cầu phát hành.
