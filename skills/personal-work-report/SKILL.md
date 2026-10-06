---
name: personal-work-report
description: Create evidence-based personal work reports from connected Jira, GitHub, or Slack activity. Use when the user asks in Vietnamese or English for a weekly, sprint, standup, monthly, or custom-period personal report. Do not use for team-wide reports or reports based only on unverified pasted content.
---

# Personal work report

Turn verified activity into a Markdown report that a manager can scan quickly.

Every conclusion must trace back to a specific Jira issue, GitHub PR, commit or review, or Slack message. Do not invent results, metrics, causes, owners, priorities, or impact that the source does not state.

## Define the scope

Query only the sources the user requests or enables in configuration. Do not require Jira, GitHub, and Slack for every report.

For each source in scope, use its integrated connector before writing the report:

- Jira: search issues and retrieve issue details, status history, comments, or changelog when needed.
- GitHub: retrieve PRs, reviews, commits, CI, and review status.
- Slack: search messages or read channel history and thread replies.

Tool names vary by host. Read [query guidance](references/queries.md) to select the available connector and construct bounded queries. Do not replace a working connector with browser automation, a CLI, or a direct API call.

User-provided text may supplement context but does not count as a successfully queried source. At least one in-scope source must succeed. If none succeeds, stop and list the connections needed instead of producing a report.

## Prepare

1. Determine the report type, inclusive date range, and user timezone.

   - Standup with no date: the current date.
   - “This week”: current Monday through today.
   - Weekly report with no period: the most recent completed Monday–Friday work week.
   - Monthly report with no period: the most recent completed calendar month.
   - Sprint report with no period: use the configured sprint or ask the user.

2. Read configuration in this order:

   - `.personal-work-report.yml` in the working directory.
   - `~/.no-short/personal-work-report/config.yml` in the user home directory.

   Working-directory values override user-level values field by field.

3. Resolve a separate identity for each service from a stable account ID, username, or email. If configuration is incomplete, use the connector’s current-user capability. Do not assume two accounts belong to the same person because their display names match.

4. Resolve the remaining scope: Jira projects, GitHub organizations and repositories, Slack workspace and channels, output language, and query limits.

5. If missing information would materially change the scope, ask all necessary questions once. Otherwise state the interpreted period and sources in a short progress update and continue without waiting for confirmation.

## Check connections

Test only the in-scope sources. Track one internal status for each:

- `connected`
- `not connected`
- `connected but query failed`
- `out of scope`

Retry once only for a transient timeout, rate limit, or server error. Do not retry authentication, permission, or invalid-query errors. Record the reason and continue with successful sources.

## Collect evidence

Read [query guidance](references/queries.md) before collecting data. Query independent sources in parallel when the host supports it. Preserve the source URL or identifier, timestamp, and original status for every artifact used.

Collect only activity within the reporting period and configured scope:

- Jira: assigned, created, updated, or commented issues; status transitions; blockers; dependencies; and explicit next work.
- GitHub: opened, updated, merged, closed, or draft PRs; reviews; independent commits; CI; review state; releases; and deployments when available.
- Slack: progress updates, decisions, results, blockers, dependencies, help requests, and explicit next work. Retrieve thread context when an isolated message is ambiguous.

An open Jira issue is not automatically a plan. A commit is not proof of completion. A Slack reaction is context, not completion evidence.

## Check coverage

Before synthesis:

- Read pages until the scoped result set is exhausted or a configured limit is reached.
- Record truncation, rate limits, permission gaps, and query failures.
- Check activity on both boundary dates in the chosen timezone.
- List every Jira project, GitHub repository, and Slack channel actually scanned.
- Do not treat an unexpected empty or failed response as proof that no activity occurred.
- Do not widen the scope to unrelated projects, repositories, or channels just to find more content.

## Link and classify evidence

Read [evidence classification](references/evidence-classification.md) before synthesis.

Link artifacts only through an explicit Jira key, URL, source identifier, or relationship stated by a source. Do not merge artifacts because their text merely seems related. Keep uncertain artifacts separate and label them `Needs confirmation` with a source link.

Multiple commits in one PR form one work item. Remove bots, greetings, context-free links, and purely mechanical merge, WIP, or typo activity that produced no meaningful result. Do not automatically remove reverts; retain a revert when it changes the verified outcome or status.

Assign each work item one primary status:

- `Completed`
- `In progress or waiting`
- `Needs confirmation`

Blockers and next plans are additional views, not new work items. Repeating an item in those sections must not increase activity counts.

A previous report may be used only to compare prior plans. A prior plan does not prove current progress without evidence from the current period.

## Write the report

Read [the report template](assets/report-template.md) before writing. Select one output language, then preserve the chosen headings, emoji, and section order.

Use the language explicitly requested by the user. Otherwise use the main language of the prompt, falling back to Vietnamese when the prompt is mixed or unclear.

For every work item:

- Describe the verified action or result.
- State business impact only when a source supports it.
- Preserve Jira keys, PR numbers, repository names, and meaningful status details.
- Include a source URL or identifier.
- Name the repository when more than one repository is in scope.

When four or more repositories contain activity, group completed items by repository. Count unique work items only after deduplication.

## Edit without changing evidence

Polish the final report for clarity, but do not change the verification result:

- Do not add results, metrics, causes, owners, or priorities.
- Do not turn waiting work into completed work.
- Do not use reactions as evidence.
- Remove unsupported praise such as “collaborated effectively,” “significantly improved,” or “made strong progress.”
- Replace vague claims with source-backed actions or results.
- Preserve statuses, ticket names, PR numbers, repositories, and source links.
- Preserve `Needs confirmation` whenever the evidence remains incomplete.

## Produce and save the report

Write a three-to-five-sentence summary that prioritizes unique item counts, verified progress, and any supported risk or coverage limitation. Include a highlight only when evidence supports one. If no risk was recorded, say that no risk was recorded within the scanned scope.

Use the template’s localized empty-state text for empty sections.

The **Data sources** line lists only in-scope sources queried successfully. If an in-scope source is missing, failed, or truncated, add the **Data coverage notes** section with the source, reason, affected scope, and likely report impact.

If no in-scope connector succeeds, do not create a report.

Use `output_dir` from configuration when present. Otherwise save to:

`~/.no-short/personal-work-report/<project-slug>/report-<A>_<B>.md`

Create directories as needed. Never overwrite an existing report; append `-v2`, `-v3`, and so on. Write an additional copy when configuration requests one. If saving fails, still display the report and explain why no file was written.

After saving, display the full report and state:

- The saved path.
- Period and timezone.
- Projects, repositories, and channels scanned.
- Successful, missing, failed, or truncated sources.
