# Report template

Use this template for standup, weekly, sprint, monthly, and custom-period reports. Select one language and do not mix languages within a report.

## Localized labels

| Key | English | Vietnamese |
| --- | --- | --- |
| title | Personal Work Report | Báo cáo công việc cá nhân |
| period | Period | Kỳ báo cáo |
| timezone | Timezone | Múi giờ |
| sources | Data sources | Nguồn dữ liệu |
| summary | 📌 Summary | 📌 Tóm tắt |
| completed | ✅ Completed | ✅ Hoàn thành |
| in_progress | 🚧 In progress or waiting | 🚧 Đang làm hoặc chờ xử lý |
| blockers | ⛔ Blockers | ⛔ Vướng mắc |
| next | 📅 Next plan | 📅 Kế hoạch tiếp theo |
| coverage | 🔎 Data coverage notes | 🔎 Ghi chú độ phủ dữ liệu |
| empty | _No items were recorded for this period._ | _Không có hạng mục nào trong kỳ này._ |
| needs_confirmation | Needs confirmation | Cần xác nhận |

The report title may be prefixed with `Standup`, `Weekly`, `Sprint`, `Monthly`, or a custom period label in the selected language.

## Structure

```markdown
# {{report type}} — {{title}}

**{{period label}}:** {{A}} → {{B}}

**{{timezone label}}:** {{timezone}}

**{{sources label}}:** {{successfully queried sources only}}

## {{summary heading}}

{{Three to five sentences with unique item counts, verified progress, supported risks, and coverage limitations. Do not force a highlight.}}

## {{completed heading}}

- **{{work item}}** — {{verified result}}. {{repository when needed}} ([source]({{url}}))

## {{in-progress heading}}

- **{{work item}}** — {{current verified state and what it is waiting for, if known}}. ([source]({{url}}))

## {{blockers heading}}

- **{{work item}}** — {{verified blocker and impact}}. {{waiting condition or owner only when sourced}}. ([source]({{url}}))

## {{next-plan heading}}

- **{{work item}}** — {{explicit next step or continuing work}}. ([source]({{url}}))

## {{coverage heading}}

- **{{source}}:** {{missing, failed, or truncated status}} — {{reason and affected scope}}.
```

## Rendering rules

- Keep every section in the order shown.
- Use the localized empty line when a section has no items.
- Omit the coverage section only when every in-scope source was queried successfully without truncation.
- Use a stable source identifier when a URL is unavailable.
- A repeated blocker or plan does not increase the summary count.
- Do not include the instructional placeholders in the final report.
