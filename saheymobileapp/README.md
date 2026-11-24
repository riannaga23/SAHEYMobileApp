# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

The app and distress emails use the **Halo** name. Configure the email sender with `HALO_FROM_EMAIL`; `HALO_EMAIL_HOST` and `HALO_EMAIL_PORT` configure the optional standalone server. Saved contacts and tap patterns are migrated automatically to `halo.*` storage keys. The previous storage keys and provider keys for existing incidents are retained only for upgrade compatibility. The native link scheme is now `halomobileapp`; rebuild the Android development app with `npm run android:build` to register it on an existing installation.

## Tapping pattern recording

Press **Begin wearable setup** to send `BEGIN SET UP` and start a new setup session. The Bluetooth service accepts tap counts only after that command write succeeds. Before then, `TAP` notifications are discarded before they update the shared wearable message or emit tap-count events; the screen also checks the shared recording gate. Opening or resetting the screen does not start a session.

Reset, leaving the screen, backgrounding, disconnecting, a failed command, and firmware completion all close the shared gate. A late command completion cannot re-arm a cancelled session. Notifications received during the command write are buffered until success so immediate first taps are retained. Firmware files are not included in this app project; the gate controls which received notifications the app records and displays.

## Confirmed distress email setup

The root listener automatically submits a **test email** when the selected wearable's HALO notification characteristic sends `CONFIRMEDDISTRESS` (also accepts spaces, underscores, hyphens, and letter case variations). It uses the Expo server's `/api/distress` route. No separate email server is required.

1. Copy `.env.example` to `.env.local` if needed, and configure `EXPO_PUBLIC_API_URL`, `RESEND_API_KEY`, and `HALO_FROM_EMAIL`. Save your recipients on the app's **Emergency Contacts** screen (up to 10 unique email addresses). Existing `.env.local` values should be preserved.
2. Use a URL reachable from the phone. On the same Wi-Fi, use your computer's LAN address and port `8083`. With USB, run `adb reverse tcp:8083 tcp:8083` and use `http://127.0.0.1:8083`. `10.0.2.2` is an Android emulator address; on physical devices the distress flow substitutes Expo's development host when available.
3. Fully restart Expo with `npm run android:email` (or `npm run start:ble` for a LAN development build), connect the wearable, and receive a confirmed distress signal. Keep the app active for this development flow.

Automatic distress emails go to **all emergency contacts saved on the phone**. Each new incident snapshots the latest saved contacts; retries keep that list unchanged, and the next incident picks up contact edits. No request is sent if there are no saved contacts or any saved address is invalid. The old `HALO_TEST_RECIPIENTS` and `HALO_TEST_EMAIL` settings are ignored; there is no fallback recipient. Never put the Resend key in an `EXPO_PUBLIC_` variable. The `onboarding@resend.dev` sender can only send to your Resend account address; configure a verified sender domain to send to other addresses.

Under **Location Sharing**, press **Share my location** to request a position and open the native share menu. Choose the recipient and messaging app there. Each press requests a new position, allowing up to 45 seconds for a high-accuracy GPS-assisted lookup and up to 60 seconds for the complete permission/location flow. Android may offer its location-accuracy settings dialog during this user-initiated lookup. Keep Halo open while it locates the phone. This longer manual lookup does not extend the distress-email capture deadline. The message contains approximate coordinates (rounded to three decimal places, or two for accuracy of 1 km or worse), a Google Maps link using those same rounded coordinates, acquisition time, and phone-reported accuracy. Opening this screen does not obtain or share a position. Cancelling the share menu does not claim the message was sent.

Confirmed distress emails independently request the phone's location; manually sharing first is not required. Allow foreground location permission and enable location services. The flow requests a balanced-accuracy fix for up to eight seconds. If that fails, it tries a last-known position no older than one minute with reported accuracy within 1 km, and explicitly labels this fallback as a recent location. The entire permission/services/location flow is limited to 12 seconds. Each email contains coordinates, acquisition time, reported accuracy when available, and a Google Maps link, or a location-unavailable section explaining the reason. The app also displays the reason. Location and recipients are captured once per incident and remain identical during retries; each new incident requests another position. These are location snapshots, not live tracking.

The server acknowledges which location section was included in the accepted email. The app only confirms inclusion when that acknowledgement matches the incident. An older server response shows a location-inclusion warning without resending an already accepted email. Restart **both the standalone email server and Expo** after changes to their code. The standalone adapter's `GET /health` returns `service: halo-distress-email` and `locationReportingVersion: 1`; this endpoint sends no email. If an email has no location section at all, check that the running server was started from this repository with the updated code.

Repeated notifications from one device within 60 seconds share an incident. The client retries transient failures up to three times with timeouts and an unchanged event ID. The server shares concurrent requests, caches confirmed acceptance, and sends the same provider idempotency key and email body on retries. Multiple contacts receive separate messages in one batch. The recipient list is included in the incident fingerprint, so the same event ID cannot be reused for another contact list. The server also limits new incidents to one per minute; rejected operations release that limit. The screen and alert distinguish provider acceptance from confirmed inbox delivery.

For the optional standalone adapter, run `npm run email:server` and set `EXPO_PUBLIC_DISTRESS_EMAIL_URL` to its full `/distress` URL. It defaults to `127.0.0.1:8787`; use `adb reverse tcp:8787 tcp:8787` for USB, or explicitly set `HALO_EMAIL_HOST=0.0.0.0` for LAN access. Use only a trusted development network. This adapter and the Expo route use the same validation and sending code.

If a distress request returns `Not found` or HTTP 404 from Expo, fully restart Expo so it registers `/api/distress`, or use the standalone adapter. For USB, set `EXPO_PUBLIC_API_URL=http://127.0.0.1:8083` and `EXPO_PUBLIC_DISTRESS_EMAIL_URL=http://127.0.0.1:8787/distress`, then restart Expo and run `npm run email:server` in a second terminal. Each `.env.local` assignment must contain the variable name once followed by `=` and the URL. The app reports HTTP errors and unexpected text/HTML responses without exposing JSON parser errors or claiming delivery succeeded.

This remains a development test: production requests are rejected. It does not authenticate users/devices, persist pending incidents across app restarts, run a background BLE service, or track delivered/bounced webhooks. Those capabilities are required before treating it as a production emergency notification service. Duplicate detection without firmware incident IDs uses a 60-second window, so a separate signal from the same device within that window is treated as a repeat.

Run `npm test` and `npm run typecheck` to verify the flow with mocked provider responses; the tests do not send real email.

The app screens contain only wearable setup, tapping-pattern recording, emergency contacts, location access/sharing, and alert status. Distress simulation, email previews, manual test email controls and their API route, raw Bluetooth/GPS displays, and the starter Explore route have been removed. Technical transport errors remain available internally while the UI presents plain-language guidance. The home screen identifies the existing email test mode. Expo's development-client menu is supplied by the development build; use a release build when preparing a production app, together with a production-ready alert backend.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
