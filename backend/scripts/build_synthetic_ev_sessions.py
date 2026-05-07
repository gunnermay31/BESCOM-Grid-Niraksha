from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "outputs" / "ev_hourly_demand_forecast_2024.csv"
ZONE_PATH = ROOT / "outputs" / "ev_infrastructure_priority_zones_2024.csv"
OUTPUT_DIR = ROOT / "outputs"
SESSIONS_OUT = OUTPUT_DIR / "synthetic_ev_sessions_2024.csv"
ZONE_HOURLY_OUT = OUTPUT_DIR / "zone_hour_ev_training_dataset_2024.csv"


RNG = np.random.default_rng(42)


def load_inputs() -> tuple[pd.DataFrame, pd.DataFrame]:
    hourly = pd.read_csv(MASTER_PATH, low_memory=False)
    zones = pd.read_csv(ZONE_PATH, low_memory=False)
    hourly["timestamp"] = pd.to_datetime(hourly["timestamp"])
    hourly["date"] = pd.to_datetime(hourly["date"]).dt.date
    return hourly, zones


def assign_zone_weights(zones: pd.DataFrame) -> pd.DataFrame:
    zones = zones.copy()
    score = zones["priority_score_0_100"].fillna(zones["priority_score_0_100"].median())
    weights = np.clip(score, 5, None)
    zones["zone_sampling_weight"] = weights / weights.sum()
    return zones


def simulate_sessions(hourly: pd.DataFrame, zones: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    zones = assign_zone_weights(zones)
    zone_names = zones["location_zone_key"].tolist()
    zone_weights = zones["zone_sampling_weight"].to_numpy()

    sessions: list[dict] = []
    zone_hour: list[dict] = []

    for _, row in hourly.iterrows():
        ts = row["timestamp"]
        base_demand = float(row["predicted_ev_demand_mw"] if pd.notna(row["predicted_ev_demand_mw"]) else row["synthetic_ev_demand_mw"])
        if base_demand <= 0:
            continue

        approx_sessions = min(40, max(1, int(round(base_demand / 0.35))))
        for _ in range(approx_sessions):
            zone_idx = RNG.choice(len(zone_names), p=zone_weights)
            zone = zones.iloc[zone_idx]
            user_class = RNG.choice(["home", "fleet", "commercial"], p=[0.55, 0.20, 0.25])
            charger_type = RNG.choice(["ac_slow", "ac_fast", "dc_fast"], p=[0.55, 0.30, 0.15])
            requested_kwh = float(
                np.clip(
                    RNG.normal(
                        loc={"home": 12, "fleet": 28, "commercial": 18}[user_class],
                        scale={"home": 4, "fleet": 8, "commercial": 6}[user_class],
                    ),
                    4,
                    60,
                )
            )
            flexibility_score = float(
                np.clip(
                    RNG.normal(
                        loc={"home": 0.75, "fleet": 0.35, "commercial": 0.50}[user_class],
                        scale=0.12,
                    ),
                    0.05,
                    0.98,
                )
            )
            max_power_kw = {"ac_slow": 7.4, "ac_fast": 22.0, "dc_fast": 60.0}[charger_type]

            sessions.append(
                {
                    "timestamp": ts,
                    "date": row["date"],
                    "hour": row["hour"],
                    "zone_key": zone["location_zone_key"],
                    "user_class": user_class,
                    "charger_type": charger_type,
                    "requested_kwh": round(requested_kwh, 3),
                    "flexibility_score": round(flexibility_score, 4),
                    "max_power_kw": max_power_kw,
                    "grid_stress_index_0_100": row["grid_stress_index_0_100"],
                    "charging_action": row["charging_action"],
                }
            )

        zone_mix = RNG.multinomial(max(1, min(20, approx_sessions)), zone_weights)
        for idx, count in enumerate(zone_mix):
            if count == 0:
                continue
            zone = zones.iloc[idx]
            estimated_zone_ev_mw = base_demand * (count / approx_sessions)
            zone_hour.append(
                {
                    "timestamp": ts,
                    "date": row["date"],
                    "hour": row["hour"],
                    "zone_key": zone["location_zone_key"],
                    "zone_priority_score": zone["priority_score_0_100"],
                    "zone_lat": zone.get("lat"),
                    "zone_lon": zone.get("lon"),
                    "avg_nearest_ev_distance_km": zone.get("avg_nearest_ev_distance_km"),
                    "grid_load_2024_mw": row["load_2024_mw"],
                    "grid_stress_index_0_100": row["grid_stress_index_0_100"],
                    "managed_ev_shift_mw": row["managed_ev_shift_mw"],
                    "dominant_power_resource_day": row["dominant_power_resource_day"],
                    "charging_action": row["charging_action"],
                    "simulated_session_count": int(count),
                    "simulated_zone_ev_demand_mw": round(estimated_zone_ev_mw, 4),
                }
            )

    sessions_df = pd.DataFrame(sessions)
    zone_hour_df = pd.DataFrame(zone_hour)
    return sessions_df, zone_hour_df


def main():
    hourly, zones = load_inputs()
    sessions_df, zone_hour_df = simulate_sessions(hourly, zones)

    sessions_df.to_csv(SESSIONS_OUT, index=False)
    zone_hour_df.to_csv(ZONE_HOURLY_OUT, index=False)

    print(f"Synthetic sessions: {len(sessions_df)}")
    print(f"Zone-hour rows: {len(zone_hour_df)}")
    print(f"Unique zones: {zone_hour_df['zone_key'].nunique() if len(zone_hour_df) else 0}")


if __name__ == "__main__":
    main()
