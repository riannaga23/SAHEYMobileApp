# Halo wearable connection

## What the app does

Halo opens **Wearable Connection** on its first normal launch on a new installation (or after upgrading an existing installation that has not completed this setup). The user can connect a board or choose **Set up later**. Either choice is remembered with Expo SecureStore; the prompt does not repeat on every launch. The home screen always includes **Wearable Connection** for later setup.

The Android implementation requests Nearby devices permission (Android 12+) or location permission (older Android), scans for 15 seconds, lists devices by advertised name/address, connects to the selected peripheral, and discovers its GATT services. It only reports success after connection and service discovery. The selected device is remembered; a saved device is never displayed as connected merely because its identifier is stored. Use **Reconnect saved wearable** after restarting the app. There are also Disconnect and Forget controls, duplicate-operation protection, connection timeout handling, and disconnect/Bluetooth-off status updates.

The board's advertised name is configured as `HALO-wearable` in `src/lib/wearable.ts` (`WEARABLE_NAME`). Matching names are highlighted and sorted first, with case-insensitive matching. The app scans without a UUID filter because the service UUID is still unknown. Device selection is manual; a name is not proof of device identity. Select your board only. Other and unnamed devices remain visible for troubleshooting.

This implements a foreground BLE/GATT connection and displays text notifications from the selected board. It does not request Android PIN bonding, trigger emails, or maintain a background safety service.

### Displaying board messages

After connection, the app discovers and subscribes to characteristics with Notify or Indicate support. Keep Halo open, wait for **Listening for wearable messages**, then trigger the board. A complete UTF-8 message per notification appears under **Latest wearable message** on Home and Wearable Connection. The firmware payload `CONFIRMEDDISTRESS` is displayed as **Confirmed distress**. This only displays the message; no email or SOS action is triggered. The latest message is timestamped, remains labeled as the last received message after disconnect, and clears on reconnect. Messages are not persisted across app restarts.

In the teammate firmware, send `pCharacteristic->setValue("CONFIRMEDDISTRESS");` followed by `pCharacteristic->notify();` after the phone subscribes. The characteristic must be created with `BLECharacteristic::PROPERTY_NOTIFY`. With the ESP32 BLE library using `BLEDevice.h`, add the client configuration descriptor with `pCharacteristic->addDescriptor(new BLE2902());` (include `BLE2902.h`) if not already present. NimBLE adds this descriptor automatically. No firmware was changed or flashed for this display feature. The optional read-only sketch below does not send notifications.

Reload the installed development client and disconnect/reconnect to enable the new subscriptions. No new native dependency was added. Until the firmware UUIDs are confirmed, subscriptions cover all notification-capable characteristics on the selected board; arbitrary text is displayed as received and is never treated as an automatic emergency command. Fragmented messages across multiple notifications are not assembled.

## Build and install on a physical Android phone

Real BLE requires a **development build**. Expo Go and the normal emulator can display the setup screen and skip it, but cannot connect to your wearable. The library and `expo-dev-client` are installed and the config plugin is registered.

1. Enable Developer options and USB debugging on the phone, connect it over USB, and accept the debugging prompt on the phone.
2. In Android Studio, install the SDK/platform/build tools required by Expo SDK 58. Ensure the SDK and a suitable Java installation are available to the build tools.
3. Open PowerShell in the Expo app:

   ```powershell
   cd C:\Users\rigup\Documents\SAHEYMobileApp\saheymobileapp
   npm install
   adb devices
   npm run android:build
   ```

   `android:build` generates native Android files if necessary, compiles, prompts for a physical device, and installs Halo (`com.halo.companion`). The first build downloads Gradle/native dependencies. No existing board firmware is flashed by this command.

4. Keep the Metro terminal open. For later development sessions with the installed development build, use:

   ```powershell
   npm run start:ble
   ```

   Put the phone and computer on the same network for LAN Metro connections. For a USB alternative, run `adb reverse tcp:8083 tcp:8083` and open the development client's local server at `http://127.0.0.1:8083`.

5. To keep using Expo Go for the existing GPS/contact demo, use `npm run android:go`. Bluetooth setup will explain the build requirement and allow **Set up later**.

Expo Go and the installed Halo app have separate local storage. Add your emergency contacts to the installed app if needed. Installing the development build does not migrate Expo Go data.

### Current Windows demo copy

The working Android build and Metro server now run from `C:\SAHEY` to avoid Windows native-build path-length failures. This is a separate copy of the Expo app, not the Git repository. The Git repository remains at `C:\Users\rigup\Documents\SAHEYMobileApp`; keep relevant source changes synchronized before testing or committing. Editing only the repository copy does not update the running app.

With the development build already installed and the phone connected by USB, run `adb reverse tcp:8083 tcp:8083`, then start from `C:\SAHEY` with `npm run start:ble -- --android`. Keep the Metro terminal open. If necessary, open the installed Halo development client using server URL `http://127.0.0.1:8083`. Stop an existing Metro server before restarting with `--clear`. JavaScript-only changes need a reload, not a native rebuild.

## Board firmware

The TinyS3[D] must be running firmware that advertises a **connectable BLE service**. The board model alone does not determine its advertising name or service UUID. Power it on and search; the app lists names supplied by whatever firmware is installed.

If it has no BLE firmware yet, an optional minimal Arduino ESP32 example is provided at [firmware/halo-ble/halo-ble.ino](firmware/halo-ble/halo-ble.ino). It advertises:

- Name: `Halo-TinyS3`
- Service: `7d2ea28a-f7bd-485a-bd9d-92ad6ecfe93e`
- Read-only status characteristic: `7d2ea28b-f7bd-485a-bd9d-92ad6ecfe93e`
- Status value: `Halo ready`

To use the example, install Espressif's **esp32** board package in Arduino IDE, select the board definition matching your actual TinyS3[D] and its USB port, then compile/upload the sketch. Follow the board manufacturer's bootloader/upload instructions if required. **Uploading replaces the current board firmware**, so keep any teammate firmware first. No existing firmware was found or modified, and nothing has been uploaded by this change.

The example restarts advertising after disconnect and does not depend on a tap sensor or LED pin assignment. It is a connectivity example, not the final wearable firmware. The sketch has not been compiled or flashed in this workspace because Arduino tooling and the board are not connected.

## Pairing walkthrough

1. Power the board. If using the optional sketch, the Serial Monitor at 115200 baud should show `Advertising Halo-TinyS3`.
2. Launch the installed Halo development build on the phone.
3. On the first-launch connection screen, tap **Search for my wearable** and allow Nearby devices access. Turn Bluetooth on manually if prompted by the app.
4. Select your board from the results. Wait for **Wearable connected** and the discovered-service count.
5. Tap **Continue to Halo**. The home screen shows the connected board.
6. Return to **Wearable Connection** to disconnect, reconnect, or forget it. Power off the board to check disconnect handling.
7. Restart the app: onboarding should not repeat, and connection state starts disconnected. Reconnect from Wearable Connection; choose Search again if the OS needs to rediscover the board first.

If nothing appears, confirm the firmware advertises BLE, keep the board close, disconnect any other BLE client already using it, and scan again. On Android 11 or earlier, turn on system Location as well. Denied permissions can be changed using **Open app permission settings**. Setup remains skippable if hardware is unavailable.

## Email/location on the physical phone

The existing `EXPO_PUBLIC_API_URL=http://10.0.2.2:8083` is an **Android emulator-only** address. BLE itself does not use this URL. To also use the email feature on a USB-connected phone:

```powershell
adb reverse tcp:8083 tcp:8083
```

Set the following in `saheymobileapp/.env.local`, then restart Metro and reload Halo:

```dotenv
EXPO_PUBLIC_API_URL=http://127.0.0.1:8083
```

Alternatively, use `http://YOUR_COMPUTER_LAN_IP:8083` with phone/computer on the same network. Keep provider credentials server-only. The USB reverse mapping must be recreated after a device/adb restart. Switch the URL back to `10.0.2.2` when returning to the emulator without reverse mapping.

## Verification and next step

Run from `saheymobileapp`:

```powershell
npx tsc --noEmit
node --test scripts/test-wearable.cjs
```

The tests mock BLE and storage; they never connect to nearby devices or send email. They cover setup persistence, safe Expo Go/emulator handling, permissions, Bluetooth off, scan deduplication, successful service discovery, failed/late connections, disconnects, and forgetting a board.

The development build has been installed and launched on the Pixel, and Android logs confirmed connection and service discovery with the board. Receipt of the actual distress notification still requires physical verification. Text notification display is implemented; automatic SOS/email handling is not. Once the firmware protocol is known, restrict subscriptions to its specific UUIDs before routing explicit events into additional application behavior. Do not treat arbitrary BLE payloads as emergency triggers.

Official references: [BLE manager Expo setup](https://innoveit.github.io/react-native-ble-manager/expo/), [BLE manager methods](https://innoveit.github.io/react-native-ble-manager/methods/), [Expo BLE development builds](https://expo.dev/blog/how-to-build-a-bluetooth-low-energy-powered-expo-app), [Espressif Arduino BLE server example](https://github.com/espressif/arduino-esp32/blob/master/libraries/BLE/examples/Server/Server.ino).
