from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "outputs"
MASTER_PATH = OUTPUT_DIR / "ev_grid_eda_master_2024_enriched.csv"
EVENTS_PATH = OUTPUT_DIR / "ev_grid_outage_events_enriched_2024.csv"

FORECAST_OUT = OUTPUT_DIR / "ev_hourly_demand_forecast_2024.csv"
INFRA_OUT = OUTPUT_DIR / "ev_infrastructure_priority_zones_2024.csv"
METRICS_OUT = OUTPUT_DIR / "ev_mvp_metrics_2024.csv"


def load_data() -> tuple[pd.DataFrame, pd.DataFrame]:
    master = pd.read_csv(MASTER_PATH, low_memory=False)
    events = pd.read_csv(EVENTS_PATH, low_memory=False)
    master["timestamp"] = pd.to_datetime(master["timestamp"], format="%d/%m/%y %H:%M", errors="coerce")
    master["date"] = pd.to_datetime(master["date"], format="%d/%m/%y", errors="coerce").dt.date
    events["date"] = pd.to_datetime(events["date"], errors="coerce").dt.date
    master = master.dropna(subset=["timestamp", "date"]).sort_values("timestamp").reset_index(drop=True)
    events = events.dropna(subset=["date"]).reset_index(drop=True)
    return master, events


def add_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("timestamp").copy()
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)
    df["is_morning_commute"] = df["hour"].between(7, 10)
    df["is_offpeak_window"] = df["hour"].isin([0, 1, 2, 3, 4, 5, 13, 14, 15])
    df["is_weekday"] = ~df["is_weekend"].astype(bool)
    return df


def synthesize_ev_demand(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    base_curve = np.select(
        [
            df["hour"].between(0, 5),
            df["hour"].between(6, 9),
            df["hour"].between(10, 16),
            df["hour"].between(17, 22),
        ],
        [0.20, 0.55, 0.40, 1.00],
        default=0.35,
    )

    weekend_multiplier = np.where(df["is_weekend"], 0.88, 1.0)
    outage_penalty = 1 - np.clip(df["outages_active_hour"].fillna(0) / 12, 0, 0.35)
    stress_penalty = 1 - np.clip(df["grid_stress_index_0_100"].fillna(0) / 250, 0, 0.30)
    prior_load_signal = np.clip(df["load_2023_mw"] / df["daily_peak_load_2024_mw"], 0.25, 1.1)

    # Use nearest EV distance inversely when available; otherwise fall back to citywide average propensity.
    nearest_ev = df["nearest_ev_distance_km_hour"].fillna(df["nearest_ev_distance_km_hour"].median())
    ev_access_factor = np.clip(1.4 - np.log1p(nearest_ev) / 2.5, 0.55, 1.35)

    resource_boost = np.where(df["dominant_power_resource_day"].eq("hydro"), 1.06, 1.0)
    solar_midday_discount = np.where(df["hour"].between(11, 15), 0.92, 1.0)

    scale_mw = np.clip(df["daily_peak_load_2024_mw"] * 0.045, 180, 900)
    df["synthetic_ev_demand_mw"] = (
        scale_mw
        * base_curve
        * weekend_multiplier
        * outage_penalty
        * stress_penalty
        * prior_load_signal
        * ev_access_factor
        * resource_boost
        * solar_midday_discount
    ).round(3)

    df["synthetic_ev_demand_share"] = (df["synthetic_ev_demand_mw"] / df["load_2024_mw"]).clip(0, 0.20)
    return df


def add_lag_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("timestamp").copy()
    for col in ["load_2024_mw", "synthetic_ev_demand_mw", "outages_active_hour", "grid_stress_index_0_100"]:
        df[f"{col}_lag_1h"] = df[col].shift(1)
        df[f"{col}_lag_24h"] = df[col].shift(24)
    df["load_2024_mw_roll_3h"] = df["load_2024_mw"].rolling(3, min_periods=1).mean()
    df["synthetic_ev_demand_roll_3h"] = df["synthetic_ev_demand_mw"].rolling(3, min_periods=1).mean()
    return df


def train_forecast_model(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    df = df.copy()
    target_col = "synthetic_ev_demand_mw"

    cutoff = df["timestamp"].quantile(0.80)
    train_df = df[df["timestamp"] <= cutoff].copy()
    test_df = df[df["timestamp"] > cutoff].copy()

    numeric_features = [
        "hour",
        "day_of_year",
        "load_2024_mw",
        "load_2023_mw",
        "frequency_hz",
        "grid_stress_index_0_100",
        "outages_active_hour",
        "outage_active_minutes_hour",
        "transformer_outages_started_hour",
        "line_outages_started_hour",
        "avg_transformer_capacity_mva_hour",
        "avg_line_capacity_kv_hour",
        "nearest_ev_distance_km_hour",
        "resource_thermal_share_day",
        "resource_hydro_share_day",
        "resource_solar_share_day",
        "load_2024_mw_lag_1h",
        "load_2024_mw_lag_24h",
        "synthetic_ev_demand_mw_lag_1h",
        "synthetic_ev_demand_mw_lag_24h",
        "outages_active_hour_lag_1h",
        "outages_active_hour_lag_24h",
        "grid_stress_index_0_100_lag_1h",
        "grid_stress_index_0_100_lag_24h",
        "load_2024_mw_roll_3h",
        "synthetic_ev_demand_roll_3h",
        "hour_sin",
        "hour_cos",
        "month_sin",
        "month_cos",
    ]
    categorical_features = [
        "day_of_week",
        "month_name",
        "dominant_power_resource_day",
        "charging_window_recommendation",
        "nearest_ev_point_name_hour",
        "likely_resource_for_transformer_hour",
    ]

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", Pipeline([("imputer", SimpleImputer(strategy="median"))]), numeric_features),
            ("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]), categorical_features),
        ]
    )

    model = Pipeline(
        steps=[
            ("prep", preprocessor),
            ("rf", RandomForestRegressor(n_estimators=220, random_state=42, n_jobs=-1, min_samples_leaf=2)),
        ]
    )

    X_train = train_df[numeric_features + categorical_features]
    y_train = train_df[target_col]
    X_test = test_df[numeric_features + categorical_features]
    y_test = test_df[target_col]

    model.fit(X_train, y_train)
    test_df["predicted_ev_demand_mw"] = model.predict(X_test).round(3)
    test_df["forecast_abs_error_mw"] = (test_df["predicted_ev_demand_mw"] - y_test).abs().round(3)

    metrics = pd.DataFrame(
        [
            {"metric": "mae_mw", "value": mean_absolute_error(y_test, test_df["predicted_ev_demand_mw"])},
            {"metric": "rmse_mw", "value": mean_squared_error(y_test, test_df["predicted_ev_demand_mw"]) ** 0.5},
            {"metric": "r2", "value": r2_score(y_test, test_df["predicted_ev_demand_mw"])},
            {"metric": "train_rows", "value": float(len(train_df))},
            {"metric": "test_rows", "value": float(len(test_df))},
        ]
    )

    df["predicted_ev_demand_mw"] = np.nan
    df.loc[test_df.index, "predicted_ev_demand_mw"] = test_df["predicted_ev_demand_mw"]
    return df, metrics


def add_scheduling_outputs(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    forecast = df["predicted_ev_demand_mw"].fillna(df["synthetic_ev_demand_mw"])

    df["managed_ev_shift_mw"] = np.where(
        (df["hour"].between(18, 22)) & (df["grid_stress_index_0_100"] >= 65),
        np.minimum(forecast * 0.35, df["ev_shift_potential_mw"].fillna(0) * 0.6),
        0.0,
    ).round(3)

    df["recommended_charge_score"] = (
        100
        - df["grid_stress_index_0_100"].fillna(0)
        + np.where(df["is_offpeak_window"], 18, 0)
        + np.where(df["dominant_power_resource_day"].eq("hydro"), 6, 0)
        - np.where(df["outages_active_hour"].fillna(0) > 3, 12, 0)
    ).clip(0, 100).round(2)

    df["charging_action"] = np.select(
        [
            df["recommended_charge_score"] >= 72,
            df["recommended_charge_score"] <= 45,
        ],
        ["charge_now", "delay_charge"],
        default="flexible",
    )
    return df


def build_infra_priority(master: pd.DataFrame, events: pd.DataFrame) -> pd.DataFrame:
    event_geo = events.dropna(subset=["event_geo_lat", "event_geo_lon"]).copy()
    event_geo["location_zone_key"] = event_geo["event_location_name_matched"].fillna(event_geo["transmission_zone"]).fillna("UNKNOWN")

    if event_geo.empty:
        return pd.DataFrame(columns=["location_zone_key"])

    zone_daily = (
        event_geo.groupby(["location_zone_key", "date"])
        .agg(
            outages=("serial_no", "count"),
            avg_transformer_capacity_mva=("transformer_capacity_mva", "mean"),
            avg_line_capacity_kv=("line_capacity_kv", "mean"),
            nearest_ev_distance_km=("nearest_ev_point_distance_km", "mean"),
            lat=("event_geo_lat", "mean"),
            lon=("event_geo_lon", "mean"),
        )
        .reset_index()
    )

    master_geo = master.dropna(subset=["outage_location_centroid_lat_hour", "outage_location_centroid_lon_hour"]).copy()
    master_geo["location_zone_key"] = master_geo["nearest_ev_point_name_hour"].fillna("GRID_ZONE")

    zone_hourly = (
        event_geo.groupby("location_zone_key")
        .agg(
            outage_events_total=("serial_no", "count"),
            transformer_events_total=("asset_type", lambda s: (s == "transformer").sum()),
            line_events_total=("asset_type", lambda s: (s == "line").sum()),
            avg_nearest_ev_distance_km=("nearest_ev_point_distance_km", "mean"),
            avg_transformer_capacity_mva=("transformer_capacity_mva", "mean"),
            avg_line_capacity_kv=("line_capacity_kv", "mean"),
            lat=("event_geo_lat", "mean"),
            lon=("event_geo_lon", "mean"),
        )
        .reset_index()
    )

    zone_demand = (
        zone_daily.groupby("location_zone_key")
        .agg(
            outage_days=("date", "nunique"),
            daily_outage_mean=("outages", "mean"),
            daily_outage_p95=("outages", lambda s: s.quantile(0.95)),
        )
        .reset_index()
    )

    zone = zone_hourly.merge(zone_demand, on="location_zone_key", how="left")
    zone["ev_service_gap_score"] = np.clip(zone["avg_nearest_ev_distance_km"].fillna(zone["avg_nearest_ev_distance_km"].median()) * 8, 0, 100)
    zone["grid_reliability_stress_score"] = np.clip(
        zone["outage_events_total"] * 0.08 + zone["daily_outage_p95"].fillna(0) * 4 + zone["transformer_events_total"] * 0.25,
        0,
        100,
    )
    zone["infra_capacity_pressure_score"] = np.clip(
        (1 / zone["avg_transformer_capacity_mva"].fillna(zone["avg_transformer_capacity_mva"].median()).clip(lower=5)) * 800
        + zone["line_events_total"] * 0.15,
        0,
        100,
    )
    zone["priority_score_0_100"] = (
        0.40 * zone["ev_service_gap_score"]
        + 0.35 * zone["grid_reliability_stress_score"]
        + 0.25 * zone["infra_capacity_pressure_score"]
    ).round(2)
    zone["recommended_station_action"] = np.select(
        [
            zone["priority_score_0_100"] >= 70,
            zone["priority_score_0_100"] >= 50,
        ],
        ["build_new_fast_charging_hub", "add_incremental_charging_capacity"],
        default="monitor_only",
    )
    return zone.sort_values("priority_score_0_100", ascending=False)


def main():
    master, events = load_data()
    master = add_temporal_features(master)
    master = synthesize_ev_demand(master)
    master = add_lag_features(master)
    master, metrics = train_forecast_model(master)
    master = add_scheduling_outputs(master)

    forecast_cols = [
        "date",
        "timestamp",
        "hour",
        "day_of_week",
        "load_2024_mw",
        "load_2023_mw",
        "synthetic_ev_demand_mw",
        "predicted_ev_demand_mw",
        "managed_ev_shift_mw",
        "recommended_charge_score",
        "charging_action",
        "grid_stress_index_0_100",
        "outages_active_hour",
        "dominant_power_resource_day",
        "nearest_ev_point_name_hour",
        "nearest_ev_distance_km_hour",
    ]
    forecast_df = master[forecast_cols].copy()

    infra_df = build_infra_priority(master, events)

    forecast_df.to_csv(FORECAST_OUT, index=False)
    infra_df.to_csv(INFRA_OUT, index=False)
    metrics.to_csv(METRICS_OUT, index=False)

    print(f"Forecast rows: {len(forecast_df)}")
    print(f"Infrastructure zones: {len(infra_df)}")
    print(f"Metrics file: {METRICS_OUT}")
    print(f"Top infra zone: {infra_df.iloc[0]['location_zone_key'] if len(infra_df) else 'NA'}")


if __name__ == "__main__":
    main()
