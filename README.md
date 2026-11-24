# Halo — Wearable Safety Companion

Halo is a wearable safety system consisting of a Bluetooth-enabled bracelet and an Android mobile application.

The bracelet communicates with the Halo app using Bluetooth Low Energy (BLE). Users can connect their wearable, configure a tapping pattern, manage emergency contacts, and receive alerts when the bracelet detects a confirmed distress signal.

Halo is currently a **development prototype**, not a production-ready emergency response system. Do not rely on it as your only means of contacting emergency services.

---

# 1. Getting Started — Beginner Setup Guide

**If you've never developed a mobile app before, start here!**

This section explains everything you need to install and run Halo on a Windows computer and Android phone.

## What you'll need

Before starting, make sure you have:

- A Windows computer
- An Android phone (preferably Android 12 or newer)
- A USB cable that supports data transfer
- The Halo wearable, if testing Bluetooth
- An internet connection
- Access to the Halo GitHub repository

You will also need three free development tools:

| Tool | Purpose | Download |
|---|---|---|
| Node.js (LTS) | Runs the JavaScript development tools | https://nodejs.org |
| Git | Downloads and updates the project | https://git-scm.com/downloads |
| Android Studio | Provides Android development tools, including ADB | https://developer.android.com/studio |

**Important:** Halo uses native Bluetooth functionality and requires an Android development build. It will not work fully inside Expo Go.

## Step 1: Install Node.js

1. Open https://nodejs.org.
2. Download the **LTS** version for Windows.
3. Run the installer.
4. Accept the default installation options.
5. Close and reopen PowerShell after installation.

To verify the installation, open PowerShell and run:

```powershell
node --version
npm --version
```

Both commands should display version numbers.

If PowerShell says a command isn't recognized, restart your terminal and verify Node.js was installed successfully.

## Step 2: Install Git

1. Open https://git-scm.com/downloads.
2. Download Git for Windows.
3. Run the installer using the default options.
4. Open a new PowerShell terminal.

Check that Git works:

```powershell
git --version
```

You should see a Git version number.

## Step 3: Install Android Studio

1. Open https://developer.android.com/studio.
2. Download Android Studio.
3. Run the installer.
4. Make sure the **Android SDK** and **Android SDK Platform-Tools** are installed.
5. Complete the initial Android Studio setup.

Android Studio provides the tools needed to build Android apps and communicate with a phone using USB.

For this project, the important tool is **ADB (Android Debug Bridge)**.

Verify it using PowerShell:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" version
```

If the command fails, open Android Studio → **SDK Manager** and check where the Android SDK is installed.

## Step 4: Download the Halo project

Open PowerShell and choose a short directory for the project.

For example:

```powershell
cd C:\
```

Clone the GitHub repository:

```powershell
git clone https://github.com/riannaga23/SAHEYMobileApp.git
```

Navigate into the Expo application:

```powershell
cd C:\SAHEYMobileApp\saheymobileapp
```

**Important:** Run the remaining development commands from this `saheymobileapp` directory, where the application's `package.json` is located.

If you already downloaded the repository, don't clone it again. Open the existing folder instead.

To update an existing clone:

```powershell
git pull --ff-only origin main
```

Only run this when you are on `main` and have no uncommitted changes. If Git reports local changes or a merge problem, stop and ask a project maintainer before overwriting anything.

## Step 5: Install the project dependencies

In the application directory, run:

```powershell
npm install
```

This installs the JavaScript libraries required by Halo.

The installation may take several minutes.

You should now see a `node_modules` directory.

Do not manually edit this directory or commit it to GitHub.

## Step 6: Enable USB debugging on your Android phone

On your Android phone:

1. Open **Settings**.
2. Find **About phone**.
3. Tap **Build number** seven times to enable Developer Options.
4. Return to Settings.
5. Find **Developer options** (often under System).
6. Enable **USB debugging**.
7. Connect your phone to your computer using a USB cable.
8. Accept the **Allow USB debugging?** prompt on your phone.

The exact settings menu may vary by Android manufacturer.

## Step 7: Verify the phone is connected

Open PowerShell and run:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

& $adb devices
```

Expected output:

```text
List of devices attached
YOUR_DEVICE_ID    device
```

Your device ID will be different.

If you see `unauthorized`, unlock your phone and approve the debugging request.

If multiple devices appear, note your physical phone's device ID. You'll need to specify it when using ADB commands.

## Step 8: Build and install Halo on the phone

Halo uses native Android Bluetooth functionality, so it needs a development build.

If you have never installed Halo on this phone, or if the native application configuration has changed, run:

```powershell
npm run android:build
```

This command is intended to build and install the Android development application using the project's configured build script.

If the script reports that Android SDK components, a Java Development Kit, or another build tool is missing, follow the error message and verify your Android Studio setup.

**Note:** The project's native link scheme has changed to `halomobileapp`. Existing installations may need rebuilding to register this scheme.

If a working, compatible Halo development build is already installed, you can usually skip this step and start Metro instead.

## Step 9: Configure USB communication

In PowerShell:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

& $adb reverse tcp:8083 tcp:8083
```

This forwards port 8083 from your Android device to your computer.

If multiple Android devices are connected, specify your device ID:

```powershell
& $adb -s YOUR_DEVICE_ID reverse tcp:8083 tcp:8083
```

Port 8083 is used by the Expo development server in this project.

## Step 10: Start the Halo application

Open a PowerShell terminal in the application directory:

```powershell
cd C:\SAHEYMobileApp\saheymobileapp
```

Start the development server:

```powershell
npm run android:email
```

This is the project's documented email-enabled development command. Use it when testing the Expo API route.

For a LAN-based development build, the project also documents:

```powershell
npm run start:ble
```

Keep the terminal running while using Halo.

Metro should display a development-server address and instructions for opening the app.

You can also use the standard Expo CLI directly when you only need to start Metro:

```powershell
npx expo start --dev-client --localhost --port 8083 --clear
```

The standard Expo command alone does not guarantee that the email API route and server credentials are configured. See the email section below.

### Open Halo on the phone

Find the Halo application on your phone and tap it.

If the application does not open automatically, run:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

& $adb shell monkey -p com.halo.companion -c android.intent.category.LAUNCHER 1
```

If more than one Android device is connected, include `-s YOUR_DEVICE_ID` before `shell`.

The Halo homepage should appear.

**Congratulations — you've launched the Halo app!**

---

# 2. How to Use Halo

## Connecting the wearable

1. Turn on Bluetooth on your Android phone.
2. Power on the Halo wearable.
3. Open the Halo application.
4. Select **Wearable Connection**.
5. Scan for available Bluetooth devices.
6. Select the Halo wearable.
7. Wait for the application to confirm the connection.

The wearable must be powered on and within Bluetooth range.

If the wearable does not appear, check Bluetooth permissions, the wearable's power, and whether it is already connected elsewhere.

## Setting a tapping pattern

The tapping-pattern feature lets users configure a pattern using the physical bracelet.

1. Open **Tapping Pattern**.
2. Make sure the wearable is connected.
3. Press **Begin wearable setup**.
4. The app sends the `BEGIN SET UP` command to the bracelet.
5. Start tapping the bracelet.
6. The app records incoming taps during the active setup session.
7. Follow the on-screen instructions to complete and save the pattern.

**Important:** The app must not count taps before **Begin wearable setup** has been pressed and the Bluetooth command has succeeded.

The recording session also ends when the user resets or leaves the screen, the app backgrounds, the wearable disconnects, setup fails, or the firmware confirms completion.

Taps received outside an active recording session should not update the displayed tap counter.

## Setting emergency contacts

1. Open **Emergency Contacts**.
2. Enter a contact name and valid email address.
3. Save the contact.
4. Repeat for additional contacts if needed.

Halo supports up to **10 unique emergency-contact email addresses**.

For testing, use only your own email address or recipients who have agreed to participate.

Contacts are stored locally on the phone using the app's storage system.

## Location Sharing

Halo can access the phone's location to include a location snapshot in distress emails.

1. Open **Location Sharing**.
2. Enable location services on the phone.
3. Grant Halo foreground location permission when prompted.
4. Select **Share My Location** to test location access.

The automatic distress flow requests a fresh location separately from this screen.

When available, email alerts can include:

- Latitude and longitude
- GPS acquisition timestamp
- Reported location accuracy
- Google Maps link

If location access fails, the email can still be sent with an explanation that location is unavailable.

Location information is a snapshot near the distress event, not continuous live tracking.

---

# 3. Setting Up Emergency Emails

**This section is primarily for the project maintainers.**

You do not need to configure Resend just to browse Halo's screens or test the Bluetooth connection.

To test actual automatic email delivery, the project needs a Resend API key, a verified sending domain, and a running email backend.

## How distress emails work

When the connected wearable sends a valid `CONFIRMEDDISTRESS` notification:

1. The BLE service validates the incoming message.
2. The app emits a confirmed distress event.
3. The global listener displays the emergency notification.
4. The app loads the saved emergency contacts.
5. The app attempts to obtain a fresh location snapshot.
6. The app submits the incident to the configured email backend.
7. The backend validates the request and sends it to Resend.
8. Resend reports whether it accepted the email submission.

The app distinguishes provider acceptance from actual inbox delivery.

## Step 1: Create the environment configuration

In the application directory, create `.env.local`.

If `.env.example` is available, copy it:

```powershell
Copy-Item .env.example .env.local
```

**Do not overwrite an existing `.env.local` file.** It may contain valid local configuration.

Set the required environment variables.

For the Expo email API route using USB:

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8083
RESEND_API_KEY=YOUR_PRIVATE_RESEND_API_KEY
HALO_FROM_EMAIL="Halo <alerts@halosafetyapp.com>"
```

The sender domain must be verified in Resend.

The example sender above uses the project's `halosafetyapp.com` domain; it only works with an appropriately configured Resend account.

**Never commit `.env.local` or your Resend API key to GitHub.**

Never prefix the Resend key with `EXPO_PUBLIC_`, because public Expo environment variables can be included in the mobile application bundle.

## Step 2: Start the Expo email backend

For the integrated Expo API route:

```powershell
npm run android:email
```

The documented API endpoint is:

```text
http://127.0.0.1:8083/api/distress
```

For a physical phone connected using USB:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

& $adb reverse tcp:8083 tcp:8083
```

A physical phone cannot use the Android emulator address `10.0.2.2` directly.

## Alternative: Standalone Email Server

The project also supports an optional standalone email adapter.

Use this if you're developing or debugging the email backend separately from the Expo route.

Configure:

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8083
EXPO_PUBLIC_DISTRESS_EMAIL_URL=http://127.0.0.1:8787/distress
RESEND_API_KEY=YOUR_PRIVATE_RESEND_API_KEY
HALO_FROM_EMAIL="Halo <alerts@halosafetyapp.com>"
```

Start the backend in a separate PowerShell terminal:

```powershell
npm run email:server
```

Then configure USB port forwarding:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

& $adb reverse tcp:8787 tcp:8787
```

The standalone server defaults to `127.0.0.1:8787`.

`HALO_EMAIL_HOST` and `HALO_EMAIL_PORT` can customize its binding address and port. Binding to `0.0.0.0` exposes it to the local network, so use that only on a trusted development network.

**Use one email routing method at a time.** The standalone override should point to the complete `/distress` URL; the integrated Expo setup uses `/api/distress`.

After changing environment variables, restart the relevant server and Metro.

## Testing email delivery

1. Save your own email address as an emergency contact.
2. Confirm that your sender domain is verified in Resend.
3. Connect the wearable.
4. Make sure tapping-pattern setup is not active.
5. Trigger a controlled confirmed distress signal.
6. Check the Halo alert.
7. Check the server logs.
8. Check Resend's sent-email dashboard.
9. Check your inbox and spam folder.

Resend dashboard: https://resend.com/emails

Only add other test recipients with their permission.

Repeated distress notifications from one wearable within 60 seconds are treated as the same incident for duplicate suppression.

This is still a development test. Do not simulate distress to actual emergency contacts without their consent.

---

# 4. Testing the Application

Before submitting code changes, run the project's automated checks.

From the application directory:

```powershell
npm run typecheck
```

Then:

```powershell
npm test
```

These checks cover TypeScript correctness and the project's configured automated tests.

The tests use mocked provider responses. They do not actually deliver emails through Resend.

For physical-device testing, separately verify Bluetooth notifications, tapping-pattern setup, location permissions, and email delivery.

---

# 5. Troubleshooting

## ADB is not recognized

Use its full path:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

## Multiple Android devices are connected

List the available devices:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

Then use `-s YOUR_DEVICE_ID` for subsequent commands.

## Halo cannot connect to Metro

Confirm Metro is running.

Then run:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

& $adb reverse tcp:8083 tcp:8083
```

Restart or reload the development app.

If the problem persists, restart Metro:

```powershell
npx expo start --dev-client --localhost --port 8083 --clear
```

## Code changes don't appear on the phone

Make sure you're editing the same project folder that Metro is running from.

Avoid maintaining multiple unsynchronized copies of Halo.

JavaScript and TypeScript changes generally reload through Metro. Native configuration changes may require another Android build.

## Bluetooth device isn't found

Verify that:

- Bluetooth is enabled.
- The wearable is powered on.
- Necessary Android Bluetooth permissions are granted.
- The phone is using a native development build rather than Expo Go.

## Tap count changes before setup begins

This is not expected.

The intended behavior is for tap counting to begin only after the app successfully sends `BEGIN SET UP`.

If this issue occurs, collect the BLE logs and report it to the project maintainer.

## Location Error

Verify:

- Phone location services are enabled.
- Halo has location permission.
- The device can obtain GPS coordinates.

Try testing outdoors or near a window if GPS acquisition is unreliable.

The automatic email flow should still send when a location snapshot cannot be obtained.

## Email says “Not Found” or returns HTTP 404

Check the configured API endpoint.

For the integrated Expo API route:

```text
http://127.0.0.1:8083/api/distress
```

For the standalone backend:

```text
http://127.0.0.1:8787/distress
```

These endpoints are not interchangeable.

Restart the appropriate server after changing the configuration.

## Email server reports missing credentials

Verify that `.env.local` contains:

```env
RESEND_API_KEY=...
HALO_FROM_EMAIL=...
```

Check that the server process is loading those values.

## Email is rejected by Resend

Verify that:

- The API key is valid.
- The sender domain is verified.
- Saved recipients have valid email addresses.
- The Resend dashboard shows no provider validation errors.

The default `onboarding@resend.dev` testing sender is restricted. Use a verified sender domain for sending to other recipients.

## Port already in use

Another development server may already be running.

For port 8787:

```powershell
Get-NetTCPConnection -LocalPort 8787 -State Listen |
  Select-Object LocalPort, OwningProcess
```

Identify the process before stopping it.

---

# 6. Project Structure

```text
SAHEYMobileApp/
└── saheymobileapp/
    ├── src/
    │   ├── app/             # Application screens and routes
    │   ├── components/      # Reusable interface components
    │   ├── hooks/           # React hooks
    │   ├── lib/             # BLE, contacts, alerts and storage
    │   └── server/          # Email backend logic
    ├── scripts/             # Development scripts and tests
    ├── package.json         # Dependencies and commands
    ├── .env.example         # Example configuration, if provided
    └── README.md            # This documentation
```

Expo Router is used for file-based navigation.

The Bluetooth implementation communicates with the Halo wearable using the React Native BLE native module.

---

# 7. Contributing to Halo

If you're working with other developers:

1. Pull the latest changes before beginning work.
2. Create a new Git branch for your feature.
3. Make changes in the Git-connected project directory.
4. Run the automated tests.
5. Commit your changes.
6. Push your branch to GitHub.
7. Open a pull request for review.

Example:

```powershell
git switch main
git pull --ff-only origin main

git switch -c feature/my-change
```

After making and testing changes:

```powershell
git add .
git commit -m "Describe the change"
git push -u origin feature/my-change
```

Before using `git add .`, inspect `git status` to ensure you aren't accidentally including secrets, local settings, or generated files.

Do not share private API keys through GitHub.

---

# 8. Current Development Limitations

Halo is an experimental university project.

The current implementation does not provide:

- Production-ready authentication of users or wearable devices
- Guaranteed emergency-message delivery
- Persistent pending incidents across app restarts
- A background BLE service that reliably operates when the app is closed
- Production delivery/bounce tracking through provider webhooks
- Continuous live location tracking

The app currently uses a development-only email workflow.

Do not use Halo as a replacement for emergency services.

---

# Additional Resources

- Expo: https://docs.expo.dev
- React Native: https://reactnative.dev
- Android Studio: https://developer.android.com/studio
- Git: https://git-scm.com/doc
- Resend: https://resend.com/docs
- GitHub repository: https://github.com/riannaga23/SAHEYMobileApp

**Halo — Wearable safety technology in development.**
