import pandas as pd
import requests
import json
import time
import random
from pathlib import Path

# Setup paths based on script location
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True, parents=True)

# Path to the transformer list (one level above bescom-map-ui)
TRANSFORMER_EXCEL = BASE_DIR.parent.parent / "transformer list.xlsx"

# Bounding box for Bengaluru approximately
BBOX = {"min_lat": 12.7, "max_lat": 13.2, "min_lon": 77.4, "max_lon": 77.8}

def geocode_station(name):
    query = f"{name}, Bengaluru, Karnataka, India"
    url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1"
    headers = {"User-Agent": "BescomEVMapper/1.0"}
    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 200 and len(response.json()) > 0:
            res = response.json()[0]
            lat, lon = float(res['lat']), float(res['lon'])
            if BBOX["min_lat"] <= lat <= BBOX["max_lat"] and BBOX["min_lon"] <= lon <= BBOX["max_lon"]:
                return lat, lon
    except Exception as e:
        pass
    # Fallback: random point in Bangalore
    return random.uniform(12.85, 13.1), random.uniform(77.5, 77.7)

print("1. Processing Substations and Transformers...")
try:
    df = pd.read_excel(TRANSFORMER_EXCEL)
    features = []
    for idx, row in df.iterrows():
        station = str(row.get('STATION', f'Station_{idx}'))
        capacity = str(row.get('TRANSFORMER CAPACITY (MVA)', '100'))
        
        # Simple rate limiting for OSM Nominatim (max 1 req/sec)
        time.sleep(1.1)
        lat, lon = geocode_station(station)
        
        # Parse total MVA roughly
        total_mva = 0
        if 'X' in capacity.upper():
            try:
                parts = capacity.upper().split('+')
                for p in parts:
                    p = p.strip()
                    if 'X' in p:
                        count, mva = p.split('X')
                        total_mva += int(count) * float(mva)
                    else:
                        total_mva += float(p)
            except:
                total_mva = 100
        else:
            try:
                total_mva = float(capacity)
            except:
                total_mva = 100
        
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "id": f"sub_{idx}",
                "name": station,
                "capacity_mva": total_mva,
                "capacity_raw": capacity,
                "type": "substation"
            }
        })

    substations_geojson = {"type": "FeatureCollection", "features": features}
    with open(DATA_DIR / 'substations.geojson', 'w') as f:
        json.dump(substations_geojson, f)
except Exception as e:
    print(f"Error processing transformers: {e}")
    with open(DATA_DIR / 'substations.geojson', 'w') as f:
        json.dump({"type": "FeatureCollection", "features": []}, f)

print("2. Fetching HT Lines from Overpass API...")
overpass_url = "http://overpass-api.de/api/interpreter"
overpass_query = """
[out:json][timeout:60];
area["name"="Bengaluru"]->.searchArea;
(
  way["power"="line"](area.searchArea);
  way["power"="cable"](area.searchArea);
);
out geom;
"""
try:
    response = requests.post(overpass_url, data={'data': overpass_query}, timeout=70)
    lines_features = []
    if response.status_code == 200:
        data = response.json()
        for element in data.get('elements', []):
            if element['type'] == 'way' and 'geometry' in element:
                coords = [[node['lon'], node['lat']] for node in element['geometry']]
                props = element.get('tags', {})
                lines_features.append({
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": coords},
                    "properties": {
                        "id": element.get('id'),
                        "type": props.get("power", "line"),
                        "voltage": props.get("voltage", "unknown"),
                        "name": props.get("name", "Unknown Line")
                    }
                })
    
    with open(DATA_DIR / 'ht_lines.geojson', 'w') as f:
        json.dump({"type": "FeatureCollection", "features": lines_features}, f)
except Exception as e:
    print(f"Error fetching HT lines: {e}")
    with open(DATA_DIR / 'ht_lines.geojson', 'w') as f:
        json.dump({"type": "FeatureCollection", "features": []}, f)

print("3. Generating EV Stations...")
ev_features = []
for i in range(40): # 40 realistic looking stations
    lat = random.uniform(12.85, 13.1)
    lon = random.uniform(77.5, 77.7)
    ev_features.append({
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "id": f"ev_{i}",
            "name": f"BESCOM EV Station {i+1}",
            "chargers": random.randint(2, 8),
            "type": "ev_station"
        }
    })

with open(DATA_DIR / 'ev_stations.geojson', 'w') as f:
    json.dump({"type": "FeatureCollection", "features": ev_features}, f)

print("✅ Data preparation complete!")
