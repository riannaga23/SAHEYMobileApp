import * as Location from 'expo-location';
import { useState } from 'react';
import { Alert, Button, Linking, Share, StyleSheet, Text, View } from 'react-native';

export default function LocationSharingScreen() {
  const [permissionStatus, setPermissionStatus] = useState('Not requested');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude]= useState<number | null>(null);
  const [mapsUrl, setMapsUrl] = useState<string | null>(null);
  async function requestLocationPermission() {
    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();
        console.log('PERMISSION STATUS:', permission.status);
        console.log('PERMISSION GRANTED:', permission.granted);

      if (permission.status === 'granted') {
        setPermissionStatus('Granted');

        const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
            }); // expo asks android for a current location reading
        if (location) {
            console.log('Latitude:', location.coords.latitude);
            console.log('Longitude:', location.coords.longitude);

            setLatitude(location.coords.latitude);
            setLongitude(location.coords.longitude);

            const generatedMapsUrl = `https://www.google.com/maps/search/?api=1&query=${location.coords.latitude},${location.coords.longitude}`;

            setMapsUrl(generatedMapsUrl);

            console.log('Google Maps URL:', generatedMapsUrl);

        } else {
            console.log('No Cached location available');
        }
      } else {
          setPermissionStatus('Denied');

          Alert.alert(
              'Permission Denied',
              'SAHEY needs location access to share your location.'
          );
      }
    } catch (error) {
      console.error('Location permission error:', error);
      Alert.alert('Location Error Details', String(error));
      Alert.alert(
        'Location Error',
        'Unable to retrieve your location. Please check that your location services are enabled and try again.'
      );
    }
  }
  async function shareLocation() {
      if (mapsUrl == null) {
          Alert.alert(
              'Location Unavailable',
              'Please enable location before sharing.'
              );
              return;
       }
        try {
            await Share.share({
              message: `SAHEY Location Alert\nHere is my location: ${mapsUrl}`,
            });
            } catch (error) {
                console.error('Location sharing error:', error);
                Alert.alert('Error', 'Unable to open location sharing.');
            }
        }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Location Sharing</Text>

      <Text style={styles.status}>
        Permission: {permissionStatus}
      </Text>

      <Text>
        Latitude: {latitude != null ? latitude : 'Not available'}
      </Text>

      <Text>
        Longitude: {longitude != null ? longitude : 'Not available'}
      </Text>

      {mapsUrl != null && (
          <Button
            title="Open in Google Maps"
            onPress={() => Linking.openURL(mapsUrl)}/> )}
      {mapsUrl != null && (
          <Button
            title="Share My Location"
            onPress={shareLocation}/>)}
      <Button
        title="Enable Location"
        onPress={requestLocationPermission}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  status: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
});