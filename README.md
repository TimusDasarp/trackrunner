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
├── android-app/      # Kotlin app: foreground service + login + JWT
├── backend/          # Node.js + TypeScript: Socket.IO + REST + workers
├── dashboard/        # React + Vite + Leaflet: live map + runner list
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

## 3. Build and install the Android app

```bash
cd android-app
```

### Pointing the app at your backend

The app reads `BuildConfig.SERVER_URL` at compile time. The default
(`http://10.0.2.2:3000`) is the Android emulator's loopback to the host
machine, so it works out of the box for emulator demos.

For a **physical device on the same Wi-Fi**, override the URL at build time:

```bash
./gradlew assembleDebug -PSERVER_URL=http://192.168.1.42:3000
```

Replace `192.168.1.42` with your laptop's LAN IP (`ipconfig` on Windows,
`ifconfig` on macOS/Linux).

### Build the APK

```bash
./gradlew assembleDebug
# APK lands at: app/build/outputs/apk/debug/app-debug.apk
```

### Install on a device

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or drag the APK onto an emulator window.

### First run

1. Launch **TrackRunner**.
2. Sign in with `runner@demo.local / demo1234`.
3. Grant location permissions (foreground, then "Allow all the time").
4. Tap **Start Tracking**. The persistent notification appears and the
   service begins streaming.
5. Open the dashboard in a browser — the runner marker should appear on the
   map within ~15 seconds.

## 4. Demo script

1. Start backend + dashboard.
2. Install APK on two physical devices (or one device + one emulator).
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
- **Offline-first**: The Android app caches samples in Room when the socket
  is disconnected and flushes them as a batch on reconnect.
- **Battery**: `PRIORITY_BALANCED_POWER_ACCURACY` with a 15s interval and
  15m smallest displacement. The service also reads battery level and ships
  it with every payload so the dashboard can warn on low battery.

## Android module structure

```
app/src/main/java/com/trackrunner/courier/
├── LoginActivity.kt             Email/password sign-in
├── MainActivity.kt              Permission flow + start/stop UI
├── TrackRunnerApp.kt            Application class
├── data/
│   ├── AppDatabase.kt           Room database
│   ├── CachedLocation.kt        Entity for offline buffer
│   ├── LocationCacheDao.kt      DAO with batch + trim queries
│   ├── LocationCacheRepository.kt  Coroutine-friendly wrapper
│   └── SessionStore.kt          Encrypted JWT storage
├── network/
│   ├── AuthApi.kt               /api/auth/login client
│   ├── LocationPayload.kt       Wire format
│   └── SocketClient.kt          Socket.IO client w/ reconnect + JWT
├── service/
│   └── LocationTrackingService.kt  Foreground service (the core)
└── util/
    ├── BatteryHelper.kt         Battery % without sticky receiver
    └── PermissionUtils.kt       Permission checks
```

### Runtime permissions requested

| Permission | Why |
|---|---|
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | Core location stream |
| `ACCESS_BACKGROUND_LOCATION` (API 29+) | Tracking while app is backgrounded |
| `POST_NOTIFICATIONS` (API 33+) | Required for the foreground-service notification |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Prevents the OS from throttling updates on long deliveries |

## Troubleshooting

- **"Socket connect error: xhr poll error"** — the device can't reach the
  backend. Check `BuildConfig.SERVER_URL` and that the laptop firewall
  allows inbound TCP 3000.
- **Dashboard shows no runners** — open the browser dev tools network tab
  and confirm the WebSocket handshake to `/socket.io` succeeded with a 200.
- **Service stops after a few minutes** — disable battery optimization for
  the app (the app prompts for this on first start; some OEMs require
  additional "auto-start" toggles in their settings).
- **Login returns 401** — re-run `npm run seed` in the backend container.
