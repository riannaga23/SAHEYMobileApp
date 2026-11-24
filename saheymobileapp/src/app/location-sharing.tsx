import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, Share, Text, View } from 'react-native';
import { AppButton, ui } from '../components/ui/app-layout';
import { getDistressLocation, type PhoneLocation } from '../lib/distressLocation';
import { locationShareContent, locationUnavailableMessage } from '../lib/locationSharing';

type LocationState = 'checking' | 'enabled' | 'permission-needed' | 'disabled' | 'unavailable';

export default function LocationSharingScreen() {
  const [status, setStatus] = useState<LocationState>('checking');
  const [location, setLocation] = useState<PhoneLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const version = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const attempt = ++version.current;
    Promise.all([Location.getForegroundPermissionsAsync(), Location.hasServicesEnabledAsync()])
      .then(([permission, enabled]) => {
        if (mounted.current && attempt === version.current) setStatus(!permission.granted ? 'permission-needed' : enabled ? 'enabled' : 'disabled');
      })
      .catch(() => { if (mounted.current && attempt === version.current) setStatus('unavailable'); });
    return () => { mounted.current = false; };
  }, []);

  async function shareLocation() {
    if (inFlight.current) return;
    inFlight.current = true;
    version.current++;
    setBusy(true); setError(''); setLocation(null); setStatus('checking');
    try {
      const result = await getDistressLocation({ purpose: 'sharing' });
      if (!mounted.current) return;
      if (!result.location) {
        setStatus(result.locationUnavailableReason === 'permission-denied' ? 'permission-needed'
          : result.locationUnavailableReason === 'services-disabled' ? 'disabled' : 'unavailable');
        setError(locationUnavailableMessage(result.locationUnavailableReason));
        return;
      }
      setLocation(result.location);
      setStatus('enabled');
      if (AppState.currentState === 'background' || AppState.currentState === 'inactive') {
        setError('Return to Halo and press Share my location to choose who to share with.');
        return;
      }
      try { await Share.share({ message: locationShareContent(result.location).message }); }
      catch { if (mounted.current) setError('Unable to open sharing. Please try again.'); }
    } catch {
      if (mounted.current) { setStatus('unavailable'); setError(locationUnavailableMessage()); }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const preview = location ? locationShareContent(location) : null;
  async function openMap() {
    if (!preview) return;
    try { await Linking.openURL(preview.mapsUrl); }
    catch { if (mounted.current) setError('Unable to open the map. Please try again.'); }
  }
  const title = busy ? 'Finding your location...' : status === 'enabled' ? 'Location access enabled'
    : status === 'checking' ? 'Checking location access...' : 'Location needs attention';
  const description = status === 'enabled' ? 'Choose who to share with using your phone\'s share menu.'
    : status === 'permission-needed' ? 'Allow location access when prompted, or enable it in app settings.'
    : status === 'disabled' ? 'Turn on location services in your phone settings, then try again.'
    : status === 'checking' ? 'Halo checks location when you choose to share.'
    : 'Check your phone location settings and try again.';

  return <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
    <Text style={ui.heading}>Location sharing</Text>
    <Text style={ui.body}>Share a Google Maps link and approximate coordinates whenever you choose.</Text>
    <View style={ui.card} accessibilityLiveRegion="polite">
      <Text style={ui.title}>{title}</Text>
      <Text style={ui.body}>{description}</Text>
    </View>
    <AppButton title={busy ? 'Finding your location...' : 'Share my location'} onPress={() => void shareLocation()} disabled={busy} />
    {busy && <Text style={ui.body} accessibilityLiveRegion="polite">Your phone may need up to a minute to find its location. Keep Halo open.</Text>}
    {status === 'permission-needed' && <AppButton secondary title="Open app settings" onPress={() => { void Linking.openSettings().catch(() => { if (mounted.current) setError('Allow location access for Halo in your phone settings.'); }); }} />}
    {preview && <View style={ui.card}>
      <Text style={ui.title}>{location?.source === 'recent' ? 'Recent location snapshot' : 'Location snapshot'}</Text>
      <Text style={ui.body}>Approximate coordinates: {preview.coordinates}</Text>
      <Text style={ui.body}>Captured: {preview.captured}. This snapshot does not update as you move.</Text>
      <AppButton secondary title="Open Google Maps" onPress={() => void openMap()} disabled={busy} />
    </View>}
    {!!error && <Text style={ui.error} accessibilityRole="alert">{error}</Text>}
    <Text style={ui.body}>Confirmed distress alerts automatically request your phone location for all saved emergency contacts. You do not need to share it here first. If location is unavailable, the alert still sends and the email explains why.</Text>
  </ScrollView>;
}
