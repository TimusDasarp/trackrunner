# TrackRunner Production Readiness Plan

**Purpose:** turn the current real-time courier-tracking prototype into a secure, reliable, supportable production service.

**Assessment date:** 2026-08-06  
**Scope reviewed:** `backend/`, `dashboard/`, `react-native-app/`, legacy `android-app/`, Docker and EAS configuration. This document records code-level observations; it does not replace a penetration test, load test, legal review, or production infrastructure review.

## Executive summary

TrackRunner already has a useful end-to-end vertical slice:

- Couriers authenticate and can run background location tracking.
- Location updates flow through authenticated Socket.IO connections.
- Redis holds current runner state and PostgreSQL holds historical points.
- Dispatchers can sign in, see current locations on a Leaflet map, and request a runner trail.
- Both mobile implementations buffer locations locally when offline.

It is **not ready for real users or real courier locations yet**. The most important work is to establish a production security boundary, make delivery of location samples durable and idempotent, select one supported mobile client, and add automated verification and operational controls. Do not release publicly until all P0 items below are complete.

## Milestone progress tracker

Update this table as implementation proceeds. “Verified” means automated checks or an explicitly recorded manual test have passed; a code change alone is not enough.

| Milestone | Status | Evidence / next gate |
|---|---|---|
| 0. Product and architecture decisions | In progress | **Decision recorded:** Expo app is the supported iOS and Android courier client. Still select deployment regions, tenancy model, tracking/retention policy, and launch SLOs. |
| 1. Secure backend foundation | In progress | Implemented production config fail-fast, explicit CORS origin allowlist, baseline security headers, readiness probe, and graceful shutdown. Backend TypeScript build passes; rate controls, TLS deployment, and automated endpoint tests remain. |
| 2. Durable location ingestion | In progress | Implemented event IDs, Socket.IO acknowledgement contract, idempotent Postgres event index/migration, direct durable history writes, and Expo queue deletion only after acknowledgement. Verified in staging with a synthetic runner Socket.IO update: acknowledgement, dispatcher roster visibility, and persisted history all succeeded. Redis TTL/lease, retry/backoff limits, and automated integration/failure tests remain. |
| 3. Tenant and assignment authorization | In progress | Implemented organizations, organization JWT claim, explicit runner/dispatcher assignments, assignment-scoped runner roster/history, and assignment-scoped Socket.IO rooms. Cross-tenant integration tests and live assignment-change session handling remain. |
| 4. Cloudflare + Supabase staging infrastructure | In progress | Supabase project `trackrunner-staging` is healthy in South Asia (Mumbai), `ap-south-1`, project ref `diyjijrvnbagiegacqfw`. Render Free staging cache (`trackrunner-staging-redis`, Singapore) and API (`trackrunner-staging-api`) are live. Cloudflare Pages dashboard is live at `https://trackrunner.pages.dev`; its API CORS origin is configured and verified. A full synthetic runner-to-dispatcher staging flow also passed. Custom domain, durable managed cache, backups, monitoring, and paid-production hardening remain. |
| 5. CI and automated quality gates | Not started | Typecheck, lint, unit/integration/contract/E2E tests, security scans, release builds. |
| 6. Mobile release readiness | In progress | Restored the Expo 55 courier client as a normal repository folder (not a submodule), replaced emulator-only HTTP configuration with required `EXPO_PUBLIC_API_BASE_URL`, removed the inherited EAS project link, added a staging run guide, and verified TypeScript, Expo configuration, and a full Android JavaScript bundle locally. SDK 55 was selected to match the current Play Store Expo Go runtime. An EAS `preview` profile is configured to produce an installable Android APK, but it still needs linking to the owner’s Expo account and a successful cloud build. The client has SecureStore session storage, SQLite event queue, server acknowledgement before deletion, and foreground/background location configuration. A physical-device staging test, privacy flow, crash reporting, and signed internal build remain. |
| 7. Load test and controlled pilot | Not started | Capacity/reconnect/fan-out test report, restore drill, staged courier rollout approval. |

**Baseline:** documentation and architecture assessment completed on 2026-08-06. Expo is the selected production courier client. Mobile code/configuration checks now pass locally; no real-device background-location behaviour has been verified yet.

## What exists today

```text
Courier mobile app
  ├─ Login: POST /api/auth/login
  ├─ Socket.IO JWT handshake
  ├─ Background location collection
  └─ SQLite/Room offline buffer
             │
             ▼
Node.js / Express / Socket.IO API
  ├─ Redis: last known state and online set
  ├─ Socket rooms: runner:{id}, dispatchers
  └─ periodic worker
             │
             ▼
PostgreSQL location_history
             │
             ▼
React/Vite dispatcher dashboard (Leaflet)
```

### Components and current capability

| Component | Current implementation | Useful foundation | Production concern |
|---|---|---|---|
| Backend | Express 4, TypeScript, Socket.IO, Zod, JWT, PostgreSQL, Redis | Payload shape and runner identity are validated; dispatcher routes check JWT role. | Single-process assumptions, permissive cross-origin access, no request limits, weak production config validation, no graceful shutdown/metrics. |
| Live state | Redis hash per runner plus online/all sets | Fast dashboard bootstrap and fan-out. | Keys have no expiry; online state is wrong with multiple sessions or abrupt failures; state has no tenant or assignment boundary. |
| History | Worker copies latest Redis state to PostgreSQL every 10 seconds | Basic trail query and indexed `(runner_id, ts)` reads. | It records only the sample visible at tick time, appends duplicates, and has no acknowledgement/idempotency guarantee. |
| Dashboard | React + Vite + React Leaflet | Login, live map, roster, history trail, connection indicator. | JWT is in `localStorage`; UI is demo-oriented and has no authorization-aware error handling, audit trail, responsive/accessibility testing, or production hosting configuration. |
| Expo mobile app | Expo 56, SecureStore, SQLite offline cache, background location task | Better candidate for a cross-platform future; secure token store and offline cache exist. | Backend host is hard-coded to emulator HTTP; sync marks records sent before server acknowledgement; no environment config, telemetry, test suite, or policy-ready privacy UX. |
| Native Android app | Kotlin foreground service, Fused Location, Room, encrypted preferences | A capable Android-only implementation with a foreground-service model. | Legacy/duplicate product path, dynamically discovers LAN HTTP URL, allows cleartext traffic, no release hardening or tests. |
| Local infrastructure | Docker Compose for Redis, PostgreSQL, backend | Good developer-demo setup. | Public database/cache ports, credentials and JWT secret in Compose, no TLS/reverse proxy/backups/secrets/monitoring. |

## Product decisions to make first

These decisions change the data model and security design, so make them before substantial implementation:

1. **Supported client — decided:** The Expo app (`react-native-app/`) is the production courier client for iOS and Android. Do not maintain the Kotlin Android client as an independent production path; keep `android-app/` only as legacy/reference code until it is formally retired. The Expo app still needs production environment configuration and reliable acknowledgement semantics.
2. **Operating model:** Define organizations/tenants, dispatcher teams, runner assignments, and who may view a runner. The current model has only global `runner` and `dispatcher` roles.
3. **Tracking policy:** Define when tracking starts/stops, expected update interval by delivery state, acceptable accuracy, retention duration, and whether a courier can pause tracking.
4. **Delivery semantics:** Decide whether the system needs at-least-once, exactly-once-effect (recommended), or best-effort history. For courier auditability, use client-generated event IDs and idempotent server storage.
5. **Privacy and compliance:** Identify countries, legal basis/consent or employment notice, retention, access/deletion requests, vendor agreements, and an incident-contact process before collecting real location data.

## P0 — release blockers

Complete and verify every item in this section before handling real courier location data.

| Work item | Current evidence | Required production change | Acceptance criteria |
|---|---|---|---|
| Remove insecure defaults | `backend/src/config.ts` supplies a fallback JWT secret; `docker-compose.yml` contains `change-me-in-production`; server CORS is `*`. | Fail startup in production when required secrets/config are missing; use a secret manager; allow only configured HTTPS dashboard origins; configure Socket.IO CORS identically. | Deployment fails without secrets. Requests from unapproved origins fail. No secret exists in the repository, image, browser bundle, or logs. |
| Enforce HTTPS/WSS | Both mobile apps default to HTTP; Kotlin manifest sets `usesCleartextTraffic="true"`. | Put API/dashboard behind TLS; use `https://`/`wss://` production URLs; disallow cleartext in release builds with narrowly scoped dev exceptions. | A release build cannot authenticate or connect over HTTP. TLS configuration is automatically renewed and monitored. |
| Fix durable, idempotent location ingestion | Socket handlers save to Redis; worker snapshots only latest state every 10s. Worker comments acknowledge no uniqueness constraint. Both mobile clients mark cached points synced after emit, not server acknowledgement. | Add `event_id`/sequence number and an acknowledgement protocol. Insert accepted points into PostgreSQL using a unique constraint such as `(runner_id, event_id)` in a durable transaction; update Redis live state after validation. Delete/mark local cache entries only after matching acknowledgement. | Replays and reconnects create one historical point per event. A crash at any stage neither silently loses a point nor causes unbounded duplicates. Automated failure-injection test passes. |
| Apply server-side abuse and freshness controls | Location schema validates coordinates but accepts arbitrary timestamps/batches up to 1,000. Login has no throttling. | Add per-IP and per-account login limits, per-runner event rate/batch-size limits, request-body limits, timestamp age/future-skew checks, accuracy/speed plausibility checks, and structured security logs. | Brute-force, oversized payload, replay/future timestamp, impossible-velocity, and event-flood tests receive documented safe responses without degrading service. |
| Build authorization around tenancy and assignments | Dispatcher can list every Redis runner and read every runner history. | Add `organization`, `team/assignment`, and authorized dispatcher scope to schema and JWT/session claims. Filter all REST and socket fan-out by scope; authorize before exposing state/history. | A dispatcher cannot discover, subscribe to, or query a runner outside their organization/assignment. Tests cover cross-tenant access. |
| Establish mobile privacy and lifecycle safety | Background tracking starts directly from a button; no delivery/shift state or privacy policy screen is present. | Provide clear disclosure, consent/notice where applicable, visible active-tracking state, start/stop tied to an authorized work assignment, and reliable logout/revocation behaviour. Document Play/App Store background-location justification. | Product/legal owner approves the copy and flow. Tracking stops on assignment end, logout, account disable, and token revocation. Store-review artifacts are ready. |
| Production database operations | Migration is an executable TypeScript file, no migration history/table, no backup/restore process. | Adopt versioned, transactional migrations; define managed PostgreSQL, private networking, encryption, automated backups/PITR, restore drills, and least-privilege DB roles. | Fresh deployment and upgrade from a prior version work in CI. A documented restore exercise meets RPO/RTO targets. |
| Add baseline quality gates | No test scripts/lint scripts are defined in backend/dashboard/mobile package files. | Add unit, integration, contract, and end-to-end test layers; lint/typecheck/build scripts; CI that blocks merges on failure. | A clean checkout runs the documented quality command and CI exercises all supported apps. |

## P1 — required for a dependable launch

### Backend and data reliability

- Replace the in-process persistence interval with durable ingestion (or a proper queue/worker) and ensure a location history write is not dependent on one Node process remaining alive.
- Add Redis key TTLs and a last-seen timestamp. Treat online status as a lease/heartbeat, not merely a socket disconnect event.
- Handle multiple devices/tabs per runner safely: do not mark a runner offline until their final tracking connection ends; track connection IDs or a heartbeat lease.
- Use Socket.IO Redis adapter or another message broker when running more than one API instance, and configure load-balancer WebSocket affinity as appropriate.
- Add connection health checks for PostgreSQL and Redis. `/api/health` should distinguish liveness from readiness and fail readiness when dependencies are unavailable.
- Add graceful shutdown: stop accepting connections, stop worker intake, drain in-flight writes, close Socket.IO/HTTP/Redis/Postgres with a deadline.
- Add pagination/time-range filters to history and enforce a maximum retained/queryable period. Limit responses by count and byte size.
- Use a pooled, parameterized database layer consistently, typed route middleware, centralized error mapping, and a documented OpenAPI/AsyncAPI event contract.
- Validate that a runner account is active and currently assigned before accepting location updates; support account disable and token revocation (short-lived access tokens plus refresh/revocation strategy).

### Security

- Add secure HTTP response headers (for example Helmet), an explicit content-security policy for the dashboard, and a carefully configured reverse proxy.
- Do not store long-lived bearer tokens in dashboard `localStorage`. Prefer secure, `HttpOnly`, `Secure`, `SameSite` cookies with CSRF protection, or use a deliberately designed short-lived token strategy.
- Add password policy, reset/invite flow, account lockout/backoff, verified email/SSO if applicable, and MFA for dispatchers/admins.
- Hash passwords with an intentionally selected bcrypt/Argon2 cost; seed data must be development-only and never deployed to production.
- Manage dependency updates, lockfile integrity, SCA/vulnerability scanning, secret scanning, container image scanning, and a security incident runbook.
- Remove Docker exposure of Redis and PostgreSQL to host/public networks in production. Use private subnets/security groups and credential rotation.

### Mobile reliability

- Move `API_BASE_URL` and `SOCKET_URL` from `react-native-app/src/constants/index.ts` to environment-specific build configuration. Use a development, staging, and production environment; never ship LAN/emulator defaults in a release.
- Implement acknowledged batches with bounded retry, exponential backoff plus jitter, cache limits, compaction rules, and a user-visible recovery state when a device has been offline too long.
- Authenticate each start of a tracking session, record an immutable session ID, and prevent tracking with expired/revoked credentials.
- Use adaptive tracking: lower frequency while stationary, a delivery-mode profile while moving, explicit accuracy thresholds, and battery/network telemetry. Verify behaviour on Android OEM battery restrictions and iOS background execution limits.
- Add real-device test coverage for permission denial, approximate-only location, background/terminated app, reboot, airplane mode, network changes, expired token, storage full, and clock changes.
- Configure crash reporting, performance telemetry, release channels, EAS build signing credentials, store metadata, data safety/privacy labels, and staged rollout/rollback criteria.

### Dashboard and operations UI

- Convert demo login defaults into blank production fields and add expired-session/403/reconnect/error views.
- Build responsive layouts and keyboard/screen-reader support; test dense fleets, map clustering, stale/offline state, history ranges, and poor-network behaviour.
- Display meaningful courier identity and assignment rather than numeric runner IDs; add search, filters, last update age, battery/accuracy warnings, and clearly distinguish live versus historical data.
- Record audit events for dispatcher logins, runner history access, assignment changes, and sensitive exports.
- Consider map-tile provider terms, API keys, rate limits, attribution, and a fallback plan. Do not rely on an unspecified public tile service for production traffic.

## P2 — scale and product maturity

- Delivery/shift/stop workflow, proof of delivery, geofences, ETA and route deviation alerts.
- Historical playback with server-side downsampling, exports with authorization and audit logging.
- Operations admin console: organizations, users, roles, assignments, support impersonation with audit controls.
- Push notifications for assignment and safety alerts; in-app incident/support channel.
- Data warehouse/aggregates for operational KPIs without querying raw location history directly.
- Multi-region/disaster-recovery design if the service level requires it.
- Localization, accessibility conformance, device-management support, and mobile device integrity/risk controls when justified by the threat model.

## Recommended target architecture

```text
Mobile release app
  └─ HTTPS/WSS, short-lived token, eventId + ack + encrypted local queue
        │
        ▼
TLS gateway / WAF / rate limit
        │
        ▼
Stateless API + Socket.IO fleet ─── Redis adapter/pub-sub ─── Dashboard
        │                                      │
        ├─ durable idempotent location write ──┤
        ▼                                      ▼
Managed PostgreSQL (PITR, private)       Redis live-state lease/TTL
        │
        ▼
Worker/analytics pipeline, audit logs, monitoring and alerting
```

Key data entities to introduce: `organizations`, `users`, `roles`, `runner_assignments`, `tracking_sessions`, `location_events` (including `event_id` and received timestamp), `refresh_tokens`/revocation records, and `audit_events`.

## Recommended infrastructure: Cloudflare + Supabase

### Recommendation

Use **Cloudflare and Supabase together**, with clear responsibility boundaries:

| Layer | Recommended service | Why | Do not use it for initially |
|---|---|---|---|
| DNS, TLS, edge security | Cloudflare | Managed DNS, TLS termination, DDoS protection, WAF rules, and edge rate limits in front of public hosts. | Storing authoritative location data or replacing application-level authorization. |
| Dashboard hosting | Cloudflare Pages or static assets behind Cloudflare | The Vite dashboard is a static build and benefits from CDN delivery and simple deploy previews. | Holding dashboard secrets; only public runtime configuration belongs in the client bundle. |
| Public API edge | Cloudflare proxy; optionally a small Worker for request policy | Apply WAF/rate rules to login and REST endpoints, validate coarse request policy, and route HTTPS/WSS to the origin. Cloudflare supports WebSocket endpoints, and Durable Objects are available when a future edge-native WebSocket design is justified. | Moving the existing Socket.IO service into a Worker as a lift-and-shift. That would be a redesign with Durable Objects/WebSocket protocol semantics, not a small infrastructure change. |
| Tracking API and Socket.IO | A regional, autoscaled container/service running the current Node backend, with Redis adapter | This is the authoritative ingestion point for authentication, idempotency acknowledgement, tenant/assignment checks, and controlled fan-out. Keep it near the database region. | Direct client access to the database or a one-process deployment. |
| Primary relational data | Supabase PostgreSQL | Managed Postgres, backups/tooling, SQL migrations, and a practical upgrade path. Use it as the durable system of record for users, assignments, sessions, location events, and audit logs. | Letting the mobile app write raw locations directly via the Data API. That bypasses the required server-side plausibility, assignment, idempotency, and abuse controls. |
| Live transient state | Redis (managed, in the same region as API/DB) | Fast last-known-location cache, presence lease, Socket.IO cross-instance adapter, retry/rate-limit counters. | Long-term history or the only record of accepted locations. |
| Realtime dispatcher updates | Existing Socket.IO fan-out initially | Preserves the present client contract and keeps live update authorization in the API. | Supabase Postgres Changes for every location row. Supabase recommends Broadcast over Postgres Changes for scalability/security, but message delivery is still a cost and design dimension; use it later only if it replaces Socket.IO deliberately. |

The above is an architectural recommendation based on the current code, not a claim that one platform cannot perform the other's job. Cloudflare Durable Objects can coordinate long-lived WebSocket clients and hibernate idle objects, while Supabase Realtime Broadcast supports authenticated private channels. They are useful alternatives once the team explicitly chooses to redesign the realtime protocol. [Cloudflare Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)

### Proposed production topology

```text
Courier app ── HTTPS/WSS ──► Cloudflare
                                  ├─ Dashboard static files ─► Cloudflare Pages
                                  └─ api.example.com ────────► regional API / Socket.IO containers
                                                                    │          │
                                                                    │          └─ managed Redis
                                                                    ▼
                                                              Supabase PostgreSQL
                                                              (same closest region)
```

Keep the API origin private where possible (for example, provider private networking/tunnel or origin allowlisting) and accept public traffic only through Cloudflare. The API must still enforce authentication and authorization: edge rate limits are protective controls, not a source of truth. Cloudflare's own documentation notes that WAF rate counters are scoped per data center, so enforce per-user/per-runner limits inside the API and Redis as well. [Cloudflare rate-limit request calculation](https://developers.cloudflare.com/waf/rate-limiting-rules/request-rate/)

### Location write/read design

**Write path — one accepted event, two intentional effects**

1. Mobile generates a UUID `event_id`, a monotonically increasing client sequence, and a tracking-session ID; it writes the event to its encrypted local queue first.
2. Mobile sends an acknowledged Socket.IO batch to the Node API. The API authenticates, checks the active assignment and tenant, rejects invalid/stale/impossible locations, and applies a per-runner limit.
3. The API performs an idempotent PostgreSQL insert: `UNIQUE (runner_id, event_id)`. It returns an acknowledgement only after the durable transaction commits.
4. The API updates Redis with the most recent accepted point and a TTL-based presence lease, then fans out the sanitized current state only to authorized dispatcher rooms.
5. The mobile app deletes the local events only after the acknowledgement lists their exact IDs. Repeated delivery is harmless because the database constraint makes the effect exactly once.

**Read path — do not read the event table for the live map**

- Live roster/map: read Redis current state, with an explicit `last_seen_at`/stale status.
- History: read PostgreSQL by `(organization_id, runner_id, occurred_at)` and date range, with server-side pagination/downsampling.
- Dashboard fan-out: send a compact current-state event, not full historical rows. Coalesce updates per runner (for example, one visible map update every 2–5 seconds) when a device sends more often.

### Capacity implications for this application

Location tracking is write-heavy. At a 5-second active interval, **1,000 continuously active couriers create 200 events/second, 17.28 million events/day, and about 518 million events/month**. At a 15-second interval, the same fleet creates 5.76 million events/day. Actual numbers are lower when tracking only during shifts and using distance/stationary sampling, but this is why retention and batching are first-class requirements.

### Large-write operating model for live runner tracking

Do not make PostgreSQL answer the question “where is this runner now?” for every map refresh. Treat live state and historical events as different workloads:

```text
Courier app
  └─ acknowledged Socket.IO batch
        └─ Node ingestion API
             ├─ PostgreSQL: durable, idempotent location event history
             └─ Redis: latest accepted point + last-seen/online lease
                    └─ authorized dispatcher Socket.IO rooms and live map
```

**Redis answers live-location reads.** Store only the latest accepted point, `last_seen_at`, tracking-session ID, and a TTL-backed online lease per runner. The dashboard loads this compact state for its initial roster and receives incremental updates; it should not poll the high-volume event table for the live map.

**PostgreSQL answers historical/audit reads.** Store an append-only `location_events` record only after it has passed authentication, assignment/tenant checks, timestamp/velocity validation, and idempotency validation. Query history by runner and time range, with pagination and server-side downsampling.

#### Recommended ingestion algorithm

1. The mobile client creates an immutable UUID `event_id`, increasing sequence number, tracking-session ID, and timestamp. It writes the point to its local encrypted/offline queue before sending.
2. The client emits a Socket.IO batch with an acknowledgement callback. It does **not** mark local rows synced merely because `emit()` returned.
3. The API validates every event, places valid events in a brief in-memory batch (target: up to about one second or a conservative bounded row/byte count), then issues one multi-row PostgreSQL insert in a transaction.
4. The event table enforces `UNIQUE (runner_id, event_id)`. A retry returns the already-accepted event as successful instead of creating a duplicate.
5. After the transaction commits, update the runner's Redis latest-state key and lease, publish one compact state update to the runner's authorized dispatcher rooms, then acknowledge the event IDs to the client.
6. The client deletes only the acknowledged queue rows. If the API restarts before acknowledgement, the client retries; the unique constraint preserves exactly-once effect in history.

This pattern makes a short API batching buffer safe: an uncommitted buffer can be lost on process failure, but the device still has the event because it never received acknowledgement. It does require a bounded local queue, retry with backoff/jitter, and an explicit user/support state when the queue cannot drain.

#### Sampling and fan-out policy

Use adaptive sampling so active delivery precision does not become permanent background write volume:

| Runner state | Starting policy to test | Rationale |
|---|---|---|
| Stationary | Suppress ordinary points; retain a heartbeat every 1–5 minutes. | Avoids writing unchanged coordinates and reduces battery use. |
| Moving normally | Send on 10–15 second interval and/or 10–25m displacement. | Often sufficient for a dispatcher map; validate against actual delivery experience. |
| Arrival, geofence, or high-value delivery phase | Temporarily use a 5-second interval with a tighter distance threshold. | Reserves high write rate for the moments where it has operational value. |
| Dashboard map rendering | Coalesce each runner to at most one visible update every 2–5 seconds. | Prevents one runner's high-frequency samples from multiplying outbound updates to every dispatcher. |

These are starting values, not product requirements. Measure live-location latency, accuracy, battery use, queue depth, and total event volume during an internal pilot before setting the final policy.

#### Database layout and retention

- Partition `location_events` by day or month before the expected volume demands it. Partitions make retention deletion and time-bounded history queries manageable.
- Begin with `UNIQUE (runner_id, event_id)` and tenant-aware history access such as `(organization_id, runner_id, occurred_at DESC)`. Add indexes only for proven query patterns: every extra index increases insert work. [Supabase query optimization guidance](https://supabase.com/docs/guides/database/query-optimization)
- Retain raw high-resolution points only for the policy-defined operational/audit window. Downsample to route segments or one point per minute for longer analytics retention, then delete expired raw partitions.
- Keep current state outside this append-only table. A separate live-state/cache update is cheaper than repeatedly selecting the newest history row for every runner.
- Use a bounded database connection pool. A persistent Node service should use a persistent/direct connection where supported or session pooling; short-lived serverless/edge functions should use Supabase transaction pooling. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)

#### When to introduce a durable stream/queue

Start the pilot with the transactional, acknowledged batch insert path above. Introduce a durable queue/stream between the API and PostgreSQL when load tests or production telemetry show any of the following:

- several thousand continuously active runners or high-frequency tracking across a large fleet;
- reconnect storms causing ingestion bursts that exceed the database's safe write latency;
- a requirement to acknowledge acceptance even while the database writer is temporarily unavailable;
- independent scaling/replay of validation, persistence, and downstream analytics consumers.

In that design, the API acknowledges only once the event is durably accepted by the stream; a consumer batch-writes PostgreSQL. The PostgreSQL uniqueness constraint remains mandatory, because queues normally provide at-least-once delivery. Redis is still not the authoritative queue or history store.

Start with these policies, then tune from measured pilot data:

| Concern | Launch policy |
|---|---|
| Client sampling | Use adaptive update frequency; do not sample every 5 seconds while stationary. Start with a moving interval/distance threshold that meets delivery UX, then measure accuracy, battery, and event volume. |
| Ingestion batching | Batch briefly (for example, 1–10 seconds or a small number of points) only when it does not undermine live UX; use a server acknowledgement per event ID/batch. |
| Postgres storage | Partition `location_events` by day or month before expected volume demands it; retain raw high-resolution records for a defined short period, then downsample/aggregate or delete by policy. |
| Indexing | Begin with a tenant-aware composite history index such as `(organization_id, runner_id, occurred_at DESC)` and a unique `(runner_id, event_id)`. Indexes accelerate reads but also increase write cost, so add only measured query-driven indexes. [Supabase query optimization guidance](https://supabase.com/docs/guides/database/query-optimization) |
| Geometry | Store latitude/longitude as numeric values initially; introduce PostGIS geography and spatial indexes only for geofence/nearby/route queries that need them. |
| Connection management | A long-lived Node service should use a bounded application pool and a persistent/direct connection when network support permits; serverless/edge functions should use the Supabase transaction pooler. Never allow autoscaled processes to create unbounded direct connections. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) |
| Realtime volume | Keep separate limits for courier ingestion and dispatcher fan-out. One location event may be delivered to many dispatchers, multiplying messages and cost. Filter by organization/team and only publish changes useful to the viewer. |
| Capacity testing | Load test realistic active shifts, reconnect storms, and dispatcher fan-out before choosing Supabase compute size or container/Redis capacity. Set an alert at 60–70% of measured safe DB CPU, IOPS, connection-pool, Redis memory, or outbound-message capacity. |

### What to use from Supabase

Use Supabase PostgreSQL immediately. It removes the operational burden of self-hosting PostgreSQL while keeping the existing Node service responsible for writes and Socket.IO.

- Use **SQL migrations in source control**, deployed by CI; do not use manual dashboard edits as the only schema history.
- Use **Row Level Security** only for tables intentionally exposed through Supabase Data APIs. The Node service should use a restricted database role and enforce tenant/assignment authorization itself.
- Consider **Supabase Auth** later if you want managed email/password, reset, MFA, and session lifecycle. Migrating authentication is worthwhile but should be a dedicated change, not mixed with the critical ingestion rewrite.
- Do **not** make Supabase Realtime the launch transport just because it is available. If replacing Socket.IO, use private Broadcast topics by organization/dispatcher scope and calculate per-recipient message volume; Supabase documents Broadcast as the scalable option relative to Postgres Changes. [Supabase database-change subscriptions](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes), [Realtime message usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)

### What to use from Cloudflare

- Cloudflare DNS and proxied HTTPS/WSS hosts for `app.example.com` and `api.example.com`.
- Pages for the dispatcher dashboard, with deployment previews only for non-production environments.
- WAF managed rules and narrowly scoped rate rules: aggressive protection on `/api/auth/login`; separate, higher but bounded limits for authenticated tracking endpoints. Rate rules should use a stable authenticated identifier when available, not only mobile-network IPs. [Cloudflare rate limiting guidance](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- Turnstile on browser-facing login/registration flows if compatible with your user experience; do not make a background courier location update depend on an interactive challenge.
- Optional Worker as a thin edge policy/proxy only after the core origin works. Keep it stateless and avoid direct database access on the hottest Socket.IO path.

### Phased implementation for this stack

1. Create Supabase **staging** and **production** projects in the region nearest your courier operations; configure backups/PITR plan, database roles, network restrictions, and secrets.
2. Provision managed Redis and a regional container platform for the Node service in the same region as Supabase. Add Socket.IO Redis adapter before horizontal scaling.
3. Place Cloudflare in front of the static dashboard and API origin; configure DNS/TLS/WAF/rate rules, origin protection, and observability.
4. Implement the acknowledged idempotent event flow, partitions/retention, and tenant/assignment model. Prove it with automated reconnect/crash tests.
5. Run a staging load test using the expected active-courier profile; choose paid plans/compute from evidence, not from a generic request-per-second estimate.


## Delivery plan

### Phase 0 — discovery and design (1–2 weeks)

- Choose the supported mobile application and formally deprecate or isolate the other path.
- Define tenant/assignment model, tracking policy, privacy retention, SLOs, RPO/RTO, expected concurrent couriers, and peak update rates.
- Write API/event schemas and error/acknowledgement semantics. Create threat model and data-flow diagram.
- Provision separate development, staging, and production accounts/projects with a secret manager.

**Exit criteria:** approved product/privacy policy, architecture decision records, schema migration plan, and measurable non-functional requirements.

### Phase 1 — secure and reliable core (2–4 weeks)

- Implement P0 config/TLS/CORS/rate limits/tenant authorization.
- Replace snapshot persistence with idempotent, acknowledged event ingestion.
- Add migrations, backup/restore automation, health/readiness, graceful shutdown, structured logging, error tracking, and basic metrics.
- Add tests and CI; deploy the stack to staging behind production-like networking.

**Exit criteria:** end-to-end staging tests pass, chaos/reconnect test passes, security checklist is signed off, and dashboards/alerts exist for API, WebSocket, database, cache, and queue/worker health.

### Phase 2 — mobile and dashboard launch quality (2–4 weeks)

- Ship environment-configured mobile builds to internal testers; complete background-location and offline reliability matrix on representative devices.
- Implement dashboard UX/accessibility/error states, audit logging, assignment-aware views, and map provider configuration.
- Run load tests at at least the intended launch load plus headroom; conduct backup restore and incident drill.

**Exit criteria:** staged internal pilot meets defined delivery, battery, crash-free, latency, and support targets.

### Phase 3 — controlled rollout

- Start with one organization/team and a small courier cohort.
- Use staged mobile release percentages and rollback switches; monitor errors, delayed locations, cache backlog, battery impact, and support tickets daily.
- Expand only after the pilot has met success criteria for a pre-agreed observation window.

## Suggested service-level indicators

Define targets with the business owner; examples below are starting points, not commitments.

| Signal | Example measurement |
|---|---|
| Availability | API readiness and authenticated Socket.IO connection success rate. |
| Live latency | p50/p95/p99 from device timestamp to dispatcher fan-out, segmented by network type. |
| Ingestion correctness | Accepted location events versus acknowledged/persisted events; duplicate and rejected-event rates. |
| Freshness | Percentage of active runners whose last accepted point is under the chosen threshold. |
| Offline recovery | Queue age/depth, recovery success rate, and time to drain after reconnect. |
| Mobile quality | Crash-free users/sessions, permission funnel, background-task stop rate, and battery cost per tracking hour. |
| Data layer | PostgreSQL latency/errors/connections/storage, Redis memory/evictions/latency, backup success, restore test age. |
| Security | Failed login rate, throttled requests, authorization denials, secret scan findings, and dependency vulnerabilities. |

## Test strategy

| Layer | Minimum coverage |
|---|---|
| Unit | Zod/domain validation, authorization scope, configuration validation, retry/queue state machine, timestamp/velocity rules. |
| Integration | PostgreSQL migrations, idempotent event insert, Redis TTL/lease behaviour, REST auth, Socket.IO auth/authorization/acknowledgements. |
| Contract | Versioned REST and Socket event fixtures shared by API, dashboard, and selected mobile app. |
| End-to-end | Login → tracking start → live map → offline queue → reconnect → exact historical trail. |
| Device | Android and iOS foreground/background/terminated states, permissions, network transitions, low battery/storage, timezone/clock changes. |
| Load | Concurrent sockets, high-frequency bursts, Redis/DB saturation, reconnect storms, dashboard fan-out. |
| Security | Dependency/secret/container scans, SAST, authentication/authorization tests, rate-limit and input-fuzz tests, external penetration test before broad launch. |
| Recovery | API restart during writes, Redis restart/failover, DB failover/restore, rollout rollback, and mobile version rollback. |

## Deployment and release checklist

- [ ] Separate dev/staging/prod environments and DNS names exist.
- [ ] Production URLs use HTTPS/WSS; database/cache are private; TLS is monitored.
- [ ] Secrets come from a secret manager and are rotated; production uses no demo seed accounts.
- [ ] Versioned migrations run once per deployment and are backward compatible for rollback.
- [ ] Database backups/PITR and a tested restoration procedure meet the agreed RPO/RTO.
- [ ] CI runs install, typecheck, lint, tests, build, dependency/secret scans, and image scan.
- [ ] Deployment has immutable version metadata, release notes, health checks, alerts, and rollback procedure.
- [ ] Mobile release is signed, uses production environment config, has crash reporting, and passes background-location store requirements.
- [ ] Privacy notice, data retention/deletion process, terms, support contact, and incident response are approved.
- [ ] Load, reconnect, access-control, and restore tests have passed at launch capacity.

## Repository hygiene improvements

- Add a root `.gitignore` appropriate for Node, Gradle, Expo, IDE files, `.env`, build artifacts, and `.DS_Store`. The current worktree includes tracked/generated Android build and IDE artifacts, which should not be part of a clean source release.
- Replace the root `package.json` (currently only an `nvm` dependency) with a workspace/task runner or remove it; add consistent root commands for install, lint, test, build, and local stack.
- Add `CONTRIBUTING.md`, architecture decision records, runbooks, environment-variable reference, API/event contract, and a security reporting policy.
- Keep the legacy Kotlin app in a clearly named `legacy/` path or retire it after the supported Expo path has parity; otherwise release and API changes can diverge.

## Immediate next actions

1. Select Expo or Kotlin as the single supported courier client and document the decision.
2. Design and implement the idempotent `event_id` + acknowledgement flow before expanding any product feature.
3. Provision a staging environment with managed PostgreSQL/Redis, TLS, secret manager, private networking, monitoring, and no public data-store ports.
4. Implement tenancy/assignment authorization, production config validation, strict CORS, HTTPS-only transport, and rate limits.
5. Add CI plus the end-to-end offline/reconnect scenario; use it as the first release gate.
