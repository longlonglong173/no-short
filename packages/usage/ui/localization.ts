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
  "Chỉ thống kê log còn trên máy; không phải toàn bộ lịch sử tài khoản.": ["Only retained local logs are counted, not the full account history.", "仅统计本机保留的日志，而非完整账户历史。"],
  "Phần đã biết: $%@ · Giá chưa đầy đủ, không phải $0.": ["Known subtotal: $%@ · Pricing is incomplete, not zero.", "已知小计：$%@ · 价格不完整，并非零费用。"],
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
  "Phần đã có giá: $%@ · Còn model chưa định giá": [
    "Known-priced portion: $%@ · Some models are unpriced",
    "已知价格部分：$%@ · 部分模型尚无价格"
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
  "Ước tính": [
    "Estimated",
    "估算值"
  ],
  "Ước tính — không phải hóa đơn hoặc credit ChatGPT đã trừ": [
    "Estimates — not a bill or deducted ChatGPT credits",
    "估算值 — 并非账单或已扣除的 ChatGPT 积分"
  ]
};
