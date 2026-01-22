import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  Linking,
  Platform,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Coordinates {
  lat: number;
  lng: number;
}

interface Hospital {
  id: string;
  name: string;
  address: string;
  city: string;
  coordinates: Coordinates;
  currentWaitTime: number;
  lastUpdated: string;
  phone: string;
  services: string[];
  distance?: number;
  score?: number;
}

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');
      
      if (status === 'granted') {
        await getUserLocationAndFetchHospitals();
      } else {
        setLoading(false);
        Alert.alert(
          'Location Permission Required',
          'This app needs your location to find nearby emergency rooms.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setLoading(false) },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
      setLoading(false);
    }
  };

  const getUserLocationAndFetchHospitals = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation(location);
      await fetchNearbyHospitals(location.coords.latitude, location.coords.longitude);
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Unable to get your current location');
      setLoading(false);
    }
  };

  const fetchNearbyHospitals = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `${EXPO_PUBLIC_BACKEND_URL}/api/hospitals/nearby?lat=${lat}&lng=${lng}&limit=10`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch hospitals');
      }
      
      const data = await response.json();
      setHospitals(data);
    } catch (error) {
      console.error('Error fetching hospitals:', error);
      Alert.alert('Error', 'Unable to fetch nearby hospitals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    if (userLocation) {
      setRefreshing(true);
      await fetchNearbyHospitals(
        userLocation.coords.latitude,
        userLocation.coords.longitude
      );
    }
  };

  const openMapsNavigation = (hospital: Hospital) => {
    const scheme = Platform.select({
      ios: 'maps:',
      android: 'geo:',
    });
    const url = Platform.select({
      ios: `${scheme}?daddr=${hospital.coordinates.lat},${hospital.coordinates.lng}`,
      android: `${scheme}${hospital.coordinates.lat},${hospital.coordinates.lng}?q=${hospital.coordinates.lat},${hospital.coordinates.lng}(${hospital.name})`,
    });

    if (url) {
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'Unable to open maps application');
      });
    }
  };

  const callHospital = (phone: string) => {
    const phoneUrl = `tel:${phone.replace(/[^0-9+]/g, '')}`;
    Linking.openURL(phoneUrl).catch(() => {
      Alert.alert('Error', 'Unable to make phone call');
    });
  };

  const formatWaitTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getWaitTimeColor = (minutes: number): string => {
    if (minutes < 60) return '#10B981'; // Green
    if (minutes < 120) return '#F59E0B'; // Orange
    return '#EF4444'; // Red
  };

  const renderHospitalCard = ({ item, index }: { item: Hospital; index: number }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setSelectedHospital(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.hospitalName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.cityText}>{item.city}</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Ionicons name="time-outline" size={20} color={getWaitTimeColor(item.currentWaitTime)} />
          <Text style={[styles.statLabel, { color: getWaitTimeColor(item.currentWaitTime) }]}>
            Wait: {formatWaitTime(item.currentWaitTime)}
          </Text>
        </View>
        {item.distance && (
          <View style={styles.statItem}>
            <Ionicons name="location-outline" size={20} color="#6B7280" />
            <Text style={styles.statValue}>{item.distance.toFixed(1)} km away</Text>
          </View>
        )}
      </View>

      <View style={styles.servicesContainer}>
        {item.services.slice(0, 3).map((service, idx) => (
          <View key={idx} style={styles.serviceTag}>
            <Text style={styles.serviceText}>{service}</Text>
          </View>
        ))}
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.navigateButton}
          onPress={() => openMapsNavigation(item)}
        >
          <Ionicons name="navigate" size={18} color="white" />
          <Text style={styles.buttonText}>Navigate</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.callButton}
          onPress={() => callHospital(item.phone)}
        >
          <Ionicons name="call" size={18} color="#0066CC" />
          <Text style={styles.callButtonText}>Call</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066CC" />
          <Text style={styles.loadingText}>Finding nearby emergency rooms...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (locationPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="location-outline" size={64} color="#9CA3AF" />
          <Text style={styles.permissionTitle}>Location Access Required</Text>
          <Text style={styles.permissionText}>
            We need your location to find the nearest emergency rooms and calculate accurate distances.
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestLocationPermission}
          >
            <Text style={styles.permissionButtonText}>Enable Location</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Ionicons name="medical" size={32} color="#DC2626" />
          <Text style={styles.title}>Ontario ER Finder</Text>
        </View>
        <Text style={styles.subtitle}>Top {hospitals.length} Emergency Rooms Near You</Text>
      </View>

      {selectedHospital && (
        <View style={styles.detailModal}>
          <ScrollView style={styles.detailContent}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>{selectedHospital.name}</Text>
              <TouchableOpacity onPress={() => setSelectedHospital(null)}>
                <Ionicons name="close-circle" size={32} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.detailSection}>
              <Ionicons name="location" size={20} color="#6B7280" />
              <Text style={styles.detailText}>{selectedHospital.address}</Text>
            </View>

            <View style={styles.detailSection}>
              <Ionicons name="call" size={20} color="#6B7280" />
              <Text style={styles.detailText}>{selectedHospital.phone}</Text>
            </View>

            <View style={styles.detailSection}>
              <Ionicons name="time" size={20} color={getWaitTimeColor(selectedHospital.currentWaitTime)} />
              <Text style={[styles.detailText, { color: getWaitTimeColor(selectedHospital.currentWaitTime), fontWeight: '600' }]}>
                Current Wait: {formatWaitTime(selectedHospital.currentWaitTime)}
              </Text>
            </View>

            {selectedHospital.distance && (
              <View style={styles.detailSection}>
                <Ionicons name="car" size={20} color="#6B7280" />
                <Text style={styles.detailText}>
                  Distance: {selectedHospital.distance.toFixed(1)} km
                </Text>
              </View>
            )}

            <View style={styles.servicesSection}>
              <Text style={styles.servicesTitle}>Available Services:</Text>
              {selectedHospital.services.map((service, idx) => (
                <View key={idx} style={styles.serviceRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={styles.serviceItemText}>{service}</Text>
                </View>
              ))}
            </View>

            <View style={styles.detailActions}>
              <TouchableOpacity
                style={styles.detailNavigateButton}
                onPress={() => openMapsNavigation(selectedHospital)}
              >
                <Ionicons name="navigate" size={20} color="white" />
                <Text style={styles.detailButtonText}>Get Directions</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.detailCallButton}
                onPress={() => callHospital(selectedHospital.phone)}
              >
                <Ionicons name="call" size={20} color="white" />
                <Text style={styles.detailButtonText}>Call Hospital</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}

      <FlatList
        data={hospitals}
        renderItem={renderHospitalCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0066CC']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle-outline" size={64} color="#9CA3AF" />
            <Text style={styles.emptyText}>No hospitals found nearby</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginLeft: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 24,
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#0066CC',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0066CC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardHeaderText: {
    flex: 1,
  },
  hospitalName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  cityText: {
    fontSize: 14,
    color: '#6B7280',
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 14,
    color: '#6B7280',
  },
  servicesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  serviceTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  serviceText: {
    fontSize: 12,
    color: '#1E40AF',
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  navigateButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0066CC',
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  callButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  callButtonText: {
    color: '#0066CC',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 16,
  },
  detailModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  detailContent: {
    backgroundColor: 'white',
    marginTop: 100,
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    flex: 1,
    marginRight: 12,
  },
  detailSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  detailText: {
    fontSize: 16,
    color: '#374151',
    flex: 1,
  },
  servicesSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  servicesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  serviceItemText: {
    fontSize: 15,
    color: '#374151',
  },
  detailActions: {
    gap: 12,
  },
  detailNavigateButton: {
    flexDirection: 'row',
    backgroundColor: '#0066CC',
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  detailCallButton: {
    flexDirection: 'row',
    backgroundColor: '#DC2626',
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  detailButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
