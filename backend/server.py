from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from math import radians, cos, sin, asin, sqrt
from bson import ObjectId
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# OpenRouteService API key
ORS_API_KEY = os.environ.get('OPENROUTESERVICE_API_KEY', '')

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Pydantic Models
class Coordinates(BaseModel):
    lat: float
    lng: float

class Hospital(BaseModel):
    id: Optional[str] = None
    name: str
    address: str
    city: str
    coordinates: Coordinates
    currentWaitTime: int  # in minutes
    lastUpdated: datetime
    phone: str
    services: List[str]

class HospitalResponse(BaseModel):
    id: str
    name: str
    address: str
    city: str
    coordinates: Coordinates
    currentWaitTime: int
    lastUpdated: datetime
    phone: str
    services: List[str]
    distance: Optional[float] = None  # in km
    score: Optional[float] = None

# Helper function to calculate distance using Haversine formula
def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in kilometers using Haversine formula"""
    # Convert to radians
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    
    # Radius of Earth in kilometers
    r = 6371
    
    return round(c * r, 2)

def calculate_score(distance: float, wait_time: int, distance_weight: float = 0.5, wait_weight: float = 0.5) -> float:
    """Calculate ranking score. Lower is better."""
    # Normalize distance (assume max 50km)
    normalized_distance = min(distance / 50.0, 1.0)
    
    # Normalize wait time (assume max 300 minutes = 5 hours)
    normalized_wait = min(wait_time / 300.0, 1.0)
    
    # Calculate weighted score
    score = (distance_weight * normalized_distance) + (wait_weight * normalized_wait)
    
    return round(score, 4)

# Seed data for Ontario hospitals
async def seed_hospitals():
    """Seed database with Ontario hospital data if empty"""
    count = await db.hospitals.count_documents({})
    if count > 0:
        return
    
    hospitals = [
        {
            "name": "Toronto General Hospital",
            "address": "200 Elizabeth St, Toronto, ON M5G 2C4",
            "city": "Toronto",
            "coordinates": {"lat": 43.6596, "lng": -79.3894},
            "currentWaitTime": 120,
            "lastUpdated": datetime.utcnow(),
            "phone": "416-340-4800",
            "services": ["Emergency", "Trauma", "Cardiac Care"]
        },
        {
            "name": "Mount Sinai Hospital",
            "address": "600 University Ave, Toronto, ON M5G 1X5",
            "city": "Toronto",
            "coordinates": {"lat": 43.6567, "lng": -79.3900},
            "currentWaitTime": 90,
            "lastUpdated": datetime.utcnow(),
            "phone": "416-596-4200",
            "services": ["Emergency", "Maternity", "Surgery"]
        },
        {
            "name": "St. Michael's Hospital",
            "address": "30 Bond St, Toronto, ON M5B 1W8",
            "city": "Toronto",
            "coordinates": {"lat": 43.6533, "lng": -79.3772},
            "currentWaitTime": 135,
            "lastUpdated": datetime.utcnow(),
            "phone": "416-360-4000",
            "services": ["Emergency", "Trauma", "Cardiology"]
        },
        {
            "name": "Sunnybrook Health Sciences Centre",
            "address": "2075 Bayview Ave, Toronto, ON M4N 3M5",
            "city": "Toronto",
            "coordinates": {"lat": 43.7239, "lng": -79.3759},
            "currentWaitTime": 105,
            "lastUpdated": datetime.utcnow(),
            "phone": "416-480-6100",
            "services": ["Emergency", "Trauma", "Veterans Care"]
        },
        {
            "name": "The Ottawa Hospital - Civic Campus",
            "address": "1053 Carling Ave, Ottawa, ON K1Y 4E9",
            "city": "Ottawa",
            "coordinates": {"lat": 45.3979, "lng": -75.7338},
            "currentWaitTime": 150,
            "lastUpdated": datetime.utcnow(),
            "phone": "613-722-7000",
            "services": ["Emergency", "Trauma", "Surgery"]
        },
        {
            "name": "The Ottawa Hospital - General Campus",
            "address": "501 Smyth Rd, Ottawa, ON K1H 8L6",
            "city": "Ottawa",
            "coordinates": {"lat": 45.4042, "lng": -75.6533},
            "currentWaitTime": 110,
            "lastUpdated": datetime.utcnow(),
            "phone": "613-722-7000",
            "services": ["Emergency", "Cardiac", "Research"]
        },
        {
            "name": "Hamilton General Hospital",
            "address": "237 Barton St E, Hamilton, ON L8L 2X2",
            "city": "Hamilton",
            "coordinates": {"lat": 43.2557, "lng": -79.8480},
            "currentWaitTime": 95,
            "lastUpdated": datetime.utcnow(),
            "phone": "905-527-4322",
            "services": ["Emergency", "Trauma", "Stroke Care"]
        },
        {
            "name": "London Health Sciences Centre - Victoria Hospital",
            "address": "800 Commissioners Rd E, London, ON N6A 5W9",
            "city": "London",
            "coordinates": {"lat": 42.9738, "lng": -81.2178},
            "currentWaitTime": 125,
            "lastUpdated": datetime.utcnow(),
            "phone": "519-685-8500",
            "services": ["Emergency", "Pediatrics", "Surgery"]
        },
        {
            "name": "Trillium Health Partners - Mississauga Hospital",
            "address": "100 Queensway W, Mississauga, ON L5B 1B8",
            "city": "Mississauga",
            "coordinates": {"lat": 43.5890, "lng": -79.6441},
            "currentWaitTime": 140,
            "lastUpdated": datetime.utcnow(),
            "phone": "905-848-7100",
            "services": ["Emergency", "Maternity", "Cardiology"]
        },
        {
            "name": "North York General Hospital",
            "address": "4001 Leslie St, North York, ON M2K 1E1",
            "city": "Toronto",
            "coordinates": {"lat": 43.7653, "lng": -79.3977},
            "currentWaitTime": 100,
            "lastUpdated": datetime.utcnow(),
            "phone": "416-756-6000",
            "services": ["Emergency", "Surgery", "Mental Health"]
        }
    ]
    
    await db.hospitals.insert_many(hospitals)
    logger.info(f"Seeded {len(hospitals)} hospitals into database")

@app.on_event("startup")
async def startup_event():
    await seed_hospitals()

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Ontario ER Finder API", "version": "1.0.0"}

@api_router.get("/hospitals", response_model=List[HospitalResponse])
async def get_all_hospitals():
    """Get all hospitals"""
    hospitals = await db.hospitals.find().to_list(100)
    return [
        HospitalResponse(
            id=str(h["_id"]),
            name=h["name"],
            address=h["address"],
            city=h["city"],
            coordinates=Coordinates(**h["coordinates"]),
            currentWaitTime=h["currentWaitTime"],
            lastUpdated=h["lastUpdated"],
            phone=h["phone"],
            services=h["services"]
        )
        for h in hospitals
    ]

@api_router.get("/hospitals/nearby", response_model=List[HospitalResponse])
async def get_nearby_hospitals(
    lat: float = Query(..., description="User latitude"),
    lng: float = Query(..., description="User longitude"),
    limit: int = Query(10, description="Number of results to return"),
    distance_weight: float = Query(0.5, description="Weight for distance in scoring (0-1)"),
    wait_weight: float = Query(0.5, description="Weight for wait time in scoring (0-1)")
):
    """Get nearby hospitals sorted by distance and wait time"""
    hospitals = await db.hospitals.find().to_list(100)
    
    # Calculate distance and score for each hospital
    results = []
    for h in hospitals:
        distance = calculate_distance(
            lat, lng,
            h["coordinates"]["lat"],
            h["coordinates"]["lng"]
        )
        
        score = calculate_score(
            distance,
            h["currentWaitTime"],
            distance_weight,
            wait_weight
        )
        
        results.append(
            HospitalResponse(
                id=str(h["_id"]),
                name=h["name"],
                address=h["address"],
                city=h["city"],
                coordinates=Coordinates(**h["coordinates"]),
                currentWaitTime=h["currentWaitTime"],
                lastUpdated=h["lastUpdated"],
                phone=h["phone"],
                services=h["services"],
                distance=distance,
                score=score
            )
        )
    
    # Sort by score (lower is better)
    results.sort(key=lambda x: x.score)
    
    return results[:limit]

@api_router.get("/hospitals/{hospital_id}", response_model=HospitalResponse)
async def get_hospital_by_id(hospital_id: str):
    """Get hospital details by ID"""
    try:
        hospital = await db.hospitals.find_one({"_id": ObjectId(hospital_id)})
        if not hospital:
            raise HTTPException(status_code=404, detail="Hospital not found")
        
        return HospitalResponse(
            id=str(hospital["_id"]),
            name=hospital["name"],
            address=hospital["address"],
            city=hospital["city"],
            coordinates=Coordinates(**hospital["coordinates"]),
            currentWaitTime=hospital["currentWaitTime"],
            lastUpdated=hospital["lastUpdated"],
            phone=hospital["phone"],
            services=hospital["services"]
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/calculate-travel-time")
async def calculate_travel_time(
    start_lat: float = Query(..., description="Starting latitude"),
    start_lng: float = Query(..., description="Starting longitude"),
    end_lat: float = Query(..., description="Destination latitude"),
    end_lng: float = Query(..., description="Destination longitude")
):
    """Calculate real driving time using OpenRouteService API"""
    if not ORS_API_KEY:
        # Fallback to estimation if no API key
        distance = calculate_distance(start_lat, start_lng, end_lat, end_lng)
        estimated_time = round((distance / 40) * 60)  # 40 km/h average
        return {
            "duration": estimated_time,
            "distance": distance,
            "source": "estimated"
        }
    
    try:
        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": ORS_API_KEY,
                "Content-Type": "application/json"
            }
            
            payload = {
                "coordinates": [[start_lng, start_lat], [end_lng, end_lat]]
            }
            
            response = await client.post(
                "https://api.openrouteservice.org/v2/directions/driving-car",
                json=payload,
                headers=headers,
                timeout=10.0
            )
            
            if response.status_code == 200:
                data = response.json()
                route = data["routes"][0]
                summary = route["summary"]
                
                # Duration in seconds, convert to minutes
                duration_minutes = round(summary["duration"] / 60)
                # Distance in meters, convert to km
                distance_km = round(summary["distance"] / 1000, 2)
                
                return {
                    "duration": duration_minutes,
                    "distance": distance_km,
                    "source": "openrouteservice"
                }
            else:
                # Fallback to estimation on error
                distance = calculate_distance(start_lat, start_lng, end_lat, end_lng)
                estimated_time = round((distance / 40) * 60)
                return {
                    "duration": estimated_time,
                    "distance": distance,
                    "source": "estimated_fallback"
                }
                
    except Exception as e:
        logger.error(f"OpenRouteService API error: {str(e)}")
        # Fallback to estimation
        distance = calculate_distance(start_lat, start_lng, end_lat, end_lng)
        estimated_time = round((distance / 40) * 60)
        return {
            "duration": estimated_time,
            "distance": distance,
            "source": "estimated_fallback"
        }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
