# Query guidance

Read this file before querying Jira, GitHub, or Slack.

## Configuration

Support these fields when present. Omitted fields remain unset rather than receiving guessed values.

```yaml
timezone: Asia/Ho_Chi_Minh
language: vi
report_type: weekly
output_dir: ~/.no-short/personal-work-report
additional_output_dir: null

sources:
  jira:
    enabled: true
    account_id: null
    projects: []
  github:
    enabled: true
    username: null
    organizations: []
    repositories: []
  slack:
    enabled: true
    user_id: null
    workspace: null
    channels: []

limits:
  max_pages_per_query: 20
  max_items_per_source: 500
```

The working-directory config overrides user-level config field by field. An explicit user request overrides both configs for the current report.

## Choose connector tools

Select tools by capability, not by a hard-coded name. Hosts may expose different names for the same connector operation.

Required capabilities by source:

- Jira: search issues with JQL; retrieve one issue with fields, comments, and changelog when needed.
- GitHub: search or list PRs, reviews, commits, checks, and review state; retrieve details and URLs.
- Slack: search messages; read channel history; read thread replies; retrieve message permalinks when available.

If multiple integrated tools provide the same capability, prefer the official or already-authenticated connector. Do not use a browser, CLI, or direct API as a silent fallback.

## Time boundaries

Convert the inclusive local date range into source timestamps using the configured timezone. Query from the start of day A through the end of day B. Preserve original timestamps and normalize them only for comparison and output.

Check both boundary dates separately when a connector’s search semantics or timezone conversion could omit activity.

## Identity

Prefer stable service-specific identifiers:

1. Configured account ID or user ID.
2. Configured username or verified email.
3. Connector current-user result.

If more than one plausible identity remains, ask the user. Do not join identities across services by display name alone.

## Jira

Build bounded JQL using the resolved user, projects, and inclusive time range. Query relevant roles separately when one JQL expression would hide activity:

- Assignee during the period.
- Reporter or creator.
- User who updated or commented when supported.
- Status transition to a completed state during the period.

Retrieve issue details when a result may appear in the report or when status, comment, changelog, blocker, or date evidence is incomplete. For an issue key or URL supplied by the user, retrieve that issue directly through the Jira connector.

Do not equate current status with a transition during the reporting period. A ticket that is Done today may have completed before the period.

## GitHub

Query the resolved user within configured organizations and repositories. Collect:

- Authored PRs created, updated, merged, or closed in the period.
- Reviews submitted in the period.
- Commits not already represented by a PR.
- Open and draft PRs with current CI and review state.
- Releases or deployments tied to the user’s work when exposed by the connector.

Use PR URLs and repository-qualified identifiers. Avoid double-counting commits already contained in a reported PR.

## Slack

Search only configured channels and retrieve thread replies for candidate messages. Prefer messages authored by the resolved user, then include surrounding thread context needed to understand status, decisions, results, or blockers.

If search is unavailable, use bounded channel history for the same date range. Retrieve permalinks when the connector supports them. Do not treat emoji reactions as proof of status.

## Pagination and stopping conditions

Continue until one of these conditions is met:

- The connector reports no next page.
- Results have moved outside the date range.
- The configured page or item limit is reached.
- A rate limit or non-recoverable error prevents continuation.

When a limit or error stops collection early, mark that source as truncated and record the scanned portion. Never describe a truncated source as fully covered.

## Retry policy

Retry a read once for timeout, rate limit, or server failure. Respect a connector-provided retry delay when practical. Do not retry invalid queries, authentication errors, or permission failures without a state change.

Record source, operation, error category, and affected scope for the coverage note.
