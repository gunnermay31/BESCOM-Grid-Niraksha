"""
Fetch real-time KPTCL SLDC data and merge with substation coordinates.
Scrapes: ESCOM Wise 220kV Load page (BESCOM substation actual loads)
"""
import requests
from bs4 import BeautifulSoup
import json, re
from pathlib import Path
from datetime import datetime

DATA_DIR = Path(__file__).resolve().parent / "data"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://kptclsldc.in/",
}

def fetch_kptcl_snapshot():
    """Fetch main KPTCL SLDC snapshot page data"""
    url = "https://kptclsldc.in/Snapshot.aspx"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15, verify=False)
        soup = BeautifulSoup(r.text, "html.parser")
        tables = soup.find_all("table")
        
        result = {}
        
        # Get timestamp from page
        ts = soup.find(string=re.compile(r"\d{2}/\d{2}/\d{4}"))
        result["timestamp"] = str(ts).strip() if ts else datetime.now().strftime("%d/%m/%Y %H:%M")
        
        # Parse ESCOM loads table
        for t in tables:
            rows = t.find_all("tr")
            if any("BESCOM" in str(r) for r in rows):
                escom_loads = {}
                for row in rows:
                    cells = [c.get_text(strip=True) for c in row.find_all(["td","th"])]
                    if len(cells) >= 3 and cells[0] in ["BESCOM","MESCOM","CESC","GESCOM","HESCOM"]:
                        escom_loads[cells[0]] = {
                            "schedule_mw": cells[1] if len(cells)>1 else "?",
                            "actual_mw": cells[2] if len(cells)>2 else "?",
                            "ui": cells[3] if len(cells)>3 else "?"
                        }
                if escom_loads:
                    result["escom_loads"] = escom_loads
                    break
        
        return result
    except Exception as e:
        return {"error": str(e), "timestamp": datetime.now().isoformat()}

def fetch_bescom_220kv():
    """Fetch BESCOM 220kV substation real-time load data"""
    # Try the ESCOM-wise 220kV load page
    urls_to_try = [
        "https://kptclsldc.in/ESCOMs220kV.aspx",
        "https://kptclsldc.in/bescom.aspx",
        "https://kptclsldc.in/EscomWise220kVLoad.aspx",
    ]
    
    for url in urls_to_try:
        try:
            r = requests.get(url, headers=HEADERS, timeout=15, verify=False)
            if r.status_code == 200 and "BESCOM" in r.text:
                soup = BeautifulSoup(r.text, "html.parser")
                tables = soup.find_all("table")
                
                stations = {}
                for t in tables:
                    rows = t.find_all("tr")
                    for row in rows:
                        cells = [c.get_text(strip=True) for c in row.find_all(["td","th"])]
                        # Look for station data rows (station name + numeric values)
                        if len(cells) >= 3 and cells[0] and not cells[0].startswith("STATION"):
                            try:
                                # Try to parse a numeric load value
                                load = float(cells[1].replace(",","")) if cells[1] else None
                                if load is not None:
                                    stations[cells[0].upper()] = {
                                        "transformer_load": load,
                                        "net_load": float(cells[3].replace(",","")) if len(cells)>3 else load,
                                        "entitlement": float(cells[4].replace(",","")) if len(cells)>4 else None,
                                    }
                            except (ValueError, IndexError):
                                pass
                
                if stations:
                    print(f"  ✅ Got {len(stations)} stations from {url}")
                    return stations
        except Exception as e:
            print(f"  ⚠ {url}: {e}")
    
    return {}

if __name__ == "__main__":
    import urllib3
    urllib3.disable_warnings()
    
    print("Fetching KPTCL SLDC data...")
    
    snapshot = fetch_kptcl_snapshot()
    print(f"  Snapshot: {snapshot.get('timestamp', '?')}")
    if "escom_loads" in snapshot:
        for k, v in snapshot["escom_loads"].items():
            print(f"    {k}: actual={v['actual_mw']} MW (sched={v['schedule_mw']} MW)")
    
    stations_220kv = fetch_bescom_220kv()
    
    # Save combined result
    out = {
        "fetched_at": datetime.now().isoformat(),
        "snapshot": snapshot,
        "stations_220kv": stations_220kv
    }
    with open(DATA_DIR / "kptcl_live.json", "w") as f:
        json.dump(out, f, indent=2)
    print(f"  ✅ Saved to kptcl_live.json")
    
    # Now merge live load data with substations.geojson
    with open(DATA_DIR / "substations.geojson") as f:
        subs = json.load(f)
    
    matched = 0
    for feat in subs["features"]:
        name = feat["properties"]["name"].upper()
        # Try exact match and partial match
        live = stations_220kv.get(name, {})
        if not live:
            for k, v in stations_220kv.items():
                if name in k or k in name:
                    live = v
                    break
        
        if live:
            feat["properties"]["live_load_mw"] = live.get("net_load")
            feat["properties"]["transformer_load_mw"] = live.get("transformer_load")
            feat["properties"]["entitlement_mw"] = live.get("entitlement")
            matched += 1
        else:
            feat["properties"]["live_load_mw"] = None
    
    # Add BESCOM total from snapshot
    if "escom_loads" in snapshot and "BESCOM" in snapshot["escom_loads"]:
        bl = snapshot["escom_loads"]["BESCOM"]
        for feat in subs["features"]:
            feat["properties"]["bescom_total_actual_mw"] = bl.get("actual_mw")
            feat["properties"]["bescom_total_schedule_mw"] = bl.get("schedule_mw")
            feat["properties"]["bescom_ui_mw"] = bl.get("ui")
            feat["properties"]["data_timestamp"] = snapshot.get("timestamp")
    
    with open(DATA_DIR / "substations.geojson", "w") as f:
        json.dump(subs, f, indent=2)
    print(f"  ✅ Merged live data: {matched}/{len(subs['features'])} stations matched")
