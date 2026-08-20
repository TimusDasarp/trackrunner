# TrackRunner Native iOS Starting Guide

This guide describes how to build a fully native iOS version of the existing TrackRunner React Native courier app using SwiftUI and Swift.

## 1. Create the Xcode Project

Choose **iOS > App** in Xcode, then use the following settings:

| Field | Value |
| --- | --- |
| Product Name | `TrackRunner` |
| Team | Your Apple Developer team, or `None` while prototyping |
| Organization Identifier | A reverse-domain identifier you own, such as `com.yourcompany` |
| Bundle Identifier | Generated as `com.yourcompany.TrackRunner` |
| Interface | `SwiftUI` |
| Language | `Swift` |
| Testing System | `Swift Testing` |
| Storage | `None` initially |
| Host in CloudKit | Off |

Do not use an organization identifier unless you control it. The bundle identifier should be chosen carefully because it is difficult to change after an App Store release.

Use a current iOS deployment target supported by your intended runner devices (iOS 17 or later is a sensible starting point for a new SwiftUI app).

## 2. What the App Must Do

The native app should preserve the existing runner workflow:

1. Authenticate a runner with `POST /api/auth/login`.
2. Store the JWT and runner profile securely on the device.
3. Load assigned tasks with `GET /api/tasks`.
4. Update task status and document collection with `PATCH /api/tasks/:id`.
5. Launch driving directions to a task destination.
6. Track delivery location in the foreground and background.
7. Buffer unsent locations offline, then synchronize them later.
8. Eventually receive live task updates and push notifications.

The first release should prioritize the runner's task workflow before advanced tracking and notification work.

## 3. Build Order

Implement the app in this order:

1. App shell and persisted login state.
2. Login screen and API authentication.
3. Secure token storage in Keychain.
4. Task list from the live backend.
5. Task detail and status/document updates.
6. Apple Maps navigation.
7. Foreground location capture.
8. Offline location queue and retry/sync.
9. Background location tracking.
10. Socket.IO real-time updates and push notifications.

This order ensures the central delivery workflow works before taking on iOS's more complex background-execution rules.

## 4. Suggested Project Structure

Create groups and files similar to this:

```text
TrackRunner/
├── App/
│   ├── TrackRunnerApp.swift
│   └── AppState.swift
├── Features/
│   ├── Auth/
│   │   └── LoginView.swift
│   └── Tasks/
│       ├── TaskListView.swift
│       ├── TaskDetailView.swift
│       └── TaskViewModel.swift
├── Models/
│   ├── User.swift
│   ├── AuthResponse.swift
│   ├── RunnerTask.swift
│   └── LocationPoint.swift
├── Services/
│   ├── APIClient.swift
│   ├── KeychainService.swift
│   ├── LocationManager.swift
│   ├── LocationSyncService.swift
│   ├── SocketService.swift
│   └── PushNotificationService.swift
└── Supporting/
    └── Config.xcconfig
```

Begin with these files only:

- `AppState.swift`
- `LoginView.swift`
- `TaskListView.swift`
- `User.swift`
- `RunnerTask.swift`
- `APIClient.swift`
- `KeychainService.swift`

## 5. First Working Milestone

The first milestone is:

```text
Open app → restore saved session or show login → sign in → show assigned tasks
→ update task state/document checklist → sign out
```

At this stage, `TaskListView` should display the fields already used by the React Native app:

- Client name
- Client address
- Client phone
- Notes
- Priority (`normal`, `high`, `urgent`, `low`)
- Status (`sent`, `acknowledged`, `in_progress`, `completed`, `unable_to_complete`)
- Destination latitude/longitude
- Documents to collect and whether each is collected

Port the current backend API contract before redesigning the data model.

## 6. Native iOS Technology Choices

| Existing capability | Native iOS choice |
| --- | --- |
| UI and navigation | SwiftUI and `NavigationStack` |
| REST networking | `URLSession` with `async`/`await` |
| Secure session storage | Keychain |
| Background GPS | Core Location / `CLLocationManager` |
| Offline queue | SwiftData or SQLite |
| Push notifications | UserNotifications + APNs (or Firebase Messaging, if retained) |
| Socket.IO live updates | `socket.io-client-swift` package |
| Maps navigation | MapKit / Apple Maps |

Use Swift Package Manager for packages. Avoid adding a dependency until it is needed.

## 7. API Configuration

Keep the API base URL out of source code. Add a `Supporting/Config.xcconfig` file:

```text
API_BASE_URL = https://your-api.example.com/api
```

Connect this configuration to the app target's build configurations, then read it through `Bundle.main.infoDictionary`. Use separate Development and Production configuration files when deploying.

Never store passwords, JWTs, or server secrets in `.xcconfig`, source code, or `Info.plist`.

## 8. Apple Maps Navigation

Use the task's destination coordinates when available; otherwise geocode its address. To launch driving directions in Apple Maps:

```swift
import MapKit

let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
item.name = task.clientName
item.openInMaps(launchOptions: [
    MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving
])
```

## 9. Location Tracking: Add After the Core Workflow

When task management is stable, implement `LocationManager` using `CLLocationManager`.

Configure the iOS target first:

1. Open **Signing & Capabilities**.
2. Add **Background Modes**.
3. Enable **Location updates**, **Background fetch**, and **Remote notifications** as required.
4. Add these `Info.plist` usage descriptions:

```text
NSLocationWhenInUseUsageDescription
TrackRunner uses your location while you are working on deliveries.

NSLocationAlwaysAndWhenInUseUsageDescription
TrackRunner uses your location during active deliveries so dispatch can follow progress when the app is not open.
```

Only request “Always” location access when a runner starts an active delivery/tracking session, and explain the benefit in context. Apple reviews background-location use closely.

During tracking:

- Use `allowsBackgroundLocationUpdates = true`.
- Capture an immediate foreground location once tracking starts.
- Save each point locally before considering it delivered.
- Upload queued points when the API is available.
- Keep a durable pending count for the runner UI.
- Stop tracking on logout and when an active shift/delivery ends.

iOS may defer or limit background work. Design synchronization to be reliable even when location callbacks are delayed or the network is unavailable.

## 10. Practical Next Action

After Xcode creates the project, replace the generated `ContentView` with an authenticated app shell:

```text
No stored token  → LoginView
Stored token     → TaskListView
```

Then implement the login request and Keychain persistence. Do not begin with background tracking.

## 11. Reference in This Repository

The current cross-platform runner implementation is in `react-native-app/`. Its main reference files are:

- `react-native-app/src/screens/LoginScreen.tsx`
- `react-native-app/src/screens/MainScreen.tsx`
- `react-native-app/src/services/api.ts`
- `react-native-app/src/services/locationTracking.ts`
- `react-native-app/src/types/index.ts`

They define the existing UI, API contract, task states, and tracking behavior that the native iOS app should initially match.
