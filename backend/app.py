from __future__ import annotations
from typing import Optional

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query


ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "outputs"

FORECAST_PATH = OUTPUT_DIR / "ev_hourly_demand_forecast_2024.csv"
INFRA_PATH = OUTPUT_DIR / "ev_infrastructure_priority_zones_2024.csv"
ZONE_GRAPH_NODES_PATH = OUTPUT_DIR / "zone_graph_nodes_2024.csv"
ZONE_GRAPH_EDGES_PATH = OUTPUT_DIR / "zone_graph_edges_2024.csv"
ZONE_HOURLY_PATH = OUTPUT_DIR / "zone_hour_ev_training_dataset_2024.csv"

app = FastAPI(title="BESCOM EV Intelligence API", version="0.1.0")


def frame_rows(df: pd.DataFrame) -> list[dict]:
    clean = df.replace({np.nan: None})
    clean = clean.astype(object).where(pd.notna(clean), None)
    return clean.to_dict(orient="records")


@lru_cache(maxsize=1)
def load_forecast() -> pd.DataFrame:
    df = pd.read_csv(FORECAST_PATH, low_memory=False)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df


@lru_cache(maxsize=1)
def load_infra() -> pd.DataFrame:
    return pd.read_csv(INFRA_PATH, low_memory=False)


@lru_cache(maxsize=1)
def load_zone_nodes() -> pd.DataFrame:
    return pd.read_csv(ZONE_GRAPH_NODES_PATH, low_memory=False)


@lru_cache(maxsize=1)
def load_zone_edges() -> pd.DataFrame:
    return pd.read_csv(ZONE_GRAPH_EDGES_PATH, low_memory=False)


@lru_cache(maxsize=1)
def load_zone_hour() -> pd.DataFrame:
    df = pd.read_csv(ZONE_HOURLY_PATH, low_memory=False)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"service": "BESCOM EV Intelligence API", "status": "ok"}


@app.get("/forecast/hourly")
def forecast_hourly(limit: int = Query(default=48, ge=1, le=500)):
    df = load_forecast().head(limit)
    return {"rows": frame_rows(df)}


@app.get("/forecast/zone-hour")
def forecast_zone_hour(zone: Optional[str] = None, limit: int = Query(default=200, ge=1, le=1000)):
    df = load_zone_hour()
    if zone:
        df = df[df["zone_key"].str.lower() == zone.lower()]
    if df.empty:
        raise HTTPException(status_code=404, detail="No zone-hour forecast rows found")
    return {"rows": frame_rows(df.head(limit))}


@app.get("/recommendations/charging")
def charging_recommendations(action: Optional[str] = None, limit: int = Query(default=100, ge=1, le=1000)):
    df = load_forecast()
    if action:
        df = df[df["charging_action"] == action]
    df = df.sort_values(["recommended_charge_score", "managed_ev_shift_mw"], ascending=[False, False])
    return {"rows": frame_rows(df.head(limit))}


@app.get("/recommendations/infrastructure")
def infrastructure_recommendations(limit: int = Query(default=50, ge=1, le=500)):
    df = load_infra().sort_values("priority_score_0_100", ascending=False)
    return {"rows": frame_rows(df.head(limit))}


@app.get("/graph/zones")
def graph_zones():
    return {
        "nodes": frame_rows(load_zone_nodes()),
        "edges": frame_rows(load_zone_edges()),
    }


@app.get("/api/substations")
def api_substations(limit: int = Query(default=500, ge=1, le=5000)):
    df = load_zone_nodes().copy()
    return {"rows": frame_rows(df.head(limit))}


@app.get("/api/zone-graph")
def api_zone_graph():
    return graph_zones()


@app.get("/api/infrastructure")
def api_infrastructure(limit: int = Query(default=50, ge=1, le=500)):
    return infrastructure_recommendations(limit=limit)


@app.get("/api/charging-recommendations")
def api_charging_recommendations(action: Optional[str] = None, limit: int = Query(default=100, ge=1, le=1000)):
    return charging_recommendations(action=action, limit=limit)


@app.get("/api/forecast/hourly")
def api_forecast_hourly(limit: int = Query(default=48, ge=1, le=500)):
    return forecast_hourly(limit=limit)


@app.get("/api/forecast/zone-hour")
def api_forecast_zone_hour(zone: Optional[str] = None, limit: int = Query(default=200, ge=1, le=1000)):
    return forecast_zone_hour(zone=zone, limit=limit)
