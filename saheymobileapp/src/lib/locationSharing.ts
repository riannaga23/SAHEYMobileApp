import type { LocationUnavailableReason, PhoneLocation } from './distressLocation';

export function locationUnavailableMessage(reason?: LocationUnavailableReason): string {
  switch (reason) {
    case 'permission-denied': return 'Location access was not allowed. Allow it in your phone settings.';
    case 'services-disabled': return 'Location services are off. Turn them on in your phone settings.';
    case 'timeout': return 'Halo did not receive a current location from your phone in time. Check Location Accuracy in your phone settings, then try again.';
    case 'stale-location': return 'Your phone could not find a recent location. Please try again.';
    default: return 'Your phone could not find its location. Check location settings and try again.';
  }
}

export function locationShareContent(location: PhoneLocation) {
  // Round both the map pin and displayed coordinates to avoid sharing hidden precision.
  const digits = location.accuracyMeters !== null && location.accuracyMeters >= 1000 ? 2 : 3;
  const coordinates = `${location.latitude.toFixed(digits)}, ${location.longitude.toFixed(digits)}`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates.replace(' ', ''))}`;
  const captured = new Date(location.acquiredAt).toLocaleString();
  const label = location.source === 'recent' ? 'My recent Halo location (last known position)' : 'My Halo location';
  const accuracy = location.accuracyMeters === null ? 'Phone accuracy is unknown.' : `Phone-reported accuracy: about ${Math.round(location.accuracyMeters)} meters.`;
  return { coordinates, mapsUrl, captured, message: `${label}\nApproximate coordinates: ${coordinates}\n${mapsUrl}\nCaptured: ${captured}\n${accuracy}\nThis is a location snapshot, not live tracking.` };
}
