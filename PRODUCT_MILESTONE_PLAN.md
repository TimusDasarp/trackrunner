# TrackRunner Product Milestone Plan

**Purpose:** a durable product and engineering roadmap for continuing TrackRunner as a sellable, multi-tenant field-operations platform.

**Product promise:** give dispatch teams a trustworthy live view of field work, identify exceptions early, and improve task throughput without manual follow-up.

**Last updated:** 2026-08-14

## Current product baseline

TrackRunner currently supports:

- Organization-scoped dispatcher and runner accounts.
- Runner assignment to a dispatcher, with safe archive and restore.
- Expo runner app with background location tracking, offline location queue, Socket.IO updates, and task status updates.
- Dispatcher dashboard with Google Maps, live runner state, runner history, task assignment, task edit before acknowledgement, completed-task deletion, task filtering, and a responsive shared navigation shell.
- Task statuses: `sent`, `acknowledged`, `in_progress`, `completed`, and `unable_to_complete`.
- PostgreSQL durable location history and task records; Redis live runner state; Socket.IO realtime fan-out; FCM task notifications.

## Product principles

1. **Mobile first.** Runner and dispatcher workflows must work on narrow screens before being enhanced for desktop.
2. **Action over observation.** The product should identify operational exceptions, not require dispatchers to continually watch a map.
3. **Fair and explainable metrics.** Compare runners only within comparable work types, distances, zones, and time windows. Prefer medians to averages where outliers are common.
4. **Privacy by design.** Collect location only for active work, make tracking visible, retain raw data for a defined limited period, and preserve auditability.
5. **Safe lifecycle changes.** Archive business entities instead of deleting operational history.
6. **React Paper UI.** Use Material/React Paper components for new shared UI primitives, dialogs, tabs, snackbars, and form controls.

## Milestone overview

| Milestone | Goal | Status | Depends on |
|---|---|---:|---|
| M0 | Production foundation and controlled pilot | In progress | Existing readiness plan |
| M1 | Operations dashboard | Planned | M0 |
| M2 | Analytics MVP | Planned | M1 data model prerequisites |
| M3 | Task SLAs and exception management | Planned | M2/M1 |
| M4 | Runner shifts and task event history | Planned | M3 data model |
| M5 | Enterprise administration and integrations | Planned | M0-M4 |
| M6 | Scale, reliability, and commercial readiness | Planned | M0-M5 |

---

## M0 — Production foundation and controlled pilot

### Objective

Make the system safe and supportable for a small, controlled customer pilot before expanding workflow or analytics features.

### Required work

- Enforce production secrets, HTTPS/WSS, correct CORS, and secure environment-variable management.
- Replace long-lived dashboard `localStorage` tokens with a deliberately designed secure session strategy.
- Implement password reset/invite flow; remove demo credentials and seed data from production.
- Establish versioned migrations, managed PostgreSQL backups/PITR, and a documented restore drill.
- Add production observability: structured logs, error tracking, uptime/readiness checks, database/Redis health, Socket.IO connection count, location ingestion latency, and task-push failures.
- Add rate limits for login and location ingestion, plus timestamp, speed, and batch-size validation.
- Define data retention, runner notice/consent, privacy policy, task/location access rules, and incident response.
- Add CI quality gates: format/lint, typecheck, unit tests, API integration tests, Socket.IO contract tests, and dashboard E2E tests.
- Verify real iOS and Android devices for background tracking, offline recovery, push notifications, and logout/assignment revocation.

### Acceptance criteria

- Production deploy fails safely when critical secrets/configuration are absent.
- Backup restore drill meets agreed RPO/RTO.
- A runner outside their assignment/organization cannot expose a location, task, or history record.
- Offline location events are persisted exactly once in effect after reconnect.
- Defined monitoring alerts reach an operator during an API, database, Redis, or push-delivery failure.

---

## M1 — Operations dashboard

### Objective

Make the dashboard a dispatcher’s daily command centre rather than a passive map.

### Features

- Operational summary cards: active runners, awaiting acknowledgement, in-progress, overdue, completed today, and exceptions today.
- Exception inbox with actionable states:
  - location stale during active task;
  - no movement for configured duration;
  - low battery;
  - task acknowledgement SLA breached;
  - task due-time SLA breached;
  - unable-to-complete task.
- Map filters: runner status, task status, team/region, battery level, and assigned dispatcher.
- Task capabilities: priority, due time, task type, customer notes, reassignment before acknowledgement, bulk assignment, and task timeline.
- Runner drill-down: current task, last location age, battery, current status, exception history, and recent task outcomes.

### Data additions

```text
runner_tasks
- priority: low | normal | high | urgent
- due_at
- task_type
- estimated_duration_minutes
- destination_geofence_radius_m
- arrived_at
- cancelled_at
- cancellation_reason
- completion_notes
- proof_of_completion_url
- version
```

### Acceptance criteria

- A dispatcher can identify all exception tasks without manually scanning runner cards.
- A task can be created with priority and due time, then becomes visibly overdue when SLA is missed.
- Mobile and desktop layouts expose the same operational state without horizontal overflow.

---

## M2 — Analytics MVP

### Objective

Give business owners credible, filterable evidence of task throughput, response speed, and reliability.

### Route and navigation

- Add an **Analytics** route to the shared app shell.
- Use React Paper date controls, tabs, cards, tables, tooltips, and accessible charts.
- Mobile layout: summary cards first, then one chart per row, then drill-down tables.

### Filters

- Date range: today, yesterday, last 7 days, last 30 days, custom.
- Runner (using display name).
- Dispatcher/team/region when those dimensions exist.
- Task type, priority, and status.

### Core KPI definitions

| KPI | Definition |
|---|---|
| Tasks assigned | Tasks created during the selected period. |
| Tasks completed | Tasks with `completed_at` in the selected period. |
| Completion rate | Completed tasks divided by assigned tasks, excluding cancelled tasks. |
| Unable-to-complete rate | Unable-to-complete tasks divided by assigned tasks. |
| Median acknowledgement time | Median of `acknowledged_at - created_at`. |
| Median task cycle time | Median of `completed_at - created_at`. |
| Median active work time | Median of `completed_at - started_at`. |
| SLA compliance | Eligible tasks completed on/before `due_at`, divided by eligible completed tasks. |
| Overdue backlog | Active tasks whose due time has passed. |

### MVP views

1. KPI cards for the selected period.
2. Completed tasks by runner — bar chart, showing task count and completion rate.
3. Median acknowledgement time by runner — bar chart, showing task count alongside the value.
4. Median completion time by runner — bar chart with organization median reference.
5. Daily task-status trend — stacked completed / unable-to-complete / overdue series.
6. Runner drill-down table — runner, assigned, completed, completion rate, median acknowledgement, median completion, unable-to-complete rate.
7. CSV export of filtered aggregate and task-level data.

### Implementation approach

1. Add an analytics REST API with authorization scoped to organization and dispatcher assignment.
2. Begin with indexed SQL aggregates for small pilot data volumes.
3. Add daily aggregate table and scheduled recomputation before performance becomes a concern:

```text
runner_daily_metrics
- organization_id
- runner_id
- metric_date
- assigned_tasks
- completed_tasks
- unable_to_complete_tasks
- median_ack_seconds
- median_cycle_seconds
- median_active_work_seconds
- overdue_tasks
- route_distance_meters
- active_task_seconds
- low_battery_events
```

4. Ensure every chart response includes the filter range, task count, and an explicit timezone.
5. Do not rank runners without exposing task count, work type, and distance/zone context.

### Acceptance criteria

- Results match a manually verified task fixture for all KPI formulas.
- An unauthorized dispatcher cannot aggregate another dispatcher’s runners.
- A 30-day organization report is returned within the agreed performance target.
- CSV export equals the screen’s selected filters and timezone.

---

## M3 — Task SLAs and exception management

### Objective

Convert task timing metrics into proactive operational action.

### Features

- Configurable organization defaults for acknowledgement and completion SLAs.
- Priority-specific SLA policy.
- Clear due/overdue status in all task cards and runner detail views.
- Exception inbox with ownership, notes, resolve/dismiss reason, and escalation level.
- Notifications for acknowledgement breach, due-time breach, stale location, and low battery.
- Reassign flow before acknowledgement; recorded reassignment event thereafter.
- Dispatcher notification preferences and quiet hours.

### Data additions

```text
task_sla_policies
- organization_id
- task_type
- priority
- acknowledgement_target_seconds
- completion_target_seconds
- active

task_exceptions
- task_id
- runner_id
- exception_type
- opened_at
- resolved_at
- resolved_by
- resolution_note
- severity
```

### Acceptance criteria

- A task becomes overdue deterministically from the configured policy/due time.
- One exception is opened per unresolved condition; repeated polling/events do not duplicate it.
- Alert delivery and dispatcher acknowledgement are auditable.

---

## M4 — Runner shifts and task event history

### Objective

Provide accurate utilisation metrics, transparent operational records, and a runner workday model.

### Features

- Runner mobile shift start/end with optional break states.
- Dispatcher shift view: scheduled, active, on break, ended, missing checkout.
- Task timeline visible to dispatcher and runner.
- Arrival/geofence event support where the business model requires it.
- Reason codes for unable-to-complete and cancellation.
- Proof-of-completion upload and document checklist completion.

### Data additions

```text
runner_shifts
- id
- organization_id
- runner_id
- planned_start_at
- planned_end_at
- started_at
- ended_at
- status
- source

task_events
- id
- organization_id
- task_id
- actor_id
- event_type
- occurred_at
- metadata JSONB
```

### Important events

- created, edited, assigned, reassigned, acknowledged, started, arrived, completed, unable_to_complete, cancelled, archived, restored.

### Metrics unlocked

- Active-task utilisation: active task seconds divided by shift seconds.
- Time to first task.
- Tasks per active shift hour.
- Break compliance where applicable.
- Distance per completed task and idle travel, once route calculations are introduced.

### Acceptance criteria

- A task’s event history is immutable and ordered.
- Shift/task metrics can be reproduced from event data.
- A runner can complete essential shift/task actions offline and sync safely afterward.

---

## M5 — Enterprise administration and integrations

### Objective

Make TrackRunner deployable across larger organizations and into existing workflows.

### Features

- Roles: organization admin, operations manager, dispatcher, supervisor, runner, read-only analyst.
- Teams, hubs, zones, and supervisor-to-runner relationships.
- Invite flow, password reset, account disable, and optional SSO/MFA for privileged users.
- Customer/task CSV import and validation report.
- Webhooks and documented API for task creation/status updates.
- Audit log for runner management, task edits/deletions, configuration changes, and exports.
- Configurable retention policy and legal-export/delete workflows.
- Branded reports and scheduled email exports.

### Acceptance criteria

- Every privileged change is audit logged with actor, timestamp, entity, and before/after state where appropriate.
- Role and tenant tests cover every REST and Socket.IO operation.
- Import failures are reported without partially creating invalid business records.

---

## M6 — Scale, reliability, and commercial readiness

### Objective

Operate predictable, secure service at increasing fleet size and support a paid offering.

### Engineering work

- Socket.IO Redis adapter / message broker for multi-instance realtime fan-out.
- Redis presence leases/TTLs; handle multiple runner connections without false offline status.
- Bounded ingestion batching and adaptive mobile sampling.
- Database partitioning/retention/downsampling strategy for high-volume location events.
- Backpressure, queue-depth protection, and retry budgets.
- Load tests for concurrent runners, reconnect storms, dashboard fan-out, and analytics queries.
- SLOs: API availability, event acceptance latency, map update latency, notification delay, and analytics response time.
- Incident runbooks, on-call rotation, support tooling, and release rollback process.
- Billing/usage metering: active runners, dispatchers, tasks, storage, API/webhook consumption.

### Capacity guardrail

At a 5-second interval, 1,000 continuously active runners produce roughly 200 location events/second and 17.28 million per day. Use adaptive sampling, retention, and aggregate tables before operating at fleet scale.

---

## Recommended immediate build order

1. Complete M0 release blockers required for a controlled pilot.
2. Add M1 task priority, due time, and overdue presentation.
3. Add M2 Analytics MVP route using existing task timestamps.
4. Add M3 SLA policies and exception inbox.
5. Add M4 shifts and immutable task events; then expand the analytics set with utilisation and route-efficiency metrics.

## Definition of done for each milestone

- Product behavior is written as acceptance criteria and tested.
- Desktop and mobile layouts are verified; no horizontal overflow at narrow phone width.
- Role, tenant, and assignment authorization is covered for new endpoints/events.
- Error, empty, loading, and offline states are designed.
- Audit/analytics data has an explicit timezone and retention policy.
- Production monitoring and rollback impact are recorded.
- User-facing copy for sensitive location/tracking behavior is reviewed.
