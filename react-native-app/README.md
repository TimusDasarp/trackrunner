# TrackRunner courier app

The Expo courier client is the supported mobile application for iOS and Android. It stores the session in SecureStore, writes each sampled position to a local SQLite queue, and deletes queued records only after the staging API acknowledges their event IDs.

## Run against staging

1. Copy `.env.example` to `.env.local` and keep the staging API URL shown there.
2. From this folder run `npm start`.
3. Open the locally built app on a real device. Sign in with a `runner` account, then choose **Start Tracking** and grant foreground/background location access.

## Android release APK (no Metro required)

For a self-contained APK to install on a device, build the release variant rather than the development build:

```bash
npm run android:release
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

`npm run android` creates a development build and requires the Metro server to stay running.

The first device test should be performed while the dispatcher dashboard is open at https://trackrunner.pages.dev. Check that the runner appears there and that stopping the app or disabling the network increases the local pending count before it catches up.

## Important limits before a pilot

- Background tracking must be verified on physical Android and iOS devices; platform/OEM settings can defer updates.
- Do not add passwords, Supabase service keys, or the database URL to an `EXPO_PUBLIC_*` variable. Those values are included in the built app.
- The identifiers in `app.json` (`com.trackrunner.app`) must be available in Apple and Google developer accounts before store release.

## Local native builds

The `android/` and `ios/` projects are intentionally not ignored; add them to source control with the rest of this change. Build them on this machine; no EAS account or cloud build is required.

```bash
# Android: build and install on a connected emulator or device
npm run android

# Android: produce an installable debug APK
cd android
./gradlew assembleDebug

# iOS: build and run with Xcode on macOS
cd ..
npm run ios
```

The Android APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Android builds require a local JDK and Android SDK; iOS device builds require Xcode and Apple code signing.
