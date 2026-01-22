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
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';

// Conditional import for expo-location (not available on web)
let Location: any = null;
if (Platform.OS !== 'web') {
  Location = require('expo-location');
}

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
  travelTimeMinutes?: number;
  totalTimeMinutes?: number;
}

type SortMode = 'combined' | 'travelTime' | 'waitTime';

interface TravelTimeProvider {
  calculateTravelTime(from: Coordinates, to: Coordinates, distanceKm: number): Promise<number>;
}

// Option B: Estimated travel time based on average speed
class EstimatedTravelTimeProvider implements TravelTimeProvider {
  private readonly AVERAGE_SPEED_KMH = 40; // Urban driving speed in Ontario

  async calculateTravelTime(from: Coordinates, to: Coordinates, distanceKm: number): Promise<number> {
    // Travel time in minutes = (distance / speed) * 60
    const travelTimeMinutes = (distanceKm / this.AVERAGE_SPEED_KMH) * 60;
    return Math.round(travelTimeMinutes);
  }
}

const travelTimeProvider: TravelTimeProvider = new EstimatedTravelTimeProvider();

// Validate Ontario postal code format (K1A 0B1)
function validateOntarioPostalCode(postalCode: string): boolean {
  // Ontario postal codes start with K, L, M, N, or P
  const ontarioPostalRegex = /^[KLMNP][0-9][A-Z]\s?[0-9][A-Z][0-9]$/i;
  return ontarioPostalRegex.test(postalCode.trim());
}

// Geocode postal code to coordinates using a free service
async function geocodePostalCode(postalCode: string): Promise<Coordinates | null> {
  try {
    // Using Nominatim (OpenStreetMap) free geocoding service
    const formattedPostalCode = postalCode.trim().replace(/\s+/g, '+');
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${formattedPostalCode}&country=Canada&format=json&limit=1`
    );
    
    if (!response.ok) {
      throw new Error('Geocoding failed');
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error geocoding postal code:', error);
    return null;
  }
}

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [userLocation, setUserLocation] = useState<any | null>(null);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('combined');
  const [showPostalCodeInput, setShowPostalCodeInput] = useState(false);
  const [postalCode, setPostalCode] = useState('');
  const [locationSource, setLocationSource] = useState<'gps' | 'postal' | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Use default Toronto location for web
      const defaultLocation = {
        coords: {
          latitude: 43.6532,
          longitude: -79.3832,
        },
      };
      setUserLocation(defaultLocation);
      setLocationPermission(true);
      setLocationSource('gps');
      fetchNearbyHospitals(defaultLocation.coords.latitude, defaultLocation.coords.longitude);
    } else {
      requestLocationPermission();
    }
  }, []);

  // Re-sort when sort mode changes
  useEffect(() => {
    if (hospitals.length > 0) {
      const sorted = sortHospitals([...hospitals], sortMode);
      setHospitals(sorted);
    }
  }, [sortMode]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');
      
      if (status === 'granted') {
        setLocationSource('gps');
        await getUserLocationAndFetchHospitals();
      } else {
        setLoading(false);
        // Don't automatically show postal code input, let user choose
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
      setShowPostalCodeInput(true);
    }
  };

  const handlePostalCodeSubmit = async () => {
    if (!validateOntarioPostalCode(postalCode)) {
      Alert.alert('Invalid Postal Code', 'Please enter a valid Ontario postal code (e.g., K1A 0B1)');
      return;
    }

    setLoading(true);
    const coordinates = await geocodePostalCode(postalCode);
    
    if (coordinates) {
      const location = {
        coords: {
          latitude: coordinates.lat,
          longitude: coordinates.lng,
        },
      };
      setUserLocation(location);
      setLocationSource('postal');
      setShowPostalCodeInput(false);
      await fetchNearbyHospitals(coordinates.lat, coordinates.lng);
    } else {
      setLoading(false);
      Alert.alert('Error', 'Unable to find coordinates for this postal code. Please try again.');
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
      
      const data: Hospital[] = await response.json();
      
      // Calculate travel time for each hospital
      const hospitalsWithTravelTime = await Promise.all(
        data.map(async (hospital) => {
          const travelTime = await travelTimeProvider.calculateTravelTime(
            { lat, lng },
            hospital.coordinates,
            hospital.distance || 0
          );
          
          return {
            ...hospital,
            travelTimeMinutes: travelTime,
            totalTimeMinutes: travelTime + hospital.currentWaitTime,
          };
        })
      );
      
      // Sort based on current sort mode
      const sorted = sortHospitals(hospitalsWithTravelTime, sortMode);
      setHospitals(sorted);
    } catch (error) {
      console.error('Error fetching hospitals:', error);
      Alert.alert('Error', 'Unable to fetch nearby hospitals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const sortHospitals = (hospitalList: Hospital[], mode: SortMode): Hospital[] => {
    const sorted = [...hospitalList];
    
    switch (mode) {
      case 'travelTime':
        // Sort by shortest travel time
        return sorted.sort((a, b) => (a.travelTimeMinutes || 0) - (b.travelTimeMinutes || 0));
      
      case 'waitTime':
        // Sort by shortest wait time
        return sorted.sort((a, b) => a.currentWaitTime - b.currentWaitTime);
      
      case 'combined':
      default:
        // Sort by total time (travel + wait)
        return sorted.sort((a, b) => (a.totalTimeMinutes || 0) - (b.totalTimeMinutes || 0));
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

  const getSortModeLabel = (): string => {
    switch (sortMode) {
      case 'travelTime':
        return 'Nearest (Shortest Drive)';
      case 'waitTime':
        return 'Shortest Wait Time';
      case 'combined':
        return 'Best Combined (Drive + Wait)';
    }
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
          <Ionicons name="car" size={20} color="#0066CC" />
          <Text style={styles.statValue}>
            {item.travelTimeMinutes}min drive
          </Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="time-outline" size={20} color={getWaitTimeColor(item.currentWaitTime)} />
          <Text style={[styles.statLabel, { color: getWaitTimeColor(item.currentWaitTime) }]}>
            {formatWaitTime(item.currentWaitTime)} wait
          </Text>
        </View>
      </View>

      {sortMode === 'combined' && (
        <View style={styles.totalTimeContainer}>
          <Text style={styles.totalTimeLabel}>
            Total: {item.totalTimeMinutes}min ({item.travelTimeMinutes}min drive + {formatWaitTime(item.currentWaitTime)} wait)
          </Text>
        </View>
      )}

      <View style={styles.distanceRow}>
        <Ionicons name="location-outline" size={16} color="#6B7280" />
        <Text style={styles.distanceText}>{item.distance?.toFixed(1)} km away</Text>
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

  if (loading && !showPostalCodeInput) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066CC" />
          <Text style={styles.loadingText}>Finding nearby emergency rooms...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (showPostalCodeInput) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.postalCodeContainer}
        >
          <Ionicons name="location-outline" size={64} color="#9CA3AF" />
          <Text style={styles.postalCodeTitle}>Location Access Required</Text>
          <Text style={styles.postalCodeText}>
            Please enter your Ontario postal code to find nearby emergency rooms.
          </Text>
          
          <TextInput
            style={styles.postalCodeInput}
            placeholder="K1A 0B1"
            value={postalCode}
            onChangeText={setPostalCode}
            autoCapitalize="characters"
            maxLength={7}
          />
          
          <TouchableOpacity
            style={styles.postalCodeButton}
            onPress={handlePostalCodeSubmit}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="search" size={20} color="white" />
                <Text style={styles.postalCodeButtonText}>Find Hospitals</Text>
              </>
            )}
          </TouchableOpacity>

          {Platform.OS !== 'web' && (
            <TouchableOpacity
              style={styles.retryGPSButton}
              onPress={requestLocationPermission}
            >
              <Text style={styles.retryGPSText}>Try GPS Again</Text>
            </TouchableOpacity>
          )}
        </KeyboardAvoidingView>
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
        
        <View style={styles.locationIndicator}>
          <Ionicons 
            name={locationSource === 'gps' ? 'navigate' : 'mail'} 
            size={16} 
            color="#6B7280" 
          />
          <Text style={styles.locationText}>
            {locationSource === 'gps' ? 'Using GPS location' : `Using postal code: ${postalCode}`}
          </Text>
          <TouchableOpacity
            style={styles.changeLocationButton}
            onPress={() => setShowPostalCodeInput(true)}
          >
            <Ionicons name="pencil" size={16} color="#0066CC" />
            <Text style={styles.changeLocationText}>Change</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>Top {hospitals.length} Emergency Rooms</Text>
        
        <View style={styles.sortContainer}>
          <Text style={styles.sortLabel}>Sort by:</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={sortMode}
              style={styles.picker}
              onValueChange={(value) => setSortMode(value as SortMode)}
            >
              <Picker.Item label="Best Combined" value="combined" />
              <Picker.Item label="Nearest" value="travelTime" />
              <Picker.Item label="Shortest Wait" value="waitTime" />
            </Picker>
          </View>
        </View>
      </View>

      {showPostalCodeInput && (
        <View style={styles.postalCodeModal}>
          <View style={styles.postalCodeModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Location</Text>
              <TouchableOpacity onPress={() => setShowPostalCodeInput(false)}>
                <Ionicons name="close-circle" size={32} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.locationOptionsContainer}>
              {Platform.OS !== 'web' && (
                <TouchableOpacity
                  style={styles.locationOptionButton}
                  onPress={async () => {
                    setShowPostalCodeInput(false);
                    setLoading(true);
                    await requestLocationPermission();
                  }}
                >
                  <Ionicons name="navigate" size={24} color="#0066CC" />
                  <Text style={styles.locationOptionText}>Use GPS Location</Text>
                </TouchableOpacity>
              )}

              <View style={styles.orDivider}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              <Text style={styles.postalCodeLabel}>Enter Ontario Postal Code:</Text>
              <TextInput
                style={styles.postalCodeInput}
                placeholder="K1A 0B1"
                value={postalCode}
                onChangeText={setPostalCode}
                autoCapitalize="characters"
                maxLength={7}
              />
              
              <TouchableOpacity
                style={styles.postalCodeButton}
                onPress={async () => {
                  await handlePostalCodeSubmit();
                  if (!loading) {
                    setShowPostalCodeInput(false);
                  }
                }}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons name="search" size={20} color="white" />
                    <Text style={styles.postalCodeButtonText}>Find Hospitals</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

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
              <Ionicons name="car" size={20} color="#0066CC" />
              <Text style={styles.detailText}>
                Travel time: ~{selectedHospital.travelTimeMinutes} minutes
              </Text>
            </View>

            <View style={styles.detailSection}>
              <Ionicons name="time" size={20} color={getWaitTimeColor(selectedHospital.currentWaitTime)} />
              <Text style={[styles.detailText, { color: getWaitTimeColor(selectedHospital.currentWaitTime), fontWeight: '600' }]}>
                Current Wait: {formatWaitTime(selectedHospital.currentWaitTime)}
              </Text>
            </View>

            <View style={styles.detailSection}>
              <Ionicons name="pulse" size={20} color="#DC2626" />
              <Text style={[styles.detailText, { fontWeight: '600' }]}>
                Total Time: ~{selectedHospital.totalTimeMinutes} minutes
              </Text>
            </View>

            {selectedHospital.distance && (
              <View style={styles.detailSection}>
                <Ionicons name="map" size={20} color="#6B7280" />
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
  locationIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  locationText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 6,
    flex: 1,
  },
  changeLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  changeLocationText: {
    fontSize: 12,
    color: '#0066CC',
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 12,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  sortLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginRight: 8,
  },
  pickerContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  picker: {
    height: 40,
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
  postalCodeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  postalCodeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 24,
    marginBottom: 12,
  },
  postalCodeText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  postalCodeInput: {
    width: '100%',
    height: 56,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    backgroundColor: 'white',
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  postalCodeButton: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#0066CC',
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  postalCodeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  retryGPSButton: {
    marginTop: 16,
    paddingVertical: 12,
  },
  retryGPSText: {
    color: '#0066CC',
    fontSize: 14,
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
    marginBottom: 8,
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
    color: '#0066CC',
    fontWeight: '600',
  },
  totalTimeContainer: {
    backgroundColor: '#EFF6FF',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  totalTimeLabel: {
    fontSize: 13,
    color: '#1E40AF',
    fontWeight: '500',
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  distanceText: {
    fontSize: 13,
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
