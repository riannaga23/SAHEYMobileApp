import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Alert } from 'react-native';
import type { ConfirmedDistressSignal } from './distressSignal';
import { getEmergencyContactEmails, loadEmergencyContacts } from './emergencyContact';
import { getDistressLocation, type DistressLocationSnapshot } from './distressLocation';
import { alertStatusMessage } from './alertPresentation';
import type { AlertState } from './alertPresentation';

type EmailStatus = AlertState;
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
  payload: { type: 'CONFIRMED_DISTRESS'; eventId: string; occurredAt: string; to?: string[] } & Partial<DistressLocationSnapshot>;
  locationCaptured?: boolean;
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
  if ((explicit || base || '').startsWith('EXPO_PUBLIC_')) {
    throw new Error('The email server URL contains an environment variable name. Put only the URL after the equals sign in .env.local, then restart Expo.');
  }
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

async function readEmailResult(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (response.status === 404) {
    throw new EmailSubmissionError(
      'Distress email endpoint was not found (HTTP 404). Check the server URL and restart Expo. For the standalone server, run npm run email:server and set EXPO_PUBLIC_DISTRESS_EMAIL_URL to its full /distress URL.',
      false,
    );
  }
  let result: unknown;
  try { result = JSON.parse(text); }
  catch {
    // Expo/proxies can return plain text or HTML. Never expose a JSON parser error
    // or treat an HTTP success page as confirmation that an email was accepted.
    const description = text.trim() ? 'a non-JSON response' : 'an empty response';
    throw new EmailSubmissionError(
      `The email server returned ${description} (HTTP ${response.status}). Check that the URL points to the distress email API and restart the email server.`,
      false,
    );
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new EmailSubmissionError(`The email server returned an unexpected JSON response (HTTP ${response.status}). Provider acceptance was not confirmed.`, false);
  }
  return result as Record<string, unknown>;
}

async function submit(incident: Incident) {
  update({ phase: 'sending', message: 'Submitting a test distress email…' });
  try {
    // Snapshot saved contacts once, so retries keep the same recipients and body.
    if (!incident.payload.to) {
      incident.payload.to = getEmergencyContactEmails(await loadEmergencyContacts());
    }
    const url = endpoint();
    if (!incident.locationCaptured) {
      update({ phase: 'sending', message: 'Getting the phone’s location for the distress email…' });
      Object.assign(incident.payload, await getDistressLocation());
      incident.locationCaptured = true;
    }
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
        // Classify HTTP errors before parsing, so a plain-text 404 is not retried
        // while a temporary gateway failure can still recover with the same ID.
        retryable = response.ok || response.status === 408 || response.status === 429 || response.status >= 500;
        const result = await readEmailResult(response);
        if (!response.ok) {
          if (typeof result.retryable === 'boolean') retryable = result.retryable;
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
        const acknowledgement = result.location as { status?: unknown; acquiredAt?: unknown; source?: unknown; reason?: unknown } | null;
        const included = !!incident.payload.location && acknowledgement?.status === 'included'
          && acknowledgement.acquiredAt === incident.payload.location.acquiredAt
          && acknowledgement.source === (incident.payload.location.source || 'current');
        const unavailable = !incident.payload.location && acknowledgement?.status === 'unavailable'
          && acknowledgement.reason === incident.payload.locationUnavailableReason;
        const locationStatus = included ? 'included' : unavailable ? 'unavailable' : 'unconfirmed';
        const locationMessage = included ? 'The email includes the phone location and a Google Maps link.'
          : unavailable ? 'Phone location was unavailable; the email states that.'
          : 'The alert service did not confirm that location was included. Restart the email service to load the location update.';
        const message = `The email provider accepted a test distress email for all ${result.ids.length} saved emergency contact(s). ${locationMessage} Delivery is not confirmed; check the recipient inboxes.`;
        const next: EmailStatus = { phase: 'accepted', message, locationStatus,
          ...(unavailable ? { locationUnavailableReason: incident.payload.locationUnavailableReason } : {}),
          ...(included && incident.payload.location?.source === 'recent' ? { locationSource: 'recent' } : {}) };
        update(next);
        Alert.alert('Alert submitted', alertStatusMessage(next));
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
    Alert.alert('Alert not confirmed', alertStatusMessage({ phase: 'failed', message }));
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
        eventId: `halo-distress-${signal.receivedAt}-${Math.random().toString(36).slice(2, 12)}`,
        occurredAt: new Date(signal.receivedAt).toISOString(),
      },
    };
    incidents.set(signal.deviceId, incident);
  }
  const current = incident;
  current.task = submit(current).finally(() => { current.task = undefined; });
  return current.task;
}
