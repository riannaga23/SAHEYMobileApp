import * as Location from 'expo-location';
import { useState } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';

export default function LocationSharingScreen() {
  const [permissionStatus, setPermissionStatus] = useState('Not requested');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude]= useState<number | null>(null);
  async function requestLocationPermission() {
    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();
        console.log('PERMISSION STATUS:', permission.status);
        console.log('PERMISSION GRANTED:', permission.granted);

      if (permission.status === 'granted') {
        setPermissionStatus('Granted');

        const location = await Location.getLastKnownPositionAsync(); // checks whether Android has a previously recorded location.
        if (location) {
            console.log('Latitude:', location.coords.latitude);
            console.log('Longitude:', location.coords.longitude);

            setLatitude(location.coords.latitude);
            setLongitude(location.coords.longitude);
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

      Alert.alert(
        'Error',
        'Unable to request location permission.'
      );
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