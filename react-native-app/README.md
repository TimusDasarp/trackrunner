# TrackRunner courier app

The Expo courier client is the supported mobile application for iOS and Android. It stores the session in SecureStore, writes each sampled position to a local SQLite queue, and deletes queued records only after the staging API acknowledges their event IDs.

## Run against staging

1. Copy `.env.example` to `.env.local` and keep the staging API URL shown there.
2. From this folder run `npm start`.
3. Open it in Expo Go on a real device. Sign in with a `runner` account, then choose **Start Tracking** and grant foreground/background location access.

The first device test should be performed while the dispatcher dashboard is open at https://trackrunner.pages.dev. Check that the runner appears there and that stopping the app or disabling the network increases the local pending count before it catches up.

## Important limits before a pilot

- Expo Go is suitable for initial foreground checks. Background tracking must be verified on physical Android and iOS devices; platform/OEM settings can defer updates.
- Do not add passwords, Supabase service keys, or the database URL to an `EXPO_PUBLIC_*` variable. Those values are included in the built app.
- Before an internal build, create/link the project in **your** Expo account using `eas init`; the previous inherited EAS project link was intentionally removed.
- The identifiers in `app.json` (`com.trackrunner.app`) must be available in Apple and Google developer accounts before store release.

## Android APK for direct testing

Use the EAS `preview` profile for an installable Android APK rather than Expo Go:

```bash
npx eas-cli@latest build --platform android --profile preview
```

The build is uploaded to Expo, then the resulting link can be opened on an Android device to download and install the APK. Android may ask you to allow installs from the browser used to open that link. This is for internal testing only, not Play Store distribution.
