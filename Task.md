# Tasks workspace

The Tasks workspace is the dispatcher’s operational home: a single place to
find work, understand what needs attention, and inspect a task without losing
the surrounding queue.

## Product principles

- Help a dispatcher answer “what needs attention now?” in seconds.
- Keep task context visible while the dispatcher reviews details.
- Make filters, task health, and analytics work together.
- Prefer clear, reversible actions over hidden automation.

## Layout

On desktop, the page uses a 60/40 split:

- **60% — Task workspace:** search, filters, saved views, and a scan-friendly
  task list. Selecting a task opens a detail drawer.
- **40% — Analytics:** the existing seven-day task analytics, presented as a
  contextual operational panel.

On smaller screens, the task workspace remains first and analytics moves below
it so neither area becomes too narrow to use.

## Implementation phases

### Phase 0 — Foundation and navigation

**Status: implemented.**

- Add a dedicated `/tasks` route and replace the Analytics navigation item
  with Tasks.
- Define one frontend task model that represents the existing task API.
- Reuse the existing runner and analytics endpoints.
- Include loading, empty, and error states, plus a responsive layout.

**Complete when:** a dispatcher can reach Tasks from navigation and see real
task and analytics data in a reliable responsive layout.

### Phase 1 — Task workspace and triage

**Status: implemented.**

- Search by customer, address, phone number, task ID, runner, or required
  document.
- Filter by task status, priority, runner, and date context.
- Provide quick operational views: Needs attention, Today, Unassigned,
  At risk, and Completed.
- Show task cards with priority, status, runner, due time, document count, and
  an understandable task-health signal.
- Make Analytics cards apply the relevant task filter.

**Complete when:** a dispatcher can find and prioritise their work without
opening every task.

### Phase 2 — Task detail drawer

**Status: implemented.**

- Open selected tasks in a drawer instead of leaving the task list.
- Show customer, contact, location, runner, schedule, notes, documents, and
  task status timeline.
- Fetch and show uploaded task attachments, with secure download links.
- Keep selected task state in the URL so a page refresh preserves context.

**Complete when:** a dispatcher can inspect a task and its uploaded files while
retaining the surrounding queue.

### Phase 3 — Assignment and rescheduling

**Status: implemented.**

- Add assign/reassign controls with runner workload and availability.
- Add a reschedule workflow with reason, conflict warnings, and an audit event.
- Preserve idempotent retry behaviour for assignment and file upload requests.

### Phase 4 — Attention and SLA intelligence

**Status: implemented with the live signals currently available.**

- Rank overdue, unassigned, stale, and document-blocked tasks.
- Surface SLA warnings in cards, saved views, and analytics drill-downs.

### Phase 5 — Board and map views

**Status: board implemented; map view deferred.**

- Add a status board with shared filters. A geographic map view can be added
  later if dispatch operations need it.
- Introduce controlled drag-and-drop only after explicit status actions are
  dependable.

### Phase 6 — Quality and rollout

**Status: implemented for the current release.**

- Add role checks, accessibility support, test coverage, feature rollout, and
  dispatcher workflow metrics.
