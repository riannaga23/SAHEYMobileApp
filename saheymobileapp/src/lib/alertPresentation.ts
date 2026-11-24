import type { LocationUnavailableReason } from './distressLocation';
import { locationUnavailableMessage } from './locationSharing';

export type AlertState = {
  phase: 'idle' | 'sending' | 'accepted' | 'failed'; message: string;
  locationStatus?: 'included' | 'unavailable' | 'unconfirmed';
  locationUnavailableReason?: LocationUnavailableReason;
  locationSource?: 'recent';
};

export function alertStatusMessage(state: AlertState): string {
  if (state.phase === 'idle') return '';
  if (state.phase === 'sending') return /location/i.test(state.message) ? 'Finding your phone’s location…' : 'Submitting your distress alert…';
  if (state.phase === 'accepted') {
    const count = /all (\d+) saved emergency contact/.exec(state.message)?.[1];
    const recipient = count === '1' ? 'your emergency contact' : count ? `your ${count} emergency contacts` : 'your emergency contacts';
    const location = state.locationStatus === 'included'
      ? state.locationSource === 'recent' ? 'The alert includes a recent phone location and a map link; the email shows when it was captured.' : 'The alert includes the phone location and a map link.'
      : state.locationStatus === 'unavailable' ? `Phone location was unavailable; the email explains this. ${locationUnavailableMessage(state.locationUnavailableReason)}`
      : state.locationStatus === 'unconfirmed' ? 'The alert service did not confirm that location was included. Restart the email service to load the location update.'
      : '';
    return `Your alert was submitted to ${recipient}. ${location} Inbox delivery is not confirmed.`.replace(/\s+/g, ' ').trim();
  }
  const detail = state.message;
  if (/Save at least one|Save an emergency contact|Save between 1/i.test(detail)) return 'Add an emergency contact before sending alerts.';
  if (/at most 10|up to 10/i.test(detail)) return 'You can save up to 10 emergency contacts.';
  if (/contact|placeholder/i.test(detail)) return 'Review your emergency contacts and make sure each person has a valid email address.';
  if (/API[_ ]?URL|environment variable|equals sign|\.env|API key|sender|verified|only send testing|development only|local development/i.test(detail)) {
    return 'Email alerts need to be configured. Please review the email service settings.';
  }
  if (/404|not found|non-JSON|empty response|unexpected JSON|server URL/i.test(detail)) return 'The alert service is unavailable. Please try again later.';
  if (/recently submitted|rate limit|quota|HTTP 429/i.test(detail)) return 'Email alerts are temporarily unavailable. Please try again later.';
  if (/Resend rejected|provider rejected|HTTP 4/i.test(detail)) return 'The email service could not accept your alert. Please review the email service settings.';
  return 'Your alert could not be confirmed. Check your internet connection and try again.';
}
