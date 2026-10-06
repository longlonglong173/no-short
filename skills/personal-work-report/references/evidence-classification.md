# Evidence classification

Read this file after collection and before writing the report.

## Core rule

Extract evidence, state its confidence, and let the report reflect uncertainty. Never upgrade an item’s status to make the report sound stronger.

## Primary status

Assign one primary status to each deduplicated work item.

### Completed

Use `Completed` only when the reporting period contains explicit completion evidence, such as:

- A Jira transition into a configured completed state.
- A GitHub PR merged during the period.
- A verified release or deployment tied to the item.
- A Slack message or thread that explicitly says the work was completed, delivered, merged, or deployed.
- Equivalent source evidence with a final result.

Current state alone may be insufficient. For example, a Jira issue that is Done now does not prove it completed during this period unless the transition date is available.

### In progress or waiting

Use `In progress or waiting` when evidence shows active or unfinished work:

- Jira status is active, in review, blocked, or waiting.
- A PR is open, draft, failing CI, or waiting for review.
- Slack says the work is being implemented, tested, investigated, reviewed, or held for a response.
- A commit exists without evidence of merge, release, or another final result.

### Needs confirmation

Use `Needs confirmation` when evidence is relevant but cannot support a reliable status. Include the source and state exactly what is missing.

Examples:

- A PR was closed without evidence that the change shipped.
- A Slack message says “handled” but lacks enough context to identify the artifact or result.
- Similar Jira and Slack text suggests a relationship but no issue key or link connects them.

## Blockers

A blocker is an additional view of an existing work item, not a new item for counting.

Include it only when a source records an unresolved error, dependency, risk, help request, or wait state. State the impact and what or whom the item is waiting for only when the evidence names them.

Do not infer a blocker from elapsed time, missing updates, or a failed query.

## Next plans

Include a next plan only when evidence shows one of these:

- The user committed to or scheduled it.
- It was assigned to the user.
- A source identifies it as the next step.
- It is unfinished current work that clearly continues into the next period.

Do not turn every open Jira issue, backlog item, review request, or prior-period plan into current planned work.

## Cross-source linking

Use this confidence order:

1. Exact Jira key in a PR title, branch, commit, or Slack message.
2. Direct source URL or artifact identifier.
3. Explicit statement that one artifact implements, fixes, reviews, deploys, or blocks another.

Do not link by topic similarity alone. Keep uncertain artifacts separate and label them `Needs confirmation`.

## Deduplication

- One PR and its commits form one work item.
- A Jira issue and its explicitly linked PR, review, and Slack update form one work item.
- A blocker or next-plan mention of an existing item does not create another counted item.
- Independent commits without a PR may be grouped only when their repository, branch, purpose, and evidence clearly identify one unit of work.

## Reverts and corrections

Do not discard a revert because it happened on the same day. If it removed or changed a claimed result, report the final verified state. Small typo or mechanical changes may be omitted only when they have no meaningful outcome for the report.

## Previous reports

Use a previous report only to compare a prior promise or plan with current-period evidence. Do not carry its status forward. If the current period does not confirm progress, say so or use `Needs confirmation`.

## Wording safeguards

- Preserve ticket names, PR numbers, repository names, statuses, and source links.
- Do not invent percentages, owners, causes, priority, impact, or completion.
- Do not use a reaction as status evidence.
- Prefer the source action or result over vague praise.
- If evidence conflicts, describe the conflict and use the most conservative supported status.
