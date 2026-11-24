# Halo — macOS Setup and Testing Guide

**For Mac users developing and testing the Halo Android companion app**  
**Project:** [riannaga23/SAHEYMobileApp](https://github.com/riannaga23/SAHEYMobileApp)  
**App directory:** `SAHEYMobileApp/saheymobileapp`

> **Important:** Halo is a development prototype, **not** an emergency response service. Use consenting test recipients. The steps below build the **Android app on macOS** and run it on a physical Android phone; they are **not** instructions to use a Mac as the phone or to build the BLE-enabled Android app inside Expo Go.

## Before you begin

You need:

- A Mac (Apple silicon or Intel) with administrator access and enough free space for Android Studio and the Android SDK.
- A physical **Android phone**, ideally Android 12 or newer.
- A **USB data cable** connecting the Android phone to the Mac.
- The Halo bracelet, for Bluetooth and distress testing.
- Internet access, access to the project's GitHub repository, and (for email testing) a maintainer-provided **individual** Resend API key or other approved server configuration.

**Every command labeled Terminal below is for macOS Terminal (zsh)**, not Windows PowerShell. Open Terminal using **Applications → Utilities → Terminal**, or press `Command + Space` and search for Terminal.

> **Do not share an existing private Resend API key with teammates via chat, screenshots, or GitHub.** Have a project maintainer issue a separate scoped/revocable key where possible. The private key belongs in the local `.env.local` file only.

---

## Part 1 — First-time Mac installation

### Step 1 — Install Apple's command-line developer tools and Git

Open **Terminal** and enter:

```bash
xcode-select --install
```

If macOS says the tools are already installed, continue. Verify Git:

```bash
git --version
```

A version number means Git is ready. You can also install Git separately from [git-scm.com](https://git-scm.com/downloads/mac) if needed.

### Step 2 — Install Node.js (LTS) and npm

Go to [nodejs.org](https://nodejs.org/) and download the **macOS LTS installer** for your Mac's processor. Install it, then **close and reopen Terminal**.

Check both commands:

```bash
node --version
npm --version
```

Both must print version numbers. Use a current LTS version supporting `node --env-file` (Node 20.6+; current LTS recommended). **Do not type `npm install` until you have entered the app directory in Step 5.**

### Step 3 — Install and configure Android Studio

1. Download **Android Studio for Mac** from [developer.android.com/studio](https://developer.android.com/studio).
2. Move Android Studio to **Applications** and open it.
3. Complete the **Setup Wizard** and install the recommended **Android SDK**, **SDK Platform-Tools**, **SDK Build-Tools**, and an Android SDK Platform.
4. In Android Studio, open **Settings/Preferences → Languages & Frameworks → Android SDK** (or use **More Actions → SDK Manager** on the Welcome screen).
5. Look at the **Android SDK Location** at the top. The usual macOS location is:

   ```text
   /Users/YOUR_MAC_USERNAME/Library/Android/sdk
   ```

6. Use **Android Studio's bundled JDK** when prompted by Gradle. If a build reports an unsupported Java version, check the required JDK version in the error and the project's Gradle configuration rather than installing Java versions at random.

### Step 4 — Make ADB available in Terminal

Run:

```bash
echo 'export ANDROID_HOME="$HOME/Library/Android/sdk"' >> ~/.zshrc
echo 'export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"' >> ~/.zshrc
source ~/.zshrc
adb version
```

**Expected:** `Android Debug Bridge version ...`

If `adb: command not found`, check the SDK Location from Step 3. For example, directly test the default path:

```bash
"$HOME/Library/Android/sdk/platform-tools/adb" version
```

If that works, review your `~/.zshrc` PATH settings. If the SDK is installed at a different location, replace the `ANDROID_HOME` path with the actual SDK location. These steps assume the default zsh shell and the default Android SDK location.

---

## Part 2 — Get the Halo source code

### Step 5 — Clone the repository and enter the correct folder

Choose a location, such as your home directory, and clone the project:

```bash
cd ~
git clone https://github.com/riannaga23/SAHEYMobileApp.git
cd SAHEYMobileApp/saheymobileapp
```

**This second `cd` is essential.** The repository contains a nested Expo application; `package.json` is inside `saheymobileapp`, not the top-level repository directory.

Verify your location:

```bash
pwd
ls -l package.json
```

**Expected:** `ls` displays `package.json`. If it says `No such file or directory`, stop and run:

```bash
cd ~/SAHEYMobileApp/saheymobileapp
ls package.json
```

If you cloned the repository to another folder, navigate to **that** copy instead. Do not clone again unnecessarily.

For an already-cloned repository, update it only if you're on `main` with no local changes:

```bash
cd ~/SAHEYMobileApp
git status
git switch main
git pull --ff-only origin main
cd saheymobileapp
```

If Git reports local changes, conflicts, or an unrecognized branch, stop and ask a project maintainer before resetting or overwriting files.

### Step 6 — Install the JavaScript dependencies

Stay in the directory that contains `package.json`, then run:

```bash
npm install
```

This creates a local `node_modules` folder. Do not edit `node_modules` or commit it to GitHub.

Optional sanity checks:

```bash
npm run typecheck
npm test
```

The automated tests use mock email-provider responses and **do not send real emails**.

---

## Part 3 — Set up the Android phone and build Halo

### Step 7 — Turn on Developer options and USB debugging

On the **Android phone**:

1. Open **Settings → About phone**.
2. Tap **Build number** seven times (exact location varies by phone manufacturer).
3. Go back to **Settings → System → Developer options** (or search Settings for “Developer options”).
4. Enable **USB debugging**.
5. Connect the phone to the Mac with a **data-capable USB cable**.
6. Unlock the phone, and tap **Allow** on the **Allow USB debugging?** dialog. If offered, select **Always allow from this computer** for your own trusted Mac.

Verify on the Mac:

```bash
adb devices
```

Example output:

```text
List of devices attached
ABC123456789    device
```

- `device`: ready.
- `unauthorized`: unlock the phone and approve the prompt; retry `adb devices`.
- Blank device list: check the data cable, USB connection mode, USB debugging, and Android Studio's Platform-Tools installation.
- More than one device: note the physical phone's serial number and use `adb -s YOUR_DEVICE_SERIAL ...` for later commands.

### Step 8 — Create your private environment file

From the app directory:

```bash
cd ~/SAHEYMobileApp/saheymobileapp
```

If `.env.local` does **not** exist yet, copy the template:

```bash
if [ ! -f .env.local ]; then cp .env.example .env.local; fi
```

Open it in the Mac's default text editor:

```bash
open -e .env.local
```

For **USB testing with the integrated Expo email endpoint**, edit the entries to resemble:

```dotenv
EXPO_PUBLIC_API_URL=http://127.0.0.1:8083
RESEND_API_KEY=YOUR_OWN_PRIVATE_RESEND_KEY
HALO_FROM_EMAIL="Halo <alerts@halosafetyapp.com>"
```

**Replace the placeholder key** with a valid key granted by the project's maintainer. The example sender address works only if its domain is verified in the Resend account associated with that key. If you do not have approved email-backend credentials, you can still build the app and explore its screens and BLE features, but **real distress emails will not work**.

**Security:**

- Never commit `.env.local` or put API keys in screenshots, chat, the README, or source files.
- Never name a secret `EXPO_PUBLIC_RESEND_API_KEY`; `EXPO_PUBLIC_` variables can be bundled into the client application.
- `EXPO_PUBLIC_API_URL` points to a server, **not** to a key.
- Do not set `EXPO_PUBLIC_DISTRESS_EMAIL_URL` for this **integrated** setup. If it was added previously, comment out or remove that line so the app uses `/api/distress`.
- The old `HALO_TEST_RECIPIENTS` and `HALO_TEST_EMAIL` variables are no longer used; recipients are stored on the **Emergency Contacts** screen.

Check that Git ignores the file **without printing its contents**:

```bash
git check-ignore -v .env.local
```

You should see an ignore-rule match. You may also run `git ls-files -- .env.local`; expected result is **no output**.

### Step 9 — Build and install Halo's native Android development app

From `SAHEYMobileApp/saheymobileapp`:

```bash
npm run android:build
```

This uses the project's actual build script to produce and install an Android **development build** on a connected physical device. Choose the correct device if prompted, and keep the phone unlocked to accept installation requests.

**Why build first?** Halo uses `react-native-ble-manager` for native Bluetooth Low Energy communication. **Expo Go is insufficient**. The app's current native URL scheme is `halomobileapp`, so an older installed development build may need rebuilding.

If Gradle or Android Studio reports a missing SDK, JDK, or license agreement, resolve that issue in Android Studio before retrying. If you see **“Unable to resolve intent”** after trying to launch with Expo, it typically means there is no compatible Android development build installed, it is installed under a different package ID, or the old native link scheme is still installed. Complete this build step before starting Metro again.

### Step 10 — Forward the Expo development server's USB port

Run in Terminal:

```bash
adb reverse tcp:8083 tcp:8083
```

For multiple devices:

```bash
adb -s YOUR_DEVICE_SERIAL reverse tcp:8083 tcp:8083
```

To inspect active forwarding:

```bash
adb reverse --list
```

The important entry forwards `tcp:8083` on the **Android phone** to `tcp:8083` on the **Mac**, so the phone can reach `http://127.0.0.1:8083`.

**Mac syntax note:** Use `adb reverse ...` directly. Do **not** type the Windows PowerShell form `& $adb reverse ...` in macOS Terminal.

### Step 11 — Start Halo with email-enabled Expo

Open a **new Terminal window** (leave any running build process alone until it exits). Enter:

```bash
cd ~/SAHEYMobileApp/saheymobileapp
npm run android:email
```

This is the project's standard email-enabled startup script. It loads `.env.local` server settings and starts Expo on **port 8083**.

Keep this Terminal window running while testing. Wait for Metro/Expo to start and for the app to connect.

**Important:** If the Expo CLI displays a prompt such as **`Press a to open Android`**, do **not** rely on that shortcut until the compatible development build is installed. On some Macs it can fail with **“Activity not started, unable to resolve intent.”** Instead, launch the already installed app manually as described in Step 12.

If you change `.env.local`, stop Expo with `Control + C` and **start it again**. Reloading the JavaScript bundle alone may not reload server-only email credentials.

### Step 12 — Open Halo directly on the phone

**Simplest option:** Find **Halo** in the Android app drawer and tap it. If it opens the Expo development-client screen, select the locally running development server. With USB forwarding in place, it should connect.

If it does not launch, try this in a **second Terminal window**:

```bash
adb shell monkey -p com.halo.companion -c android.intent.category.LAUNCHER 1
```

For multiple devices:

```bash
adb -s YOUR_DEVICE_SERIAL shell monkey -p com.halo.companion -c android.intent.category.LAUNCHER 1
```

This uses Android's normal launcher activity rather than relying on Expo's deep-link intent. It will work only if the expected Android app package is installed.

Verify the package exists:

```bash
adb shell pm list packages | grep com.halo.companion
```

Expected: `package:com.halo.companion`. If nothing appears, return to Step 9 and build/install Halo.

**Do not shut down the Expo Terminal window** while using the app; the development build needs its running development server.

---

## Part 4 — Test the Halo features

### Step 13 — Connect the wearable over BLE

1. Turn on Bluetooth on the Android phone.
2. Power on the Halo wearable and keep it nearby.
3. Open Halo → **Wearable Connection**.
4. Approve any Android Bluetooth permissions requested by Halo.
5. Scan and select the Halo wearable.
6. Confirm the connection before testing other bracelet features.

If the wearable does not appear, verify that it is powered, advertising, in range, and not already connected to another device. The project requires a native development build, not Expo Go.

### Step 14 — Test tapping-pattern recording

1. Open **Tapping Pattern**.
2. Confirm the bracelet is connected.
3. Before pressing anything, verify taps do **not** increase the app's tap count.
4. Press **Begin wearable setup**.
5. Wait until the `BEGIN SET UP` Bluetooth write succeeds.
6. Tap the wearable and confirm the app records the taps.
7. Follow the on-screen instructions to complete the pattern.
8. Verify that resetting, leaving the screen, backgrounding the app, disconnecting, or finishing setup stops further tap recording.

The app intentionally ignores tap notifications outside an active setup session.

### Step 15 — Save a test emergency contact

1. Open **Emergency Contacts**.
2. Add **your own email address**, or a recipient who expressly agrees to testing.
3. Save it.
4. You can add up to **10 unique addresses**.

The application reads these contacts for distress emails. Editing `.env.local` test-recipient variables will **not** replace these saved contacts.

### Step 16 — Check location permissions

1. Turn on Android **Location Services**.
2. Open Halo → **Location Sharing**.
3. Allow foreground location access when asked.
4. Tap **Share my location** to request a fresh location and open Android's native share menu.
5. Cancel the share menu if you're only testing permission. A canceled share is **not** a sent message.

The automatic distress-email flow obtains its **own** location snapshot; users do not have to share manually first. It includes location information when available, or explains why location could not be acquired. This is **not live tracking**.

### Step 17 — Perform a controlled distress-email test

Only test with recipients who consented:

1. Keep the Mac's `npm run android:email` server running.
2. Keep the Android phone connected over USB and verify `adb reverse tcp:8083 tcp:8083` is active.
3. Confirm `.env.local` has a valid **Resend key** and a sender from a domain verified in that Resend account.
4. Confirm at least one valid address is saved under **Emergency Contacts**.
5. Connect the wearable in Halo.
6. Make sure tapping-pattern setup is **not** active.
7. Trigger a **controlled** confirmed-distress notification using the team's approved test method. The app listens for `CONFIRMEDDISTRESS` (with supported spelling separators/case variations).
8. Observe the app's alert status and the Expo Terminal logs.
9. Check the [Resend sent-email dashboard](https://resend.com/emails) and the recipient's inbox/spam folder.

A Resend “accepted” status does **not** guarantee inbox delivery. Repeated signals from the same device within **60 seconds** may be treated as the same incident and deduplicated; do not mistake that behavior for a broken send button.

---

## Part 5 — Alternative: Standalone email server (advanced)

**Use this section only if the integrated `/api/distress` route is unavailable or a maintainer asks you to debug the email backend separately.** Most Mac testers should use **Steps 8–17** instead.

In `.env.local`, use these values for **USB-connected** Android testing:

```dotenv
EXPO_PUBLIC_API_URL=http://127.0.0.1:8083
EXPO_PUBLIC_DISTRESS_EMAIL_URL=http://127.0.0.1:8787/distress
RESEND_API_KEY=YOUR_OWN_PRIVATE_RESEND_KEY
HALO_FROM_EMAIL="Halo <alerts@halosafetyapp.com>"
```

Start the standalone email server in **Terminal window A**:

```bash
cd ~/SAHEYMobileApp/saheymobileapp
npm run email:server
```

Leave it running. This runs the correct package script, which loads `.env.local` and starts `scripts/distress-email-server.cjs`. **Do not run** `npm run node --env-file=...` (invalid npm script syntax), and do not misspell `scripts` as `sccripts`.

Check the standalone service in another Terminal:

```bash
curl http://127.0.0.1:8787/health
```

A working current backend identifies its service as `halo-distress-email` and indicates `locationReportingVersion: 1`. This health endpoint **does not send an email**.

Forward **both** ports through USB:

```bash
adb reverse tcp:8083 tcp:8083
adb reverse tcp:8787 tcp:8787
adb reverse --list
```

Start Expo in **Terminal window B**:

```bash
cd ~/SAHEYMobileApp/saheymobileapp
npm run android:email
```

Open the installed Halo development app from the phone's app drawer (or use the `adb shell monkey ...` command from Step 12). The phone talks to Metro on **8083** and the standalone email backend on **8787**.

The standalone server defaults to `127.0.0.1:8787`. A LAN setup requires different host/phone URLs and, if necessary, `HALO_EMAIL_HOST=0.0.0.0`; **only expose this development server on a trusted network**. If switching back to integrated mode, remove/comment out `EXPO_PUBLIC_DISTRESS_EMAIL_URL`, restart Expo, and stop the standalone process if it's no longer needed.

---

## Part 6 — Mac troubleshooting

### Error: `npm ERR! enoent ... package.json`

You are almost certainly running npm **from the wrong folder**.

```bash
pwd
ls
cd ~/SAHEYMobileApp/saheymobileapp
ls package.json
npm install
```

If you cloned somewhere other than your home directory, change the path accordingly. Do **not** create a fake `package.json` in the repository root.

### Error: `Activity not started, unable to resolve intent` after pressing `a`

This is an Android launch/deep-link problem, **not necessarily a Metro or email-server failure**.

1. Run `adb devices` and confirm the phone says `device`.
2. Confirm the app is installed: `adb shell pm list packages | grep com.halo.companion`.
3. If missing (or the old native URL scheme is installed), run `npm run android:build` **from the app directory**.
4. Re-run `adb reverse tcp:8083 tcp:8083`.
5. Keep `npm run android:email` running.
6. **Tap the Halo app icon on the phone** instead of pressing `a`. Alternatively run:

   ```bash
   adb shell monkey -p com.halo.companion -c android.intent.category.LAUNCHER 1
   ```

If it still fails, provide the exact build error and package list to a maintainer; don't repeatedly reinstall unrelated tools.

### Error: `adb: command not found`

The SDK Platform-Tools directory is not in your Terminal PATH. Follow **Step 4**; try:

```bash
"$HOME/Library/Android/sdk/platform-tools/adb" devices
```

### `adb devices` shows `unauthorized` or nothing

Unlock the Android phone and approve USB debugging. Try a different USB **data** cable and a direct Mac USB port. Some phone models require changing USB mode from charge-only to file transfer to trigger a reliable connection.

### Error: `Unable to parse HTTP header`, `Unexpected token <`, `Not found`, or HTTP 404

Check the **endpoint and port**:

- Integrated Expo route: `EXPO_PUBLIC_API_URL=http://127.0.0.1:8083`, endpoint `/api/distress`, and **no** standalone override.
- Standalone route: `EXPO_PUBLIC_DISTRESS_EMAIL_URL=http://127.0.0.1:8787/distress` and an actual `npm run email:server` process on port `8787`.
- Re-run the matching `adb reverse` commands.
- **Restart Expo** after `.env.local` or API-route changes.
- Ensure you're running this repository's current backend rather than an old server from another directory.

A backend returning an HTML error page instead of JSON can produce parsing or invalid-response errors. Do not assume that means email was sent.

### Can't reach the Expo server over USB

```bash
adb devices
adb reverse tcp:8083 tcp:8083
adb reverse --list
```

Check that Expo is on `8083` and keep its Terminal window open. Disconnecting/reconnecting the phone may require repeating `adb reverse`.

### `npm run android:build` fails due to SDK, Gradle, or Java

Open Android Studio's **SDK Manager** and check the SDK and build tools. Ensure `ANDROID_HOME` matches the SDK path. Check the specific missing package/version in the Gradle error. Mac Apple silicon and Intel use different underlying native binaries, so use Android Studio and Node installations intended for your hardware.

### App opens but BLE scanning doesn't find the bracelet

Confirm Bluetooth is enabled, the bracelet is powered and advertising, Android permissions were granted, and the phone is running the **native development build** (not Expo Go). Bluetooth testing uses the **Android phone's** radio, not the Mac's radio.

### Distress alert appears but no email arrives

Check saved **Emergency Contacts**, server logs, the verified sender domain, the Resend dashboard, inbox/spam, and email backend configuration. Do not send repeated tests to unwilling recipients. Remember that provider acceptance and inbox delivery are different statuses.

### Email arrives but has no location

Enable phone Location Services and Halo's foreground location permission. The app limits the automatic location lookup, and may still send the alert with an explicit location-unavailable explanation. The app is designed to send a location **snapshot**, not live updates.

### Tests or TypeScript checks fail

Run from the app directory:

```bash
npm run typecheck
npm test
```

Capture the exact failed test or compiler error, including the first relevant stack trace, before changing unrelated code.

---

## Part 7 — Everyday startup checklist (after first setup)

Once Halo's development build has already been installed, you usually only need:

**Terminal A — start Expo**

```bash
cd ~/SAHEYMobileApp/saheymobileapp
npm run android:email
```

**Terminal B — forward USB port and open the installed app**

```bash
adb devices
adb reverse tcp:8083 tcp:8083
adb shell monkey -p com.halo.companion -c android.intent.category.LAUNCHER 1
```

Or simply tap the **Halo** app icon on the Android phone.

For the optional standalone email backend, also run `npm run email:server` in a separate Terminal and forward `8787`, as described in Part 5.

## Project links

- [Halo GitHub repository](https://github.com/riannaga23/SAHEYMobileApp)
- [Original app README](https://github.com/riannaga23/SAHEYMobileApp/blob/main/saheymobileapp/README.md)
- [Original root README (Windows setup and project features)](https://github.com/riannaga23/SAHEYMobileApp/blob/main/README.md)
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android Studio](https://developer.android.com/studio)
- [Resend dashboard](https://resend.com/emails)

**Security and scope reminder:** Halo's current distress-email test endpoint is for development. The prototype does not provide production-grade authenticated alert processing, persistent incident queues, background BLE service, or delivery-status webhooks. It should not be relied upon as a replacement for calling emergency services.
