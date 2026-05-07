from __future__ import annotations

from pathlib import Path

import networkx as nx
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
EVENTS_PATH = ROOT / "outputs" / "ev_grid_outage_events_enriched_2024.csv"
MASTER_PATH = ROOT / "outputs" / "ev_grid_eda_master_2024_enriched.csv"
OUTPUT_DIR = ROOT / "outputs"
ZONE_NODES_OUT = OUTPUT_DIR / "zone_graph_nodes_2024.csv"
ZONE_EDGES_OUT = OUTPUT_DIR / "zone_graph_edges_2024.csv"


def normalize_zone(value: object) -> str:
    text = str(value or "").strip()
    return text if text else "UNKNOWN"


def build_zone_nodes(events: pd.DataFrame, master: pd.DataFrame) -> pd.DataFrame:
    events = events.copy()
    events["zone_key"] = events["event_location_name_matched"].fillna(events["transmission_zone"]).map(normalize_zone)

    zone_event = (
        events.groupby("zone_key")
        .agg(
            event_count=("serial_no", "count"),
            transformer_events=("asset_type", lambda s: (s == "transformer").sum()),
            line_events=("asset_type", lambda s: (s == "line").sum()),
            avg_transformer_capacity_mva=("transformer_capacity_mva", "mean"),
            avg_line_capacity_kv=("line_capacity_kv", "mean"),
            avg_ev_distance_km=("nearest_ev_point_distance_km", "mean"),
            lat=("event_geo_lat", "mean"),
            lon=("event_geo_lon", "mean"),
            dominant_resource=("dominant_power_resource_day", lambda s: s.dropna().mode().iloc[0] if len(s.dropna()) else None),
        )
        .reset_index()
    )

    master_zone = (
        master.dropna(subset=["outage_location_centroid_lat_hour", "outage_location_centroid_lon_hour"])
        .groupby(master["nearest_ev_point_name_hour"].fillna("GRID_ZONE"))
        .agg(
            mean_load_2024_mw=("load_2024_mw", "mean"),
            mean_stress=("grid_stress_index_0_100", "mean"),
            mean_predicted_ev_mw=("predicted_ev_demand_mw", "mean") if "predicted_ev_demand_mw" in master.columns else ("load_2024_mw", "mean"),
        )
        .reset_index()
        .rename(columns={"nearest_ev_point_name_hour": "zone_key"})
    )

    return zone_event.merge(master_zone, on="zone_key", how="left")


def build_zone_edges(events: pd.DataFrame) -> pd.DataFrame:
    events = events.copy()
    events["zone_key"] = events["event_location_name_matched"].fillna(events["transmission_zone"]).map(normalize_zone)

    edges: dict[tuple[str, str], int] = {}
    for _, row in events.iterrows():
        zones = [normalize_zone(row["transmission_zone"]), normalize_zone(row["event_location_name_matched"])]
        zones = [z for z in zones if z != "UNKNOWN"]
        zones = list(dict.fromkeys(zones))
        if len(zones) < 2:
            continue
        a, b = sorted(zones[:2])
        edges[(a, b)] = edges.get((a, b), 0) + 1

    edge_rows = [{"source_zone": a, "target_zone": b, "shared_event_weight": w} for (a, b), w in edges.items()]
    return pd.DataFrame(edge_rows)


def main():
    events = pd.read_csv(EVENTS_PATH, low_memory=False)
    master = pd.read_csv(MASTER_PATH, low_memory=False)

    nodes = build_zone_nodes(events, master)
    edges = build_zone_edges(events)

    graph = nx.Graph()
    for _, row in nodes.iterrows():
        graph.add_node(row["zone_key"], **row.to_dict())
    for _, row in edges.iterrows():
        graph.add_edge(row["source_zone"], row["target_zone"], weight=row["shared_event_weight"])

    degree = dict(graph.degree())
    betweenness = nx.betweenness_centrality(graph, weight="weight") if graph.number_of_edges() else {}
    nodes["graph_degree"] = nodes["zone_key"].map(degree).fillna(0)
    nodes["graph_betweenness"] = nodes["zone_key"].map(betweenness).fillna(0)

    nodes.to_csv(ZONE_NODES_OUT, index=False)
    edges.to_csv(ZONE_EDGES_OUT, index=False)

    print(f"Zone nodes: {len(nodes)}")
    print(f"Zone edges: {len(edges)}")
    print(f"Top node: {nodes.sort_values('event_count', ascending=False).iloc[0]['zone_key'] if len(nodes) else 'NA'}")


if __name__ == "__main__":
    main()
