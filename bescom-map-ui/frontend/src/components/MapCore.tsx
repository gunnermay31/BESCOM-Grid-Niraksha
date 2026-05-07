"use client";
import { useEffect, useRef, useState } from "react";

const TILES: Record<string, string> = {
  Satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  Street:    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  Dark:      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
};

function lineStyle(v: string) {
  const n = parseInt(v || "0");
  if (n >= 220000 || (n >= 220 && n < 1000)) return { color: "#ef4444", weight: 3 };
  if (n >= 66000  || (n >= 66  && n < 1000)) return { color: "#3b82f6", weight: 2 };
  return { color: "#06b6d4", weight: 1.5 };
}

interface Props {
  subs: any; evs: any; lines: any;
  showSubs: boolean; showEvs: boolean; showLines: boolean;
  recSites: any[]; showRecs: boolean; tile: string;
  onEvClick: (f: any) => void;
  onSubClick?: (name: string) => void;
  nearest: any; selectedEv: any;
}

export default function MapCore({ subs, evs, lines, showSubs, showEvs, showLines, recSites, showRecs, tile, onEvClick, onSubClick, nearest, selectedEv }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const connRef = useRef<any>(null);

  useEffect(() => {
    if (!ref.current || (ref.current as any)._leaflet_id) return;
    import("leaflet").then((L) => {
      if ((ref.current as any)?._leaflet_id) return;
      const map = L.map(ref.current!, { center: [12.9716, 77.5946], zoom: 11 });
      tileRef.current = L.tileLayer(TILES[tile] || TILES.Satellite, { maxZoom: 20 }).addTo(map);
      mapRef.current = map;
    });
  }, []);

  // tile change
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      tileRef.current?.remove();
      tileRef.current = L.tileLayer(TILES[tile] || TILES.Satellite, { maxZoom: 20 }).addTo(mapRef.current);
    });
  }, [tile]);

  // lines
  const linesLayerRef = useRef<any>(null);
  useEffect(() => {
    if (!mapRef.current || !lines) return;
    import("leaflet").then((L) => {
      linesLayerRef.current?.remove();
      if (!showLines) return;
      linesLayerRef.current = L.geoJSON(lines, {
        style: (f: any) => lineStyle(f?.properties?.voltage || "0"),
        onEachFeature: (f: any, l: any) => l.bindPopup(`<b>${f.properties.name || "Power Line"}</b><br/>Voltage: ${f.properties.voltage || "—"}`),
      }).addTo(mapRef.current);
    });
  }, [mapRef.current, lines, showLines]);

  // substations
  const subsLayerRef = useRef<any[]>([]);
  useEffect(() => {
    if (!mapRef.current || !subs) return;
    import("leaflet").then((L) => {
      subsLayerRef.current.forEach(m => m.remove());
      subsLayerRef.current = [];
      if (!showSubs) return;
      subs.features.forEach((f: any) => {
        const mva = f.properties.capacity_mva;
        const sz = mva >= 400 ? 18 : mva >= 200 ? 14 : 10;
        const col = mva >= 400 ? "#f59e0b" : mva >= 200 ? "#fb923c" : "#fbbf24";
        const icon = L.divIcon({ className: "", html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${col};border:2px solid #fff;box-shadow:0 0 6px ${col}88"></div>`, iconSize: [sz, sz], iconAnchor: [sz/2, sz/2] });
        const m = L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { icon });
        m.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:12px"><b style="color:#f59e0b">${f.properties.name}</b><br/>Capacity: ${mva} MVA<br/><span style="font-size:10px;color:#888">📍 ${f.properties.lat?.toFixed(4)}, ${f.properties.lon?.toFixed(4)}</span></div>`);
        m.on("click", () => onSubClick && onSubClick(f.properties.name));
        m.addTo(mapRef.current);
        subsLayerRef.current.push(m);
      });
    });
  }, [mapRef.current, subs, showSubs]);

  // EV stations
  const evsLayerRef = useRef<any[]>([]);
  useEffect(() => {
    if (!mapRef.current || !evs) return;
    import("leaflet").then((L) => {
      evsLayerRef.current.forEach(m => m.remove());
      evsLayerRef.current = [];
      if (!showEvs) return;
      evs.features.forEach((f: any) => {
        const kw = f.properties.max_power_kw || 7;
        const sz = kw >= 50 ? 14 : kw >= 22 ? 12 : 10;
        const col = kw >= 50 ? "#10b981" : kw >= 22 ? "#34d399" : "#6ee7b7";
        const icon = L.divIcon({ className: "", html: `<div style="width:0;height:0;border-left:${sz/2}px solid transparent;border-right:${sz/2}px solid transparent;border-bottom:${sz}px solid ${col};filter:drop-shadow(0 0 3px ${col})"></div>`, iconSize: [sz, sz], iconAnchor: [sz/2, sz] });
        const m = L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { icon });
        m.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:12px"><b style="color:#10b981">${f.properties.name}</b><br/>${f.properties.chargers} chargers · ${kw} kW<br/>${f.properties.operator}<br/><span style="font-size:10px;color:#888">📍 ${f.properties.lat?.toFixed(4)}, ${f.properties.lon?.toFixed(4)}</span></div>`);
        m.on("click", () => onEvClick(f));
        m.addTo(mapRef.current);
        evsLayerRef.current.push(m);
      });
    });
  }, [mapRef.current, evs, showEvs]);

  // Recommended sites
  const recLayerRef = useRef<any[]>([]);
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      recLayerRef.current.forEach(m => m.remove());
      recLayerRef.current = [];
      if (!showRecs || !recSites.length) return;
      recSites.forEach((r: any) => {
        const icon = L.divIcon({ className: "", html: `<div style="width:20px;height:20px;border-radius:4px;background:#a855f7;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;box-shadow:0 0 8px #a855f799">${r.rank}</div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
        const m = L.marker([r.lat, r.lon], { icon });
        m.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:12px;min-width:200px"><b style="color:#a855f7">#${r.rank} ${r.name}</b><br/>Score: ${r.score}/100<br/>Chargers: ${r.suggested_chargers} × ${r.charger_type}<br/>${r.reason}<br/><span style="font-size:10px;color:#888">Nearest sub: ${r.nearest_sub} (${r.nearest_sub_dist_km} km)</span></div>`);
        m.addTo(mapRef.current);
        recLayerRef.current.push(m);
      });
    });
  }, [mapRef.current, recSites, showRecs]);

  // connection line
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      connRef.current?.remove();
      if (!nearest || !selectedEv) return;
      connRef.current = L.polyline([
        [selectedEv.geometry.coordinates[1], selectedEv.geometry.coordinates[0]],
        [nearest.nearest_substation.geometry.coordinates[1], nearest.nearest_substation.geometry.coordinates[0]],
      ], { color: "#f43f5e", weight: 3, dashArray: "10,10" }).addTo(mapRef.current);
    });
  }, [nearest, selectedEv]);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}
