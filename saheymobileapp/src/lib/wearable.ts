import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import type { Peripheral } from 'react-native-ble-manager';
import { isConfirmedDistress } from './distressSignal';
import { loadWearableSetup, saveWearableSetup, type SavedWearable } from './wearableStorage';

type NativeManager = typeof import('react-native-ble-manager').default;
export const WEARABLE_NAME = 'HALO-wearable';
export const HALO_SERVICE_UUID =
  '7d31d9c0-54fa-4b79-9e15-68ddc5fb7401';

export const HALO_NOTIFY_UUID =
  '7d31d9c0-54fa-4b79-9e15-68ddc5fb7402';

export const HALO_COMMAND_UUID =
  '7d31d9c0-54fa-4b79-9e15-68ddc5fb7403';
export const matchesWearableName = (name: string) => name.trim().toLowerCase() === WEARABLE_NAME.toLowerCase();
export type NearbyWearable = { id: string; name: string; rssi: number; connectable: boolean };
export type WearablePhase = 'idle' | 'permission' | 'scanning' | 'connecting' | 'connected' | 'disconnected' | 'error';
export type WearableSnapshot = {
  phase: WearablePhase;
  devices: NearbyWearable[];
  remembered: SavedWearable | null;
  connected: SavedWearable | null;
  error: string | null;
  message: { text: string; receivedAt: number } | null;
  messageStatus: string;
};
let snapshot: WearableSnapshot = { phase: 'idle', devices: [], remembered: null, connected: null, error: null, message: null, messageStatus: 'Connect your wearable to receive messages.' };
const notificationSources = new Set<string>();
const sourceKey = (service: string, characteristic: string) => `${service.toLowerCase()}/${characteristic.toLowerCase()}`;
const listeners = new Set<() => void>();
let manager: NativeManager | null = null;
let startPromise: Promise<void> | null = null;
let busy = false;
type SetupMessage = { text: string; receivedAt: number };
type SetupSession = {
  deviceId: string;
  phase: 'preparing' | 'starting' | 'recording';
  pendingTap?: SetupMessage;
  pendingResult?: SetupMessage;
};
let setupSession: SetupSession | null = null;
let setupVersion = 0;
let connectionVersion = 0;
let pendingId: string | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
// One module-owned set of native subscriptions keeps the connection alive between screens.
let subscriptions: { remove(): void }[] = [];

export const getWearableSnapshot = () => snapshot;
export function subscribeWearable(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function update(patch: Partial<WearableSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach(listener => listener());
}

export const isWearableSetupRecording = () => setupSession?.phase === 'recording';

export function cancelWearableSetupSession() {
  setupVersion++;
  setupSession = null;
  // A previous recording's raw count must not remain a live count outside setup.
  if (snapshot.message && /^TAP(?:\s|$)/i.test(snapshot.message.text)) update({ message: null });
}

function handleWearableText(text: string, deviceId: string, receivedAt: number) {
  const tapMatch = /^TAP\s+(\d+)$/i.exec(text);
  const isTap = /^TAP(?:\s|$)/i.test(text);
  const firmwareMessage = text.toUpperCase();
  const isResult = firmwareMessage === 'TOO FEW TAPS' || firmwareMessage === 'PATTERN SAVED';
  if (isTap || isResult) {
    const session = setupSession;
    if (!session || session.deviceId !== deviceId || session.phase === 'preparing') return;
    if (isTap && (!tapMatch || !Number.isSafeInteger(Number(tapMatch[1])) || Number(tapMatch[1]) < 1)) return;
    if (session.phase === 'starting') {
      // Some boards notify before write() resolves. Publish only after success,
      // retaining just the latest cumulative count and the first completion.
      if (isTap && !session.pendingResult) session.pendingTap = { text, receivedAt };
      else if (isResult && !session.pendingResult) session.pendingResult = { text, receivedAt };
      return;
    }
    if (isResult) cancelWearableSetupSession();
  }

  update({ message: { text, receivedAt } });
  if (isConfirmedDistress(text)) {
    DeviceEventEmitter.emit('halo.distress.confirmed', { deviceId, receivedAt });
  } else if (tapMatch) {
    DeviceEventEmitter.emit('halo.bracelet.tap', Number(tapMatch[1]));
  } else if (firmwareMessage === 'TOO FEW TAPS') {
    DeviceEventEmitter.emit('halo.bracelet.too-few');
  } else if (firmwareMessage === 'PATTERN SAVED') {
    DeviceEventEmitter.emit('halo.bracelet.pattern-saved');
  }
}
function scanStopped() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = null;
  if (snapshot.phase === 'scanning') update({ phase: snapshot.connected ? 'connected' : 'idle' });
}
function failure(cause: unknown) {
  const message = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : 'Bluetooth operation failed. Keep the board nearby and try again.';
  update({ phase: snapshot.connected ? 'connected' : 'error', error: message });
}

export function bluetoothUnavailableReason(): string | null {
  if (Platform.OS !== 'android') return 'Wearable setup currently supports Android. Use a physical Android phone.';
  if (Constants.executionEnvironment === 'storeClient') return 'Real Bluetooth connections require the Halo development build. Expo Go can show this screen, but cannot scan or connect.';
  if (!Device.isDevice) return 'Use a physical Android phone for the wearable connection; this emulator cannot connect to the TinyS3 board.';
  return null;
}

async function ready(): Promise<NativeManager> {
  const unavailable = bluetoothUnavailableReason();
  if (unavailable) throw new Error(unavailable);
  const permissions = Number(Platform.Version) >= 31
    ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const granted = await PermissionsAndroid.requestMultiple(permissions);
  if (!permissions.every(p => granted[p] === PermissionsAndroid.RESULTS.GRANTED)) {
    throw new Error('Nearby devices permission is required. Allow it in Android Settings for Halo, then scan again. Android 11 and earlier also require location services.');
  }
  if (!manager) {
    try {
      // Deliberately lazy: loading the native module inside Expo Go would crash at startup.
      manager = (require('react-native-ble-manager') as typeof import('react-native-ble-manager')).default;
    } catch { throw new Error('This app build does not include Bluetooth. Install a new Halo development build, then try again.'); }
  }
  const native = manager;
  if (!startPromise) {
    startPromise = native.start({ showAlert: false }).then(() => {
      subscriptions = [
        native.onDidUpdateValueForCharacteristic(event => {
          if (event.peripheral !== (pendingId ?? snapshot.connected?.id)) return;
          if (!notificationSources.has(sourceKey(event.service, event.characteristic))) return;
          if (
            event.service.toLowerCase() !== HALO_SERVICE_UUID.toLowerCase() ||
            event.characteristic.toLowerCase() !== HALO_NOTIFY_UUID.toLowerCase()
        ) {
          return;
    }
          // Firmware sends one complete UTF-8 message per notification. Ignore binary data.
          try {
            const text = decodeURIComponent(event.value.map(byte => `%${byte.toString(16).padStart(2, '0')}`).join(''))
              .replace(/\0+$/g, '').trim();
            if (text && !/[\x00-\x08\x0e-\x1f]/.test(text)) {
              handleWearableText(text, event.peripheral, Date.now());
            }
          } catch { /* Not a UTF-8 text message. */ }
        }),
        native.onDiscoverPeripheral((device: Peripheral) => {
          if (snapshot.phase !== 'scanning') return;
          const found: NearbyWearable = {
            id: device.id, name: device.name || device.advertising?.localName || 'Unnamed BLE device',
            rssi: device.rssi, connectable: device.advertising?.isConnectable !== false,
          };
          const devices = snapshot.devices.filter(d => d.id !== found.id);
          update({ devices: [...devices, found].sort((a, b) =>
            Number(matchesWearableName(b.name)) - Number(matchesWearableName(a.name)) || b.rssi - a.rssi) });
        }),
        native.onStopScan(event => {
          const wasScanning = snapshot.phase === 'scanning';
          scanStopped();
          if (wasScanning && event.status !== 0 && event.status !== 10) failure('Bluetooth scan stopped unexpectedly. Wait a moment, then scan again.');
        }),
        native.onDisconnectPeripheral(event => {
          if (event.peripheral === snapshot.connected?.id || event.peripheral === pendingId) {
            connectionVersion++;
            pendingId = null;
            notificationSources.clear();
            cancelWearableSetupSession();
            update({ connected: null, phase: 'disconnected', messageStatus: 'Disconnected. Reconnect to receive new messages.', error: 'Wearable disconnected. Keep it powered on and nearby, then reconnect.' });
          }
        }),
        native.onDidUpdateState(event => {
          if (event.state !== 'on') {
            connectionVersion++;
            cancelWearableSetupSession();
            scanStopped();
            notificationSources.clear();
            update({ connected: null, phase: 'disconnected', messageStatus: 'Bluetooth is unavailable.', error: 'Bluetooth is unavailable. Turn it on in Android settings, then reconnect.' });
          }
        }),
      ];
    }).catch(error => { subscriptions.forEach(s => s.remove()); subscriptions = []; startPromise = null; throw error; });
  }
  await startPromise;
  if (await native.checkState() !== 'on') throw new Error('Turn on Bluetooth in Android settings, then scan again.');
  return native;
}

export async function refreshRememberedWearable() {
  try { const setup = await loadWearableSetup(); update({ remembered: setup.device }); }
  catch (error) { failure(error); }
}

export async function stopWearableScan() {
  if (manager && snapshot.phase === 'scanning') await manager.stopScan();
  scanStopped();
}

export async function scanForWearables() {
  if (busy || snapshot.phase === 'scanning') return;
  busy = true;
  try {
    update({ phase: 'permission', error: null, devices: [] });
    const native = await ready();
    update({ phase: 'scanning', error: null });
    // Scan broadly because the service UUID is unknown; prioritize the known name in results.
    await native.scan({ serviceUUIDs: [], seconds: 15, allowDuplicates: false });
    if (getWearableSnapshot().phase === 'scanning') scanTimer = setTimeout(() => {
      void stopWearableScan().catch(failure);
    }, 17_000);
  } catch (error) { failure(error); }
  finally { busy = false; }
}

export async function connectWearable(device: Pick<NearbyWearable, 'id' | 'name'>) {
  if (busy || snapshot.connected?.id === device.id) return;
  busy = true;
  cancelWearableSetupSession();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  try {
    await stopWearableScan();
    update({ phase: 'permission', error: null });
    const native = await ready();
    if (snapshot.connected) await native.disconnect(snapshot.connected.id);
    attempt = ++connectionVersion;
    pendingId = device.id;
    notificationSources.clear();
    update({ connected: null, phase: 'connecting', error: null, message: null, messageStatus: 'Setting up wearable messages...' });
    const operation = native.connect(device.id, { autoconnect: false }).then(async () => {
      if (attempt !== connectionVersion) { await native.disconnect(device.id); throw new Error('Connection cancelled.'); }
      const info = await native.retrieveServices(device.id);
      if (attempt !== connectionVersion) { await native.disconnect(device.id); throw new Error('Connection cancelled.');}
const candidates = info.characteristics?.filter(c =>
  c.service.toLowerCase() === HALO_SERVICE_UUID.toLowerCase() &&
  c.characteristic.toLowerCase() === HALO_NOTIFY_UUID.toLowerCase() &&
  (c.properties.Notify || c.properties.Indicate)
) ?? [];

      let subscribed = 0;
      for (const characteristic of candidates) {
        const key = sourceKey(characteristic.service, characteristic.characteristic);
        if (notificationSources.has(key)) continue;
        notificationSources.add(key);
        try {
          await native.startNotification(device.id, characteristic.service, characteristic.characteristic);
          subscribed++;
        } catch { notificationSources.delete(key); }
        if (attempt !== connectionVersion) { await native.disconnect(device.id); throw new Error('Connection cancelled.'); }
      }
      update({ messageStatus: !candidates.length
        ? 'No message notifications available. The board characteristic must support Notify.'
        : subscribed === 0 ? 'Could not enable messages. Check the board firmware and reconnect.'
        : subscribed < candidates.length ? 'Listening for messages; some characteristics could not be subscribed.'
        : 'Listening for wearable messages.' });
      return info;
    });
    const info = await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Connection timed out. Keep the board awake and nearby, then scan again.')), 20_000); }),
    ]);
    const selected: SavedWearable = {
      id: device.id, name: info.name || device.name,
      services: [...new Set(info.services?.map(s => s.uuid) ?? info.serviceUUIDs ?? [])],
    };
    if (!selected.services.length) throw new Error('The device connected but did not expose any BLE services. Check the board firmware.');
    await saveWearableSetup(selected);
    if (attempt !== connectionVersion) throw new Error('Wearable disconnected before setup finished. Reconnect and try again.');
    update({ connected: selected, remembered: selected, phase: 'connected', error: null });
  } catch (error) {
    if (attempt) connectionVersion++;
    if (manager && pendingId) await manager.disconnect(pendingId).catch(() => undefined);
    notificationSources.clear();
    update({ connected: null, message: null, messageStatus: 'Connection failed. Reconnect to receive messages.' });
    failure(error);
  } finally {
    if (timeout) clearTimeout(timeout);
    pendingId = null;
    busy = false;
  }
}

export async function disconnectWearable(forget = false) {
  if (busy) return;
  busy = true;
  cancelWearableSetupSession();
  try {
    await stopWearableScan();
    connectionVersion++;
    if (manager && snapshot.connected) await manager.disconnect(snapshot.connected.id);
    if (forget) await saveWearableSetup(null);
    notificationSources.clear();
    update({ connected: null, phase: 'disconnected', error: null, messageStatus: 'Disconnected. Reconnect to receive new messages.', ...(forget ? { remembered: null, message: null } : {}) });
  } catch (error) { failure(error); }
  finally { busy = false; }
}

export async function skipWearableSetup() {
  if (busy) throw new Error('Wait for the current Bluetooth operation to finish.');
  await stopWearableScan();
  await saveWearableSetup(snapshot.remembered);
}


export type WearableCommand =
  | 'BEGIN SET UP'
  | 'DETECTION MODE';

export async function sendWearableCommand(
  command: WearableCommand
): Promise<void> {
  const connected = snapshot.connected;

  if (!connected || snapshot.phase !== 'connected') {
    throw new Error('Connect your wearable before sending commands.');
  }

  cancelWearableSetupSession();
  const version = setupVersion;
  const connection = connectionVersion;
  const session: SetupSession | null = command === 'BEGIN SET UP'
    ? { deviceId: connected.id, phase: 'preparing' } : null;
  setupSession = session;
  try {
    const native = await ready();
    if (snapshot.connected?.id !== connected.id || connection !== connectionVersion) {
      throw new Error('Wearable disconnected before command could be sent.');
    }
    if (version !== setupVersion) throw new Error('Wearable setup was cancelled. Press Begin wearable setup to start again.');
    if (session) session.phase = 'starting';
    await native.write(connected.id, HALO_SERVICE_UUID, HALO_COMMAND_UUID, Array.from(new TextEncoder().encode(command)));
    if (version !== setupVersion || connection !== connectionVersion) {
      throw new Error('Wearable setup was cancelled. Press Begin wearable setup to start again.');
    }
    if (session && setupSession === session) {
      session.phase = 'recording';
      const { pendingTap, pendingResult } = session;
      session.pendingTap = session.pendingResult = undefined;
      if (pendingTap) handleWearableText(pendingTap.text, connected.id, pendingTap.receivedAt);
      if (pendingResult && setupSession === session) handleWearableText(pendingResult.text, connected.id, pendingResult.receivedAt);
    }
  } catch (error) {
    if (version === setupVersion) cancelWearableSetupSession();
    throw error;
  }
}
