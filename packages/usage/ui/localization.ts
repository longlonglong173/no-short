export const languages = [
  { code: 'en', title: 'EN' }, { code: 'vi', title: 'VI' }, { code: 'zh-CN', title: '中文' }
] as const;
export type Language = typeof languages[number]['code'];
export function resolveLanguage(saved: unknown, preferred: readonly string[]): Language {
  if (languages.some(option => option.code === saved)) return saved as Language;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (base === 'vi') return 'vi';
    if (base === 'zh') return 'zh-CN';
    if (base === 'en') return 'en';
  }
  return 'en';
}
export function translate(language: Language, key: string, ...args: string[]): string {
  const template = language === 'vi' ? key : catalog[key]?.[language === 'en' ? 0 : 1] ?? key;
  let index = 0;
  return template.replace(/%@/g, () => args[index++] ?? '%@');
}
export const catalog: Record<string, readonly [string, string]> = {
  "Giá theo phiên chưa khớp tổng ngày do giá chưa đầy đủ. Token theo ngày vẫn chính xác; chi phí từng phiên là phần đã biết.": ["Session prices differ from daily totals because pricing is incomplete. Daily tokens remain exact; session costs show known amounts.", "由于定价不完整，会话费用与每日总额不同。每日令牌数仍准确；会话费用显示已知部分。"],
  "Các phiên đóng góp trong ngày": ["Contributing sessions for this day", "当天有用量的会话"],
  "Runtime chưa hỗ trợ phân bổ usage theo phiên/ngày. Cập nhật runtime để xem chi tiết.": ["This runtime does not support session/day attribution. Update the runtime to view details.", "此运行时不支持按会话和日期归属用量。请更新运行时以查看详情。"],
  "Không thể đối soát phân bổ phiên với tổng ngày. Chi tiết phiên chưa khả dụng.": ["Session allocation does not match daily totals. Session details are unavailable.", "会话归属用量与每日总量不一致。会话详情暂不可用。"],
  "Không có phiên đóng góp trong ngày này.": ["No contributing sessions for this day.", "当天没有贡献用量的会话。"],
  "Chi tiết usage trong ngày · %@": ["Usage details for this day · %@", "当天用量详情 · %@"],
  "Đóng chi tiết phiên": ["Close session details", "关闭会话详情"],
  "Loại phiên chưa xác định": ["Unknown session kind", "会话类型未知"],
  "Cơ sở giá theo phiên và theo ngày chưa khớp; chi phí nhóm còn bất định.": ["Session and daily pricing bases differ; grouped costs remain uncertain.", "会话与每日计价依据不一致；分组费用仍存在不确定性。"],

  "Nhóm usage": ["Group usage", "用量分组"],
  "Không nhóm": ["No grouping", "不分组"],
  "Theo dự án": ["By project", "按项目"],
  "Công việc cha–con": ["Parent and child work", "父子任务"],
  "Phân bổ trực tiếp theo phiên": ["Direct session allocation", "会话直接分配"],
  "Token trực tiếp": ["Direct tokens", "直接令牌"],
  "Chi phí trực tiếp": ["Direct cost", "直接费用"],
  "Phiên chưa xác định": ["Unknown session", "未知会话"],
  "Dự án chưa xác định": ["Unknown project", "未知项目"],
  "Chỉ cộng đóng góp log duy nhất trong khoảng; dòng phiên là usage trực tiếp, tổng công việc gồm các tác vụ con.": ["Only unique log contributions in this range are counted; session rows show direct usage, work totals include descendants.", "仅统计此时间范围内的唯一日志贡献；会话行显示直接用量，任务总计包含子任务。"],
  "Chưa có phân bổ phiên/ngày tương thích; không dùng chi phí toàn phiên.": ["Compatible session/day allocation is unavailable; lifetime session costs are not used.", "缺少兼容的会话/日期分配；不会使用会话总费用。"],
  "Chưa phân bổ hết usage nguồn; tổng nhóm chưa đối chiếu khớp.": ["Some source usage is unallocated; group totals do not reconcile.", "部分来源用量尚未分配；分组总计与来源不符。"],
  "Tổng nhóm khớp dữ liệu nguồn trong cùng bộ lọc.": ["Group totals reconcile with source data using the same filters.", "分组总计与相同筛选条件下的来源数据一致。"],
  "Git hiện tại đã xác minh": ["Verified current Git identity", "已验证的当前 Git 标识"],
  "Thư mục ghi nhận · độ tin cậy thấp hơn": ["Recorded directory · lower confidence", "记录的目录 · 较低可信度"],
  "Chưa đủ metadata dự án": ["Project metadata unavailable", "项目元数据不足"],
  "Quan hệ chưa xác minh; giữ phiên riêng.": ["Unverified relationship; session remains separate.", "关系未经验证；会话保持独立。"],
  "Quan hệ cha–con chỉ từ metadata tường minh.": ["Parent and child links use explicit metadata only.", "父子关系仅使用明确元数据。"],

  "Bộ đọc chưa cung cấp nguồn giá model Codex. Cập nhật runtime No Short Usage rồi thử lại.": ["The reader does not supply Codex model price provenance. Update the No Short Usage runtime and retry.", "读取器未提供 Codex 模型价格来源。请更新 No Short Usage 运行时后重试。"],
  "Cấu hình đơn giá đã thay đổi khi đọc log. Làm mới để tính theo cấu hình mới.": ["Pricing configuration changed while reading logs. Refresh to use the new configuration.", "读取日志期间定价配置发生变化。请刷新以使用新配置。"],
  "Đơn giá…": ["Pricing…", "价格…"],
  "Đơn giá tùy chỉnh": ["Custom pricing", "自定义定价"],
  "Giá tùy chỉnh": ["Custom price", "自定义价格"],
  "Giá fallback chưa được xác nhận": ["Unverified fallback price", "未经确认的回退价格"],
  "Nhiều nguồn giá": ["Multiple price origins", "多个价格来源"],
  "Cấu hình cập nhật": ["Configuration saved", "配置保存时间"],
  "Cấu hình cập nhật: %@": ["Configuration saved: %@", "配置保存时间：%@"],
  "USD/1M token: Input %@ · Output %@ · Cache read %@ · Cache write %@": ["USD/1M tokens: Input %@ · Output %@ · Cache read %@ · Cache write %@", "美元/百万令牌：输入 %@ · 输出 %@ · 缓存读取 %@ · 缓存写入 %@"],
  "Đơn giá và ngày hiệu lực chưa được nguồn cung cấp.": ["Unit rates and their effective date are not supplied by the source.", "来源未提供单价及其生效日期。"],
  "Có giá tùy chỉnh: lịch sử được tính lại theo cấu hình hiện tại, không phải giá tại thời điểm sử dụng.": ["Custom prices: history is repriced using the current configuration, not prices at the time of use.", "使用自定义价格：历史用量按当前配置重新计价，而非使用时的价格。"],
  "Giá theo báo cáo ccusage; chưa có ngày hiệu lực đơn giá.": ["Prices from the ccusage report; unit-price effective dates are unavailable.", "价格来自 ccusage 报告；单价生效日期未知。"],
  "USD trên 1 triệu token. Nhập đúng tên model và công cụ; 0 là giá miễn phí do bạn đặt, không phải giá chưa biết.": ["USD per million tokens. Use the exact model and provider; 0 is your explicit free price, not unknown pricing.", "每百万令牌的美元价格。请输入准确的模型和工具；0 表示您明确设置免费，而非价格未知。"],
  "Tên model chính xác": ["Exact model name", "准确的模型名称"],
  "Dùng giá mặc định cho model này": ["Use default pricing for this model", "此模型使用默认价格"],
  "Không có giá tùy chỉnh; dùng giá theo báo cáo ccusage.": ["No custom prices; using prices from the ccusage report.", "没有自定义价格；使用 ccusage 报告价格。"],
  "Thêm model": ["Add model", "添加模型"],
  "Khôi phục mặc định": ["Restore defaults", "恢复默认设置"],
  "Các thay đổi chỉ có hiệu lực khi Lưu. Khôi phục hoặc Hủy không xóa log gốc.": ["Changes apply only when saved. Restore or Cancel never deletes original logs.", "更改仅在保存后生效。恢复或取消不会删除原始日志。"],
  "Không đọc được cấu hình đơn giá. Chọn Khôi phục mặc định rồi Lưu để thay cấu hình lỗi.": ["Cannot read pricing configuration. Choose Restore defaults, then Save to replace the invalid configuration.", "无法读取定价配置。选择恢复默认设置后保存，以替换无效配置。"],
  "Không lưu được đơn giá. Kiểm tra quyền ghi, model không trùng và bốn mức USD hữu hạn ≥ 0.": ["Could not save prices. Check write permission, unique models and four finite USD rates ≥ 0.", "无法保存价格。请检查写入权限、模型不重复且四项美元价格均为有限数且 ≥ 0。"],
  "Không đọc được cấu hình đơn giá. Mở Đơn giá để kiểm tra hoặc khôi phục; số liệu cũ giữ cơ sở giá trước đó.": ["Cannot read pricing configuration. Open Pricing to inspect or restore it; retained data uses its previous pricing basis.", "无法读取定价配置。请打开价格设置检查或恢复；保留数据仍使用先前的计价依据。"],
  "Đơn giá tạo ra chi phí quá lớn. Giảm đơn giá và thử lại.": ["The rates produce an overflowing cost. Reduce the rates and retry.", "单价导致费用溢出。请降低单价后重试。"],
  "Cache đang được bảo trì. Chờ một lúc rồi thử lại.": ["Cache maintenance is in progress. Wait a moment, then retry.", "缓存正在维护。请稍候再试。"],
  "Không tải được file hoặc host đã từ chối. Thử lại hoặc xuất từ cửa sổ native.": ["File download failed or was denied by the host. Retry or export from the native window.", "文件下载失败或被宿主拒绝。请重试或从原生窗口导出。"],
  "Tham chiếu phiên không phải phân bổ chi phí theo phiên; có thể không đủ các phiên đã đóng góp.": ["Session references do not attribute costs and may not include every contributing session.", "会话引用不代表费用归属，也可能不包含所有贡献会话。"],
  "Kèm tên/ID phiên (hoạt động cuối trong khoảng)": ["Include session names/IDs (last activity in range)", "包含会话名称/ID（范围内最后活动）"],
  "Xuất toàn khoảng đã chọn, không chỉ ngày đang xem model.": ["Export the entire selected range, not only the day shown in the model table.", "导出整个所选范围，而非仅模型表中显示的日期。"],
  "Xuất JSON": ["Export JSON", "导出 JSON"],
  "Xuất CSV": ["Export CSV", "导出 CSV"],
  "Xuất thống kê": ["Export usage", "导出用量"],
  "Chỉ thống kê log còn trên máy; không phải toàn bộ lịch sử tài khoản.": ["Only retained local logs are counted, not the full account history.", "仅统计本机保留的日志，而非完整账户历史。"],
  "Giá chưa đầy đủ, không phải $0.": ["Pricing is incomplete, not zero.", "价格不完整，并非零费用。"],
  "≥ là phần chi phí đã biết; — là giá chưa biết, không phải $0.": ["≥ shows known costs; — means unknown price, not $0.", "≥ 表示已知费用；— 表示价格未知，并非 $0。"],
  "Chưa có lịch sử tương thích. Cập nhật dữ liệu hoặc runtime; không suy ra lịch sử từ toàn phiên.": ["Compatible history is unavailable. Refresh or update the runtime; history is not inferred from lifetime sessions.", "暂无兼容的历史数据。请刷新或更新运行时；历史数据不会从整个会话推算。"],
  "Khoảng ngày không hợp lệ. Chọn ngày bắt đầu không sau ngày kết thúc và không chọn tương lai.": ["Invalid date range. Start must not follow end; future dates are not allowed.", "日期范围无效。开始日期不能晚于结束日期，也不能选择未来日期。"],
  "Nhận gần nhất": ["Last received", "上次接收"],
  "Cache write": ["Cache write", "缓存写入"],
  "Cache read": ["Cache read", "缓存读取"],
  "Bảng model lịch sử": ["History model table", "历史模型表"],
  "Token": ["Tokens", "令牌"],
  "Tổng trong khoảng đã chọn": ["Total in selected range", "所选范围总计"],
  "Toàn khoảng": ["Entire range", "整个范围"],
  "Đến ngày": ["To date", "结束日期"],
  "Từ ngày": ["From date", "开始日期"],
  "Tùy chọn": ["Custom", "自定义"],
  "Tháng trước": ["Previous month", "上个月"],
  "30 ngày": ["30 days", "30 天"],
  "7 ngày": ["7 days", "7 天"],
  "Khoảng lịch sử": ["History range", "历史范围"],
  "Công cụ lịch sử": ["History provider", "历史工具"],
  "So sánh với kỳ trước cùng độ dài": ["Compare with the previous equal-length period", "与上一等长时间段比较"],
  "So sánh hai khoảng thời gian": ["Compare two periods", "比较两个时间段"],
  "Kỳ đã chọn: %@ → %@": ["Selected period: %@ → %@", "所选时间段：%@ → %@"],
  "Kỳ trước: %@ → %@": ["Previous period: %@ → %@", "上一时间段：%@ → %@"],
  "Thay đổi token": ["Token change", "令牌变化"],
  "Thay đổi chi phí": ["Cost change", "费用变化"],
  "Tỷ lệ cache read": ["Cache read ratio", "缓存读取比例"],
  "Thay đổi cache": ["Cache change", "缓存比例变化"],
  "%@ điểm phần trăm": ["%@ percentage points", "%@ 个百分点"],
  "Cache read / (Input + Cache read + Cache write); không gồm Output.": ["Cache read / (Input + Cache read + Cache write); excludes Output.", "缓存读取 /（输入 + 缓存读取 + 缓存写入）；不含输出。"],
  "Không áp dụng": ["Not applicable", "不适用"],
  "Chưa đủ dữ liệu giá hoặc dữ liệu đã cũ.": ["Pricing is incomplete or data is stale.", "价格不完整或数据已过期。"],
  "Chưa có khoảng so sánh hợp lệ.": ["A valid comparison range is unavailable.", "暂无有效的比较时间段。"],
  "Tệp xuất chỉ gồm khoảng đã chọn, không gồm kỳ so sánh.": ["Exports include only the selected period, not the comparison period.", "导出仅包含所选时间段，不包含比较时间段。"],
  "Theo công cụ": ["By provider", "按工具"],
  "Theo model": ["By model", "按模型"],
  "Hiện tại %@ · Trước %@": ["Current %@ · Previous %@", "当前 %@ · 上期 %@"],

  "Chi tiết sử dụng": ["Usage details", "用量详情"],
  "Lịch sử": ["History", "历史"],
  "Công cụ": ["Provider", "工具"],
  "Tất cả": ["All", "全部"],
  "Codex và Claude Code": ["Codex and Claude Code", "Codex 和 Claude Code"],
  "Toàn phiên · %@": ["Entire session · %@", "整个会话 · %@"],
  "Tất cả phiên · %@ · %@": ["All sessions · %@ · %@", "所有会话 · %@ · %@"],
  "7 ngày · Tất cả phiên · %@": ["7 days · All sessions · %@", "7 天 · 所有会话 · %@"],
  "Chưa có dữ liệu cho %@": ["No data for %@ yet", "暂无 %@ 数据"],
  "Chưa có phiên cho công cụ này.": ["No sessions for this provider yet.", "此工具暂无会话。"],
  "Chưa có tổng theo công cụ cho khoảng thời gian này.": ["Provider totals are unavailable for this period.", "此时间段暂无各工具的总计。"],
  "Chạy một phiên của công cụ đã chọn trên máy rồi cập nhật lại. Panel đọc log đã cấu hình.": ["Run a session with the selected provider on this computer, then refresh. The panel reads configured logs.", "在本机使用所选工具运行会话后刷新。面板读取已配置的日志。"],
  "Ngày thiếu giá: cột gạch chéo, không phải chi phí bằng 0.": ["Unpriced days: hatched bars, not zero cost.", "缺少价格的日期：斜线柱并不表示费用为零。"],
  "Model": ["Model", "模型"],
  "%@ phiên": [
    "%@ sessions",
    "%@ 个会话"
  ],
  "Biểu đồ chi phí API quy đổi 7 ngày qua": [
    "API-equivalent cost chart for the last 7 days",
    "过去 7 天 API 等值费用图表"
  ],
  "Bỏ ghim hoặc chọn phiên khác để tiếp tục theo dõi.": [
    "Unpin or choose another session to continue.",
    "取消固定或选择其他会话以继续跟踪。"
  ],
  "Bỏ ghim phiên": [
    "Unpin session",
    "取消固定会话"
  ],
  "Bỏ ghim và theo phiên gần nhất": [
    "Unpin and follow latest session",
    "取消固定并跟踪最近会话"
  ],
  "Cache": [
    "Cache",
    "缓存"
  ],
  "Chi phí": [
    "Cost",
    "费用"
  ],
  "Chi phí 7 ngày qua": [
    "Costs over the last 7 days",
    "过去 7 天费用"
  ],
  "Chi phí API quy đổi": [
    "API-equivalent cost",
    "API 等值费用"
  ],
  "Chi phí API quy đổi hôm nay": [
    "API-equivalent cost today",
    "今天 API 等值费用"
  ],
  "Chi phí API quy đổi tháng này": [
    "API-equivalent cost this month",
    "本月 API 等值费用"
  ],
  "Chi phí theo model": [
    "Costs by model",
    "各模型费用"
  ],
  "Chưa có dữ liệu Codex": [
    "No Codex data yet",
    "暂无 Codex 数据"
  ],
  "Chưa có usage trong khoảng thời gian này.": [
    "No usage in this period.",
    "此时间段暂无用量。"
  ],
  "Chưa cập nhật": [
    "Not updated",
    "尚未更新"
  ],
  "Chưa kết nối dữ liệu": [
    "No data connection",
    "尚未连接数据"
  ],
  "Chưa xác định": [
    "Unknown",
    "未知"
  ],
  "Chưa đầy đủ": [
    "Incomplete",
    "不完整"
  ],
  "Chạy một phiên Codex trên máy rồi cập nhật lại. Panel đọc các log còn lưu trong thư mục Codex.": [
    "Run a Codex session on this computer, then refresh. The panel reads logs stored in your Codex folder.",
    "在本机运行一个 Codex 会话，然后刷新。面板读取 Codex 文件夹中保存的日志。"
  ],
  "Chọn phiên": [
    "Choose session",
    "选择会话"
  ],
  "Cập nhật thống kê": [
    "Refresh usage",
    "刷新用量"
  ],
  "Dùng bảng giá cache": [
    "Cached pricing",
    "缓存价格"
  ],
  "Dữ liệu ccusage không tương thích. Hãy cập nhật plugin.": [
    "Incompatible ccusage data. Update the plugin.",
    "ccusage 数据不兼容。请更新插件。"
  ],
  "Ghim phiên": [
    "Pin session",
    "固定会话"
  ],
  "Giá theo ccusage": [
    "Pricing from ccusage",
    "价格来自 ccusage"
  ],
  "Host chưa kết nối được panel. Hãy cập nhật Desktop và mở lại plugin.": [
    "The host could not connect the panel. Update Desktop and reopen the plugin.",
    "宿主平台无法连接面板。请更新 Desktop 并重新打开插件。"
  ],
  "Hôm nay": [
    "Today",
    "今天"
  ],
  "Input": [
    "Input",
    "输入"
  ],
  "Khoảng thống kê": [
    "Usage period",
    "统计时间段"
  ],
  "Không cập nhật được thống kê. Kiểm tra kết nối plugin rồi thử lại.": [
    "Could not refresh usage. Check the plugin connection and try again.",
    "无法刷新用量。请检查插件连接并重试。"
  ],
  "Không cập nhật được thống kê. Kiểm tra quyền đọc log, kết nối và thử lại.": [
    "Could not refresh usage. Check log permissions and connectivity, then try again.",
    "无法刷新用量。请检查日志权限和连接，然后重试。"
  ],
  "Không khởi tạo được panel. Hãy mở lại plugin.": [
    "Could not initialize the panel. Reopen the plugin.",
    "无法初始化面板。请重新打开插件。"
  ],
  "Không tìm thấy bộ đọc ccusage. Hãy cài lại gói runtime đúng phiên bản.": [
    "The ccusage reader is missing. Reinstall the matching runtime package.",
    "找不到 ccusage 读取器。请重新安装匹配版本的运行时包。"
  ],
  "Không tìm thấy phiên.": [
    "No sessions found.",
    "未找到会话。"
  ],
  "Không đọc được báo cáo ccusage. Kiểm tra quyền đọc thư mục Codex và thử lại.": [
    "Could not read the ccusage report. Check Codex folder permissions and try again.",
    "无法读取 ccusage 报告。请检查 Codex 文件夹的读取权限并重试。"
  ],
  "Log trên máy · %@": [
    "Local logs · %@",
    "本地日志 · %@"
  ],
  "Một panel khác đang cập nhật dữ liệu.": [
    "Another panel is updating the data.",
    "其他面板正在更新数据。"
  ],
  "Một panel khác đang cập nhật. Vui lòng thử lại sau.": [
    "Another panel is updating. Try again later.",
    "其他面板正在更新。请稍后重试。"
  ],
  "Mở No Short Usage từ plugin no-short trong Codex Desktop để đọc thống kê.": [
    "Open No Short Usage from the no-short plugin in Codex Desktop to read usage.",
    "请从 Codex Desktop 的 no-short 插件打开 No Short Usage 以读取用量。"
  ],
  "Nguồn: ccusage · Dữ liệu cục bộ": [
    "Source: ccusage · Local data",
    "来源：ccusage · 本地数据"
  ],
  "Ngôn ngữ": [
    "Language",
    "语言"
  ],
  "Output": [
    "Output",
    "输出"
  ],
  "Phiên": [
    "Session",
    "会话"
  ],
  "Phiên không còn dữ liệu": [
    "Session data no longer available",
    "会话数据已不可用"
  ],
  "Phiên đã ghim không còn dữ liệu.": [
    "Pinned session data no longer available.",
    "固定会话的数据已不可用。"
  ],
  "Còn model chưa định giá": [
    "Some models are unpriced",
    "部分模型尚无价格"
  ],
  "Plugin chưa có quyền đọc log hoặc ghi cache. Kiểm tra quyền thư mục và thử lại.": [
    "The plugin cannot read logs or write cache. Check folder permissions and try again.",
    "插件无权读取日志或写入缓存。请检查文件夹权限并重试。"
  ],
  "Theo phiên gần nhất · Không xác định tab đang mở": [
    "Following latest session · Cannot detect the open tab",
    "跟踪最近会话 · 无法识别当前标签页"
  ],
  "Tháng này": [
    "This month",
    "本月"
  ],
  "Token sử dụng": [
    "Token usage",
    "Token 用量"
  ],
  "Token đầu ra, đã gồm reasoning": [
    "Output tokens, including reasoning",
    "输出 token，包含推理"
  ],
  "Token đầu vào chưa cache": [
    "Uncached input tokens",
    "未缓存的输入 token"
  ],
  "Token đầu vào đọc từ cache": [
    "Input tokens read from cache",
    "从缓存读取的输入 token"
  ],
  "Tác vụ con · ": [
    "Subagent · ",
    "子任务 · "
  ],
  "Tên hoặc ID phiên…": [
    "Session name or ID…",
    "会话名称或 ID…"
  ],
  "Tìm phiên": [
    "Search sessions",
    "搜索会话"
  ],
  "Tổng": [
    "Total",
    "总计"
  ],
  "Tự theo phiên gần nhất": [
    "Follow latest session",
    "跟踪最近会话"
  ],
  "Xem trước local · Chưa phải panel trong Codex": [
    "Local preview · Not the panel inside Codex",
    "本地预览 · 尚非 Codex 内的面板"
  ],
  "Đang tải thống kê": [
    "Loading usage",
    "正在加载用量"
  ],
  "Đang đọc log trên máy…": [
    "Reading local logs…",
    "正在读取本地日志…"
  ],
  "Đã cập nhật": [
    "Updated",
    "已更新"
  ],
  "Đã ghim phiên · Không tự chuyển": [
    "Pinned session · Automatic switching off",
    "已固定会话 · 不自动切换"
  ],
  "Đọc log quá lâu. Thử lại hoặc giảm số thư mục log.": [
    "Reading logs timed out. Try again or reduce the number of log folders.",
    "读取日志超时。请重试或减少日志文件夹数量。"
  ],
  "Phân tích hôm nay %@ và tháng %@, độc lập khoảng lịch sử đã chọn.": ["Analyzes today %@ and month %@, independently of the selected history range.", "分析今天 %@ 及月份 %@，独立于所选历史范围。"],

  "Bật cảnh báo mức dùng bất thường": ["Enable unusual usage warnings", "启用异常用量警告"],
  "Bật kịch bản chi phí cuối tháng": ["Enable month-end cost scenario", "启用月末费用情景"],
  "Bất thường và kịch bản tháng": ["Unusual usage and month scenario", "异常用量与月度情景"],
  "Mức dùng bất thường": ["Unusual usage", "异常用量"],
  "Kịch bản chi phí API cuối tháng": ["Month-end API cost scenario", "月末 API 费用情景"],
  "Dữ liệu cũ hoặc lỗi; cần làm mới.": ["Data is stale or failed; refresh required.", "数据已过期或出错；请刷新。"],
  "Lịch sử chưa khả dụng cho công cụ này.": ["History is unavailable for this provider.", "此工具暂无历史数据。"],
  "Cần 7 ngày có quan sát trong 30 ngày trước hôm nay.": ["Requires 7 observed days within the 30 days before today.", "需要今天之前 30 天内的 7 个观测日。"],
  "Trung vị bằng 0; chưa đủ cơ sở xác định bất thường.": ["Median is zero; insufficient baseline for an anomaly.", "中位数为零；不足以判断异常。"],
  "Chưa có ngày hiện tại được quan sát; không coi là $0.": ["Today has not been observed; it is not treated as $0.", "今天暂无观测记录；不视为零费用。"],
  "Thiếu cơ sở giá đầy đủ; không suy ra từ phần đã biết.": ["Incomplete pricing basis; no conclusion from the known subtotal.", "定价依据不完整；不能从已知小计推断。"],
  "Chi phí vượt giới hạn tính toán; chưa đủ căn cứ.": ["Cost exceeds calculation limits; insufficient basis.", "费用超出计算范围；依据不足。"],
  "Chi phí hôm nay vượt ngưỡng bất thường.": ["Today's cost exceeds the anomaly threshold.", "今天的费用超过异常阈值。"],
  "Chi phí hôm nay chưa vượt ngưỡng bất thường.": ["Today's cost has not exceeded the anomaly threshold.", "今天的费用未超过异常阈值。"],
  "Mẫu %@/7 ngày quan sát: %@ → %@": ["Sample %@/7 observed days: %@ → %@", "样本 %@/7 个观测日：%@ → %@"],
  "Trong 30 ngày trước hôm nay từ %@; %@ ngày quan sát thiếu giá.": ["Within 30 days before today from %@; %@ observed days lack complete pricing.", "今天之前 30 天内，自 %@ 起；%@ 个观测日缺少完整价格。"],
  "Ngưỡng: 2 × %@ = %@; hôm nay %@.": ["Threshold: 2 × %@ = %@; today %@.", "阈值：2 × %@ = %@；今天 %@。"],
  "Đã ghi nhận %@ + trung bình %@/ngày × %@ ngày sau hôm nay.": ["Recorded %@ + mean %@/day × %@ days after today.", "已记录 %@ + 日均 %@ × 今天之后的 %@ 天。"],
  "Giả định usage mỗi ngày tới giống 7 ngày quan sát. Đây là kịch bản, không phải dự đoán hóa đơn.": ["Assumes future daily usage resembles the 7 observed days. This is a scenario, not a billing prediction.", "假设未来日用量与这 7 个观测日相似。这是情景，并非账单预测。"],
  "Dùng 7 ngày quan sát gần nhất; nếu một ngày thiếu giá thì chưa đủ căn cứ. Không chèn ngày trống thành $0.": ["Uses the latest 7 observed days; any incomplete price makes the baseline insufficient. Missing days are not inserted as $0.", "使用最近 7 个观测日；任一天价格不完整即依据不足。不将缺失日期补为零费用。"],
  "Phiên bản cơ sở giá: %@": ["Pricing basis revision: %@", "定价依据版本：%@"],
  "Nguồn chưa cung cấp cơ sở giá chi tiết.": ["The source has not provided detailed price provenance.", "来源未提供详细的定价依据。"],
  "Tệp xuất chỉ gồm khoảng đã chọn, không gồm kịch bản.": ["Exports contain the selected range only, excluding scenarios.", "导出仅包含所选范围，不含情景。"],
  "Bật thông báo bất thường macOS (tùy chọn)": ["Enable macOS anomaly notifications (optional)", "启用 macOS 异常通知（可选）"],
  "Công cụ cho cảnh báo bất thường": ["Provider for anomaly notifications", "异常通知的工具"],
  "Thông báo bất thường chưa được cho phép. Cảnh báo trong app vẫn hoạt động.": ["Anomaly notifications are not allowed. In-app warnings still work.", "异常通知未获授权。应用内警告仍然有效。"],
  "Không gửi được thông báo bất thường. Cảnh báo trong app vẫn hoạt động.": ["Could not send anomaly notification. In-app warnings still work.", "无法发送异常通知。应用内警告仍然有效。"],
  "Cảnh báo mức dùng bất thường · %@": ["Unusual usage warning · %@", "异常用量警告 · %@"],

  "Ước tính": [
    "Estimated",
    "估算值"
  ],
  "Ước tính — không phải hóa đơn hoặc credit ChatGPT đã trừ": [
    "Estimates — not a bill or deducted ChatGPT credits",
    "估算值 — 并非账单或已扣除的 ChatGPT 积分"
  ]
};
