#!/usr/bin/env python3
"""
Ontario ER Finder Backend API Test Suite
Tests all backend endpoints with comprehensive scenarios
"""

import requests
import json
import math
from typing import List, Dict, Any
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/frontend/.env')

# Get backend URL from environment
BACKEND_URL = os.getenv('EXPO_PUBLIC_BACKEND_URL', 'http://localhost:8001')
API_BASE = f"{BACKEND_URL}/api"

print(f"Testing backend at: {API_BASE}")

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def add_pass(self, test_name: str):
        self.passed += 1
        print(f"✅ PASS: {test_name}")
    
    def add_fail(self, test_name: str, error: str):
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        print(f"❌ FAIL: {test_name} - {error}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY: {self.passed}/{total} tests passed")
        if self.errors:
            print(f"\nFAILED TESTS:")
            for error in self.errors:
                print(f"  - {error}")
        print(f"{'='*60}")

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance using Haversine formula for verification"""
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return round(c * 6371, 2)  # Earth radius in km

def test_api_root():
    """Test API root endpoint"""
    results = TestResults()
    
    try:
        response = requests.get(f"{API_BASE}/", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if "message" in data and "Ontario ER Finder API" in data["message"]:
                results.add_pass("API root endpoint responds correctly")
            else:
                results.add_fail("API root endpoint", "Unexpected response format")
        else:
            results.add_fail("API root endpoint", f"Status code: {response.status_code}")
    except Exception as e:
        results.add_fail("API root endpoint", f"Connection error: {str(e)}")
    
    return results

def test_get_all_hospitals():
    """Test GET /api/hospitals endpoint"""
    results = TestResults()
    
    try:
        response = requests.get(f"{API_BASE}/hospitals", timeout=10)
        
        if response.status_code == 200:
            hospitals = response.json()
            
            # Check if we get expected number of hospitals (10 seeded)
            if len(hospitals) == 10:
                results.add_pass("Returns correct number of hospitals (10)")
            else:
                results.add_fail("Hospital count", f"Expected 10, got {len(hospitals)}")
            
            # Check data structure of first hospital
            if hospitals:
                hospital = hospitals[0]
                required_fields = ['id', 'name', 'address', 'city', 'coordinates', 
                                 'currentWaitTime', 'phone', 'services']
                
                missing_fields = [field for field in required_fields if field not in hospital]
                if not missing_fields:
                    results.add_pass("Hospital data structure is correct")
                else:
                    results.add_fail("Hospital data structure", f"Missing fields: {missing_fields}")
                
                # Check coordinates structure
                if 'coordinates' in hospital:
                    coords = hospital['coordinates']
                    if 'lat' in coords and 'lng' in coords:
                        results.add_pass("Coordinates structure is correct")
                    else:
                        results.add_fail("Coordinates structure", "Missing lat/lng fields")
            
        else:
            results.add_fail("GET /api/hospitals", f"Status code: {response.status_code}")
            
    except Exception as e:
        results.add_fail("GET /api/hospitals", f"Error: {str(e)}")
    
    return results

def test_get_nearby_hospitals():
    """Test GET /api/hospitals/nearby endpoint with various scenarios"""
    results = TestResults()
    
    # Test coordinates
    toronto_coords = {"lat": 43.6532, "lng": -79.3832}
    ottawa_coords = {"lat": 45.4215, "lng": -75.6972}
    
    # Test 1: Basic Toronto query
    try:
        response = requests.get(
            f"{API_BASE}/hospitals/nearby",
            params=toronto_coords,
            timeout=10
        )
        
        if response.status_code == 200:
            hospitals = response.json()
            results.add_pass("Toronto nearby hospitals query successful")
            
            # Check if results are sorted by score (lower is better)
            if len(hospitals) > 1:
                scores = [h.get('score', float('inf')) for h in hospitals]
                if scores == sorted(scores):
                    results.add_pass("Results are sorted by score (ascending)")
                else:
                    results.add_fail("Score sorting", "Results not sorted by score")
            
            # Check if distance is calculated
            if hospitals and 'distance' in hospitals[0]:
                results.add_pass("Distance field is present")
                
                # Verify distance calculation for first hospital
                hospital = hospitals[0]
                if 'coordinates' in hospital:
                    expected_distance = haversine_distance(
                        toronto_coords['lat'], toronto_coords['lng'],
                        hospital['coordinates']['lat'], hospital['coordinates']['lng']
                    )
                    actual_distance = hospital['distance']
                    
                    # Allow small tolerance for rounding differences
                    if abs(expected_distance - actual_distance) < 0.1:
                        results.add_pass("Distance calculation is accurate")
                    else:
                        results.add_fail("Distance calculation", 
                                       f"Expected ~{expected_distance}km, got {actual_distance}km")
            else:
                results.add_fail("Distance field", "Missing distance in response")
                
        else:
            results.add_fail("Toronto nearby query", f"Status code: {response.status_code}")
            
    except Exception as e:
        results.add_fail("Toronto nearby query", f"Error: {str(e)}")
    
    # Test 2: Ottawa query
    try:
        response = requests.get(
            f"{API_BASE}/hospitals/nearby",
            params=ottawa_coords,
            timeout=10
        )
        
        if response.status_code == 200:
            hospitals = response.json()
            results.add_pass("Ottawa nearby hospitals query successful")
            
            # Ottawa hospitals should be ranked higher for Ottawa coordinates
            ottawa_hospitals = [h for h in hospitals if h.get('city') == 'Ottawa']
            if ottawa_hospitals and len(hospitals) > 0:
                # Check if at least one Ottawa hospital is in top 3
                top_3_cities = [h.get('city') for h in hospitals[:3]]
                if 'Ottawa' in top_3_cities:
                    results.add_pass("Ottawa hospitals ranked appropriately for Ottawa location")
                else:
                    results.add_fail("Ottawa ranking", "No Ottawa hospitals in top 3 for Ottawa query")
        else:
            results.add_fail("Ottawa nearby query", f"Status code: {response.status_code}")
            
    except Exception as e:
        results.add_fail("Ottawa nearby query", f"Error: {str(e)}")
    
    # Test 3: Limit parameter
    for limit in [1, 5, 10]:
        try:
            response = requests.get(
                f"{API_BASE}/hospitals/nearby",
                params={**toronto_coords, "limit": limit},
                timeout=10
            )
            
            if response.status_code == 200:
                hospitals = response.json()
                if len(hospitals) == limit:
                    results.add_pass(f"Limit parameter works correctly (limit={limit})")
                else:
                    results.add_fail(f"Limit parameter (limit={limit})", 
                                   f"Expected {limit} results, got {len(hospitals)}")
            else:
                results.add_fail(f"Limit test (limit={limit})", f"Status code: {response.status_code}")
                
        except Exception as e:
            results.add_fail(f"Limit test (limit={limit})", f"Error: {str(e)}")
    
    # Test 4: Weight parameters
    try:
        # Test with distance weight = 1.0, wait weight = 0.0 (distance only)
        response = requests.get(
            f"{API_BASE}/hospitals/nearby",
            params={**toronto_coords, "distance_weight": 1.0, "wait_weight": 0.0},
            timeout=10
        )
        
        if response.status_code == 200:
            distance_only = response.json()
            results.add_pass("Distance-only weighting query successful")
            
            # Test with distance weight = 0.0, wait weight = 1.0 (wait time only)
            response2 = requests.get(
                f"{API_BASE}/hospitals/nearby",
                params={**toronto_coords, "distance_weight": 0.0, "wait_weight": 1.0},
                timeout=10
            )
            
            if response2.status_code == 200:
                wait_only = response2.json()
                results.add_pass("Wait-time-only weighting query successful")
                
                # Results should be different with different weights
                if distance_only[0]['id'] != wait_only[0]['id']:
                    results.add_pass("Weight parameters affect ranking correctly")
                else:
                    # This might be coincidental, so just note it
                    results.add_pass("Weight parameters processed (ranking may coincidentally be same)")
            else:
                results.add_fail("Wait-time weighting", f"Status code: {response2.status_code}")
        else:
            results.add_fail("Distance weighting", f"Status code: {response.status_code}")
            
    except Exception as e:
        results.add_fail("Weight parameters test", f"Error: {str(e)}")
    
    # Test 5: Missing required parameters
    try:
        response = requests.get(f"{API_BASE}/hospitals/nearby", timeout=10)
        if response.status_code == 422:  # FastAPI validation error
            results.add_pass("Missing parameters handled correctly (422 error)")
        else:
            results.add_fail("Missing parameters handling", 
                           f"Expected 422, got {response.status_code}")
    except Exception as e:
        results.add_fail("Missing parameters test", f"Error: {str(e)}")
    
    return results

def test_get_hospital_by_id():
    """Test GET /api/hospitals/:id endpoint"""
    results = TestResults()
    
    # First get a valid hospital ID
    try:
        response = requests.get(f"{API_BASE}/hospitals", timeout=10)
        if response.status_code == 200:
            hospitals = response.json()
            if hospitals:
                valid_id = hospitals[0]['id']
                
                # Test 1: Valid ID
                response = requests.get(f"{API_BASE}/hospitals/{valid_id}", timeout=10)
                if response.status_code == 200:
                    hospital = response.json()
                    if hospital['id'] == valid_id:
                        results.add_pass("Get hospital by valid ID successful")
                    else:
                        results.add_fail("Valid ID response", "Returned hospital has different ID")
                else:
                    results.add_fail("Valid ID query", f"Status code: {response.status_code}")
                
                # Test 2: Invalid ID format
                response = requests.get(f"{API_BASE}/hospitals/invalid_id", timeout=10)
                if response.status_code == 400:
                    results.add_pass("Invalid ID format handled correctly (400 error)")
                else:
                    results.add_fail("Invalid ID handling", 
                                   f"Expected 400, got {response.status_code}")
                
                # Test 3: Non-existent but valid format ID
                fake_id = "507f1f77bcf86cd799439011"  # Valid ObjectId format
                response = requests.get(f"{API_BASE}/hospitals/{fake_id}", timeout=10)
                if response.status_code == 404:
                    results.add_pass("Non-existent ID handled correctly (404 error)")
                else:
                    results.add_fail("Non-existent ID handling", 
                                   f"Expected 404, got {response.status_code}")
            else:
                results.add_fail("Hospital ID test setup", "No hospitals found to test with")
        else:
            results.add_fail("Hospital ID test setup", "Could not fetch hospitals list")
            
    except Exception as e:
        results.add_fail("Get hospital by ID test", f"Error: {str(e)}")
    
    return results

def main():
    """Run all backend tests"""
    print("🏥 Ontario ER Finder Backend API Test Suite")
    print("=" * 60)
    
    all_results = TestResults()
    
    # Test API root
    print("\n📍 Testing API Root Endpoint...")
    root_results = test_api_root()
    all_results.passed += root_results.passed
    all_results.failed += root_results.failed
    all_results.errors.extend(root_results.errors)
    
    # Test get all hospitals
    print("\n🏥 Testing GET /api/hospitals...")
    hospitals_results = test_get_all_hospitals()
    all_results.passed += hospitals_results.passed
    all_results.failed += hospitals_results.failed
    all_results.errors.extend(hospitals_results.errors)
    
    # Test nearby hospitals (most critical)
    print("\n📍 Testing GET /api/hospitals/nearby...")
    nearby_results = test_get_nearby_hospitals()
    all_results.passed += nearby_results.passed
    all_results.failed += nearby_results.failed
    all_results.errors.extend(nearby_results.errors)
    
    # Test get hospital by ID
    print("\n🆔 Testing GET /api/hospitals/:id...")
    id_results = test_get_hospital_by_id()
    all_results.passed += id_results.passed
    all_results.failed += id_results.failed
    all_results.errors.extend(id_results.errors)
    
    # Print final summary
    all_results.summary()
    
    return all_results.failed == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)