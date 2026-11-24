import * as Location from 'expo-location';
export type PhoneLocation = { latitude: number; longitude: number; acquiredAt: string; accuracyMeters: number | null; source?: 'recent' };
export type LocationUnavailableReason = 'permission-denied' | 'services-disabled' | 'timeout' | 'unavailable' | 'stale-location';
export type DistressLocationSnapshot = {
  location: PhoneLocation | null;
  locationUnavailableReason?: LocationUnavailableReason;
};

// Manual sharing can wait for GPS. Keep distress capture short so alerts still send promptly.
export async function getDistressLocation(options: { purpose?: 'sharing' | 'distress' } = {}): Promise<DistressLocationSnapshot> {
  const sharing = options.purpose === 'sharing';
  const fixTimeoutMs = sharing ? 45_000 : 8_000;
  const totalTimeoutMs = sharing ? 60_000 : 12_000;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fixTimer: ReturnType<typeof setTimeout> | undefined;
  const unavailable = (reason: LocationUnavailableReason): DistressLocationSnapshot => ({ location: null, locationUnavailableReason: reason });
  function snapshot(position: Location.LocationObject): DistressLocationSnapshot {
    const { latitude, longitude, accuracy } = position.coords;
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return unavailable('unavailable');
    if (!Number.isFinite(position.timestamp) || Date.now() - position.timestamp > 60_000 || position.timestamp > Date.now() + 10_000) return unavailable('stale-location');
    return { location: {
      latitude, longitude, acquiredAt: new Date(position.timestamp).toISOString(),
      accuracyMeters: typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
    } };
  }
  async function capture(): Promise<DistressLocationSnapshot> {
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (expired) return unavailable('timeout');
      if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
      if (expired) return unavailable('timeout');
      if (!permission.granted) return unavailable('permission-denied');
      const enabled = await Location.hasServicesEnabledAsync();
      if (expired) return unavailable('timeout');
      if (!enabled) return unavailable('services-disabled');
      const fresh = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: sharing ? Location.Accuracy.High : Location.Accuracy.Balanced, mayShowUserSettingsDialog: sharing })
          .then(snapshot).catch(() => unavailable('unavailable')),
        new Promise<DistressLocationSnapshot>(resolve => { fixTimer = setTimeout(() => resolve(unavailable('timeout')), fixTimeoutMs); }),
      ]);
      if (fixTimer !== undefined) clearTimeout(fixTimer);
      if (expired) return unavailable('timeout');
      if (fresh.location) return fresh;
      // An indoor fix can stall. Use only a recent, bounded-accuracy fallback.
      try {
        const recent = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 1000 });
        if (expired) return unavailable('timeout');
        if (recent) {
          const result = snapshot(recent);
          if (result.location && result.location.accuracyMeters !== null && result.location.accuracyMeters <= 1000) {
            result.location.source = 'recent';
            return result;
          }
        }
      } catch { /* Preserve the fresh fix's failure reason. */ }
      return fresh;
    } catch {
      return unavailable('unavailable');
    }
  }
  try {
    return await Promise.race([
      capture(),
      new Promise<DistressLocationSnapshot>(resolve => {
        timer = setTimeout(() => { expired = true; resolve(unavailable('timeout')); }, totalTimeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (fixTimer !== undefined) clearTimeout(fixTimer);
  }
}
