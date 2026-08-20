# TrackRunner

Real-time courier tracking system. Android Foreground Service streams location
over Socket.IO to a Node.js backend, which fans out to a React dashboard via
WebSocket pub/sub backed by Redis (live state) and PostgreSQL (history).

```
┌──────────────┐   Socket.IO    ┌──────────────┐    pub/sub    ┌──────────────┐
│ Android app  │ ─────────────► │  Node.js     │ ────────────► │ React dash   │
│ (foreground  │   JWT auth     │  backend     │               │ (Leaflet)    │
│  service)    │                │              │               │              │
└──────────────┘                └──────┬───────┘               └──────────────┘
                                      │
                                      ▼
                              ┌──────────────┐
                              │ Redis (live) │
                              │ Postgres     │
                              │ (history)    │
                              └──────────────┘
```

## Repo layout

```
TrackRunner/
├── backend/          # Node.js + TypeScript: Socket.IO + REST + workers
├── dashboard/        # React + Vite + Leaflet: live map + runner list
├── react-native-app/ # Expo courier app for iOS and Android
└── docker-compose.yml
```

## Prerequisites

- Node.js 20+
- Docker Desktop (or local Redis + Postgres)
- Android Studio Hedgehog (or newer) with API 34 SDK
- JDK 17 (Android Gradle Plugin requires it)

## 1. Start the backend

### Option A — Docker (recommended)

```bash
docker compose up -d
docker compose exec backend npm run migrate
docker compose exec backend npm run seed
```

The backend is now listening on `http://localhost:3000`.

### Option B — Local

```bash
# 1. Start Redis and Postgres (any way you like)
# 2. Configure backend/.env
cp backend/.env.example backend/.env
# edit DATABASE_URL and REDIS_URL if not on defaults

cd backend
npm install
npm run migrate
npm run seed
npm run dev
```

### Demo credentials (seeded)

| Email                  | Password   | Role       |
|------------------------|------------|------------|
| `runner@demo.local`    | `demo1234` | `runner`   |
| `dispatcher@demo.local`| `demo1234` | `dispatcher` |

## 2. Start the dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open <http://localhost:5173>. Sign in as `dispatcher@demo.local / demo1234`
to see the live map. The Vite dev server proxies `/api` and `/socket.io` to
`http://localhost:3000`, so no CORS configuration is needed.

## 3. Demo script

1. Start backend + dashboard.
2. Run the Expo courier app on two physical devices (or one device + one emulator).
3. Sign in as `runner@demo.local` on device A and `dispatcher@demo.local` on
   device B (or just use the dashboard in a browser).
4. Start tracking on device A. Watch the marker move on the dashboard.
5. Toggle airplane mode on device A for 30 seconds, then disable it. The
   cached samples should flush automatically on reconnect.

## Architecture notes

- **Auth**: JWT in the Socket.IO handshake (`auth.token`). The backend
  verifies it on every connection and rejects mismatched `runnerId` payloads.
- **Live state**: Redis hash per runner (`runner:state:{id}`) plus a
  `runner:online` set for the dashboard's roster.
- **History**: A worker flushes Redis → Postgres every 10s in a single
  transaction. The dashboard can replay a runner's trail via
  `GET /api/runners/:id/history`.
- **Offline-first**: The Expo courier app caches samples locally when the socket
  is disconnected and flushes them as a batch on reconnect.

## Troubleshooting

- **Dashboard shows no runners** — open the browser dev tools network tab
  and confirm the WebSocket handshake to `/socket.io` succeeded with a 200.
- **Login returns 401** — re-run `npm run seed` in the backend container.
