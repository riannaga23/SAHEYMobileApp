import { Alert } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import type { ConfirmedDistressSignal } from './distressSignal';
import { getEmergencyContactEmails, loadEmergencyContacts } from './emergencyContact';

type EmailStatus = { phase: 'idle' | 'sending' | 'accepted' | 'failed'; message: string };
let status: EmailStatus = { phase: 'idle', message: 'Waiting for a confirmed distress signal.' };
const listeners = new Set<() => void>();
export const getDistressEmailStatus = () => status;
export function subscribeDistressEmail(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function update(next: EmailStatus) {
  status = next;
  listeners.forEach(listener => listener());
}

type Incident = {
  receivedAt: number;
  payload: { type: 'CONFIRMED_DISTRESS'; eventId: string; occurredAt: string; to?: string[] };
  task?: Promise<void>;
  accepted: boolean;
};
const incidents = new Map<string, Incident>();
const DUPLICATE_WINDOW_MS = 60_000;

class EmailSubmissionError extends Error {
  constructor(message: string, readonly rejected: boolean) { super(message); }
}

function endpoint() {
  const explicit = process.env.EXPO_PUBLIC_DISTRESS_EMAIL_URL?.trim();
  const base = process.env.EXPO_PUBLIC_API_URL?.trim();
  const value = explicit || (base && `${base.replace(/\/+$/, '')}/api/distress`);
  if (!value) throw new Error('Set EXPO_PUBLIC_API_URL to the Expo server address reachable from this phone, then restart Expo.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('The distress email server URL is invalid. Check the app configuration and restart Expo.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) {
    throw new Error('Use an HTTP or HTTPS distress email server URL without credentials, a query, or a fragment.');
  }
  // An emulator's host alias cannot reach the server from a physical BLE phone.
  // Expo supplies the development machine's address when the phone opens its LAN URL.
  if (!explicit && Device.isDevice && url.hostname === '10.0.2.2') {
    const hostUri = Constants.expoConfig?.hostUri;
    const developmentHost = hostUri ? new URL(`http://${hostUri}`).hostname : null;
    if (!developmentHost || developmentHost === '10.0.2.2') {
      throw new Error('10.0.2.2 only works in the Android emulator. Set EXPO_PUBLIC_API_URL to your computer’s LAN address, or use adb reverse with localhost, then restart Expo.');
    }
    url.hostname = developmentHost;
  }
  return url.toString();
}

async function submit(incident: Incident) {
  update({ phase: 'sending', message: 'Submitting a test distress email…' });
  try {
    // Snapshot saved contacts once, so retries keep the same recipients and body.
    if (!incident.payload.to) {
      incident.payload.to = getEmergencyContactEmails(await loadEmergencyContacts());
    }
    const url = endpoint();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let retryable = true;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(incident.payload),
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) {
          retryable = result?.retryable === true;
          throw new EmailSubmissionError(
            typeof result?.error === 'string' ? result.error : `Email server returned HTTP ${response.status}.`,
            result?.delivery === 'rejected',
          );
        }
        if (result?.success !== true || !Array.isArray(result.ids) || result.ids.length !== incident.payload.to.length
          || !result.ids.every((id: unknown) => typeof id === 'string' && id.length > 0)) {
          throw new Error('The email server did not confirm provider acceptance.');
        }
        incident.accepted = true;
        const message = `The email provider accepted a test distress email for all ${result.ids.length} saved emergency contact(s). Delivery is not confirmed; check the recipient inboxes.`;
        update({ phase: 'accepted', message });
        Alert.alert('Distress email submitted', message);
        return;
      } catch (error) {
        if (!retryable || attempt === 2) throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  } catch (error) {
    const rejected = error instanceof EmailSubmissionError && error.rejected;
    const errorInfo = error as { name?: unknown; message?: unknown } | null;
    const detail = errorInfo?.name === 'AbortError' ? 'The email request timed out.'
      : typeof errorInfo?.message === 'string' && errorInfo.message ? errorInfo.message
      : typeof error === 'string' ? error : 'Could not submit the distress email.';
    const message = rejected ? detail : `${detail} Email delivery is unconfirmed. Check the server and connection.`;
    update({ phase: 'failed', message });
    Alert.alert(rejected ? 'Distress email rejected' : 'Distress email not confirmed', message);
  }
}

export function sendConfirmedDistressEmail(signal: ConfirmedDistressSignal): Promise<void> {
  // Only the validated BLE notification supplies this event payload.
  if (!signal || typeof signal.deviceId !== 'string' || !signal.deviceId
    || !Number.isFinite(signal.receivedAt) || signal.receivedAt <= 0
    || signal.receivedAt > Date.now() + 10_000 || Date.now() - signal.receivedAt > 5 * 60_000) return Promise.resolve();

  for (const [deviceId, incident] of incidents) {
    if (!incident.task && Date.now() - incident.receivedAt >= DUPLICATE_WINDOW_MS) incidents.delete(deviceId);
  }
  let incident = incidents.get(signal.deviceId);
  if (incident?.task) return incident.task;
  if (incident && signal.receivedAt - incident.receivedAt < DUPLICATE_WINDOW_MS) {
    if (incident.accepted) return Promise.resolve();
    // A repeated signal after failure retries the same incident and provider key.
  } else {
    incident = {
      receivedAt: signal.receivedAt,
      accepted: false,
      payload: {
        type: 'CONFIRMED_DISTRESS',
        eventId: `distress-${signal.receivedAt}-${Math.random().toString(36).slice(2, 12)}`,
        occurredAt: new Date(signal.receivedAt).toISOString(),
      },
    };
    incidents.set(signal.deviceId, incident);
  }
  const current = incident;
  current.task = submit(current).finally(() => { current.task = undefined; });
  return current.task;
}
