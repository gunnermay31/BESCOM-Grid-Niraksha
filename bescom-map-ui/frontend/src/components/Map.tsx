"use client";
import { useEffect, useRef, useState, useCallback } from "react";

interface Feature { type: string; geometry: any; properties: Record<string, any> }
interface FC { type: string; features: Feature[] }

// Line colors by voltage
function getLineStyle(voltage: string) {
  const v = parseInt(voltage || "0");
  if (v >= 220000 || (v >= 220 && v < 1000)) return { color: "#ef4444", weight: 3 };
  if (v >= 110000 || (v >= 110 && v < 1000)) return { color: "#f97316", weight: 2.5 };
  if (v >= 66000  || (v >= 66  && v < 1000)) return { color: "#3b82f6", weight: 2 };
  if (v >= 33000  || (v >= 33  && v < 1000)) return { color: "#8b5cf6", weight: 1.5 };
  if (v > 0)                                  return { color: "#64748b", weight: 1 };
  return { color: "#06b6d4", weight: 2 };
}

const TILE_OPTIONS = {
  street: { label: "Street", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" },
  satellite: { label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" },
  topo: { label: "Topo", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" },
  dark: { label: "Dark", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" },
} as const;
type TileKey = keyof typeof TILE_OPTIONS;

export default function BescomMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const linesRef = useRef<any>(null);

  const [subs,  setSubs]  = useState<FC | null>(null);
  const [lines, setLines] = useState<FC | null>(null);
  const [evs,   setEvs]   = useState<FC | null>(null);
  const [kptcl, setKptcl] = useState<any>(null);
  const [tile,  setTile]  = useState<TileKey>("satellite");
  const [zoom,  setZoom]  = useState(11);
  const [showSubs,  setShowSubs]  = useState(true);
  const [showEvs,   setShowEvs]   = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [selectedEv, setSelectedEv] = useState<Feature | null>(null);
  const [nearest,    setNearest]    = useState<any>(null);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mapReady, setMapReady]    = useState(false);
  const connLineRef = useRef<any>(null);

  // Initialize Leaflet map imperatively (avoids SSR/hydration issues)
  useEffect(() => {
    if (!mapRef.current) return;
    // Guard against React StrictMode double-invoke and HMR re-runs
    const container = mapRef.current as any;
    if (container._leaflet_id) return;
    if (leafletMapRef.current) return;

    import("leaflet").then((L) => {
      // Double-check after async import
      if ((mapRef.current as any)?._leaflet_id) return;

      const map = L.map(mapRef.current!, {
        center: [12.9716, 77.5946],
        zoom: 11,
        zoomControl: true,
      });

      tileLayerRef.current = L.tileLayer(TILE_OPTIONS.satellite.url, {
        maxZoom: 20,
        attribution: "Tiles &copy; Esri",
      }).addTo(map);

      map.on("zoomend", () => setZoom(map.getZoom()));
      leafletMapRef.current = map;
      setMapReady(true);
    });

    return () => {
      // Only remove on true unmount, not StrictMode double-run
      // Use a timeout so StrictMode cleanup doesn't kill the real mount
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // Fetch data
  useEffect(() => {
    (async () => {
      const [s, h, e, k] = await Promise.all([
        fetch("http://localhost:8000/api/substations").then(r => r.json()).catch(() => null),
        fetch("http://localhost:8000/api/ht_lines").then(r => r.json()).catch(() => null),
        fetch("http://localhost:8000/api/ev_stations").then(r => r.json()).catch(() => null),
        fetch("http://localhost:8000/api/kptcl/live").then(r => r.json()).catch(() => null),
      ]);
      if (s) setSubs(s);
      if (h) setLines(h);
      if (e) setEvs(e);
      if (k) setKptcl(k);
    })();
  }, []);

  // Change tile layer
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;
    import("leaflet").then((L) => {
      if (tileLayerRef.current) {
        tileLayerRef.current.remove();
      }
      tileLayerRef.current = L.tileLayer(TILE_OPTIONS[tile].url, {
        maxZoom: 20,
      }).addTo(leafletMapRef.current);
    });
  }, [tile, mapReady]);

  // Render lines
  useEffect(() => {
    if (!mapReady || !lines || !leafletMapRef.current) return;
    import("leaflet").then((L) => {
      if (linesRef.current) linesRef.current.remove();
      if (!showLines) return;
      linesRef.current = L.geoJSON(lines as any, {
        style: (feat) => getLineStyle(feat?.properties?.voltage || "0"),
        onEachFeature: (feat, layer) => {
          const p = feat.properties;
          layer.bindPopup(`<b style="color:#3b82f6">${p.name || "Power Line"}</b><br/>
            Class: ${p.line_class || "—"}<br/>Voltage: ${p.voltage || "—"}`);
        }
      }).addTo(leafletMapRef.current);
    });
  }, [mapReady, lines, showLines]);

  // Render substation markers
  useEffect(() => {
    if (!mapReady || !subs || !leafletMapRef.current) return;
    import("leaflet").then((L) => {
      markersRef.current.forEach(m => m._sub && m.remove());
      if (!showSubs) return;
      subs.features.forEach((f) => {
        const mva = f.properties.capacity_mva;
        const size = mva >= 400 ? 18 : mva >= 200 ? 14 : 10;
        const color = mva >= 400 ? "#f59e0b" : mva >= 200 ? "#fb923c" : "#fbbf24";
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 6px ${color}88;"></div>`,
          iconSize: [size, size], iconAnchor: [size/2, size/2],
        });
        const m: any = L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { icon });
        m._sub = true;
        m.bindPopup(`<div style="min-width:200px;font-family:Inter,sans-serif;font-size:12px">
          <b style="color:#f59e0b;font-size:14px">${f.properties.name}</b><br/>
          Capacity: ${mva} MVA (${f.properties.capacity_raw})<br/>
          ${f.properties.bescom_total_actual_mw ? `BESCOM Total: ${f.properties.bescom_total_actual_mw} MW<br/>` : ""}
          <span style="font-size:10px;color:#6b7280;font-family:monospace">📍 ${f.properties.lat?.toFixed(5)}, ${f.properties.lon?.toFixed(5)}</span>
        </div>`);
        m.addTo(leafletMapRef.current);
        markersRef.current.push(m);
      });
    });
  }, [mapReady, subs, showSubs]);

  // Render EV markers
  useEffect(() => {
    if (!mapReady || !evs || !leafletMapRef.current) return;
    import("leaflet").then((L) => {
      markersRef.current.forEach(m => m._ev && m.remove());
      if (!showEvs) return;
      evs.features.forEach((f) => {
        const kw = f.properties.max_power_kw || 7;
        const size = kw >= 50 ? 14 : kw >= 22 ? 12 : 10;
        const color = kw >= 50 ? "#10b981" : kw >= 22 ? "#34d399" : "#6ee7b7";
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:0;height:0;border-left:${size/2}px solid transparent;border-right:${size/2}px solid transparent;border-bottom:${size}px solid ${color};filter:drop-shadow(0 0 4px ${color}99);"></div>`,
          iconSize: [size, size], iconAnchor: [size/2, size],
        });
        const m: any = L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { icon });
        m._ev = true;
        m.bindPopup(`<div style="min-width:210px;font-family:Inter,sans-serif;font-size:12px">
          <b style="color:#10b981;font-size:13px">${f.properties.name}</b><br/>
          ${f.properties.address}<br/>
          Chargers: ${f.properties.chargers} · ${kw} kW<br/>
          Operator: ${f.properties.operator}<br/>
          <span style="font-size:10px;color:#6b7280;font-family:monospace">📍 ${f.properties.lat?.toFixed(5)}, ${f.properties.lon?.toFixed(5)}</span>
        </div>`);
        m.on("click", () => handleEvClick(f));
        m.addTo(leafletMapRef.current);
        markersRef.current.push(m);
      });
    });
  }, [mapReady, evs, showEvs]);

  // Connection line between selected EV and nearest sub
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;
    import("leaflet").then((L) => {
      if (connLineRef.current) connLineRef.current.remove();
      if (!nearest || !selectedEv) return;
      connLineRef.current = L.polyline([
        [selectedEv.geometry.coordinates[1], selectedEv.geometry.coordinates[0]],
        [nearest.nearest_substation.geometry.coordinates[1], nearest.nearest_substation.geometry.coordinates[0]],
      ], { color: "#f43f5e", weight: 3, dashArray: "10, 12", opacity: 0.95 }).addTo(leafletMapRef.current);
    });
  }, [mapReady, nearest, selectedEv]);

  const handleEvClick = useCallback(async (f: Feature) => {
    setSelectedEv(f);
    setNearest(null);
    setLoading(true);
    try {
      const r = await fetch(`http://localhost:8000/api/nearest-substation/${f.properties.id}`);
      setNearest(await r.json());
    } catch {}
    setLoading(false);
  }, []);

  const refreshKPTCL = async () => {
    setRefreshing(true);
    try {
      const r = await fetch("http://localhost:8000/api/kptcl/refresh");
      const d = await r.json();
      if (d.data) setKptcl(d.data);
    } catch {}
    setRefreshing(false);
  };

  const bescomLoad = kptcl?.snapshot?.escom_loads?.BESCOM;
  const totalSubs  = subs?.features.length || 0;
  const totalEvs   = evs?.features.length  || 0;
  const totalLines = lines?.features.length || 0;

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden", fontFamily: "'Inter', sans-serif" }}>

      {/* SIDEBAR */}
      <aside style={{
        width: 310, minWidth: 280, flexShrink: 0,
        background: "linear-gradient(180deg,#1e3a5f 0%,#0f2744 100%)",
        color: "#f0f7ff", display: "flex", flexDirection: "column",
        borderRight: "1px solid rgba(255,255,255,0.1)",
        zIndex: 1000, boxShadow: "4px 0 20px rgba(0,0,0,0.5)", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <span>⚡</span><span>BESCOM Grid Niraksha</span>
          </div>
          <div style={{ fontSize: 11, color: "#94c8ff", marginTop: 3 }}>
            Bengaluru EV Infrastructure & Grid Map
          </div>
        </div>

        {/* KPTCL Live */}
        {bescomLoad ? (
          <div style={{ margin: "10px 10px 0", background: "rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(99,179,255,0.2)" }}>
            <div style={{ fontSize: 10, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
              <span>🔴 KPTCL Live — BESCOM</span>
              <button onClick={refreshKPTCL} style={{ background: "none", border: "none", color: "#7dd3fc", cursor: "pointer", fontSize: 13 }} title="Refresh">{refreshing ? "⟳…" : "⟳"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px" }}>
              <div><div style={{ color: "#94a3b8", fontSize: 9 }}>Actual Load</div>
                <div style={{ fontWeight: 700, color: "#4ade80", fontSize: 20 }}>{bescomLoad.actual_mw} <span style={{ fontSize: 10, fontWeight: 400 }}>MW</span></div></div>
              <div><div style={{ color: "#94a3b8", fontSize: 9 }}>Schedule</div>
                <div style={{ fontWeight: 600, color: "#fbbf24", fontSize: 15 }}>{bescomLoad.schedule_mw} MW</div></div>
              <div><div style={{ color: "#94a3b8", fontSize: 9 }}>Unscheduled (UI)</div>
                <div style={{ fontWeight: 600, color: parseInt(bescomLoad.ui) > 0 ? "#f87171" : "#34d399", fontSize: 13 }}>{bescomLoad.ui} MW</div></div>
              <div><div style={{ color: "#94a3b8", fontSize: 9 }}>Frequency</div>
                <div style={{ fontWeight: 600, color: "#c4b5fd", fontSize: 13 }}>50.06 Hz</div></div>
            </div>
            <div style={{ fontSize: 9, color: "#475569", marginTop: 5 }}>As of: {kptcl?.snapshot?.timestamp}</div>
          </div>
        ) : (
          <div style={{ margin: "10px 10px 0", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px", fontSize: 12, color: "#64748b" }}>
            ⚡ Loading KPTCL live data...
          </div>
        )}

        {/* Tile switcher */}
        <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 9, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>Base Map</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {(Object.keys(TILE_OPTIONS) as TileKey[]).map(k => (
              <button key={k} onClick={() => setTile(k)} style={{
                padding: "4px 11px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "none",
                background: tile === k ? "#3b82f6" : "rgba(255,255,255,0.1)",
                color: tile === k ? "#fff" : "#94a3b8", fontWeight: tile === k ? 600 : 400,
              }}>{TILE_OPTIONS[k].label}</button>
            ))}
          </div>
        </div>

        {/* Layer toggles */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 9, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>Layers</div>
          {[
            { label: `Substations (${totalSubs})`, color: "#f59e0b", val: showSubs, fn: setShowSubs },
            { label: `EV Stations (${totalEvs})`, color: "#10b981", val: showEvs, fn: setShowEvs },
            { label: `Power Lines (${totalLines})`, color: "#3b82f6", val: showLines, fn: setShowLines },
          ].map(({ label, color, val, fn }) => (
            <label key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={val} onChange={() => fn((v: boolean) => !v)} style={{ accentColor: color }} />
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, display: "inline-block" }}></span>
              <span style={{ fontSize: 12 }}>{label}</span>
            </label>
          ))}
        </div>

        {/* Legend - Line Voltage */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 9, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>Line Voltage</div>
          {[
            { color: "#ef4444", label: "EHV ≥ 220 kV", w: 4 },
            { color: "#f97316", label: "HV  110 kV", w: 3 },
            { color: "#3b82f6", label: "MV   66 kV", w: 2.5 },
            { color: "#8b5cf6", label: "MV   33 kV", w: 2 },
            { color: "#06b6d4", label: "Unknown", w: 2 },
          ].map(({ color, label, w }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ width: 22, height: w, background: color, borderRadius: 2, flexShrink: 0 }}></div>
              <span style={{ fontSize: 11 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Legend - Markers */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 9, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>Markers</div>
          {[
            { icon: "●", color: "#f59e0b", label: "Substation ≥400 MVA", sz: 16 },
            { icon: "●", color: "#fb923c", label: "Substation 200 MVA",  sz: 13 },
            { icon: "●", color: "#fbbf24", label: "Substation <200 MVA", sz: 10 },
            { icon: "▲", color: "#10b981", label: "EV Fast ≥50 kW DC",  sz: 14 },
            { icon: "▲", color: "#34d399", label: "EV AC 22-49 kW",     sz: 12 },
            { icon: "▲", color: "#6ee7b7", label: "EV Slow <22 kW",     sz: 10 },
          ].map(({ icon, color, label, sz }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ color, fontSize: sz, width: 16, textAlign: "center" }}>{icon}</span>
              <span style={{ fontSize: 11 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Selection info */}
        <div style={{ padding: "10px 12px", flex: 1 }}>
          {selectedEv ? (
            <div>
              <div style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "10px", marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: "#34d399", marginBottom: 3, textTransform: "uppercase" }}>Selected EV Station</div>
                <div style={{ fontWeight: 600, color: "#6ee7b7" }}>{selectedEv.properties.name}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{selectedEv.properties.address}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 12, marginTop: 4 }}>
                  <span>🔌 {selectedEv.properties.chargers}</span>
                  <span>⚡ {selectedEv.properties.max_power_kw} kW</span>
                </div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 3, fontFamily: "monospace" }}>
                  📍 {selectedEv.properties.lat?.toFixed(5)}, {selectedEv.properties.lon?.toFixed(5)}
                </div>
              </div>
              {loading ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>⟳ Finding nearest substation...</div>
              ) : nearest ? (
                <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: "10px" }}>
                  <div style={{ fontSize: 9, color: "#fbbf24", textTransform: "uppercase", marginBottom: 3 }}>🏗 Nearest Substation</div>
                  <div style={{ fontWeight: 600, color: "#f59e0b" }}>{nearest.nearest_substation.properties.name}</div>
                  <div style={{ fontSize: 11, marginTop: 3 }}>Capacity: {nearest.nearest_substation.properties.capacity_mva} MVA</div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 2, fontFamily: "monospace" }}>
                    📍 {nearest.nearest_substation.properties.lat?.toFixed(5)}, {nearest.nearest_substation.properties.lon?.toFixed(5)}
                  </div>
                  <div style={{ marginTop: 6, background: "rgba(0,0,0,0.3)", borderRadius: 5, padding: "4px 8px", display: "inline-block", fontSize: 12, color: "#f43f5e", fontFamily: "monospace" }}>
                    📏 {nearest.distance_km} km estimated
                  </div>
                </div>
              ) : null}
              <button onClick={() => { setSelectedEv(null); setNearest(null); }}
                style={{ marginTop: 8, fontSize: 11, color: "#64748b", background: "none", border: "none", cursor: "pointer" }}>
                ✕ Clear
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
              Click any <span style={{ color: "#10b981" }}>▲ green EV marker</span> to find the nearest substation and cable distance.
            </div>
          )}
        </div>

        <div style={{ padding: "6px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 9, color: "#334155" }}>
          Zoom: {zoom} · Data: BESCOM · KPTCL SLDC · OSM
        </div>
      </aside>

      {/* MAP CONTAINER — pure div, Leaflet initializes into it */}
      <div ref={mapRef} style={{ flex: 1, height: "100vh" }} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .leaflet-popup-content-wrapper {
          border-radius: 10px !important;
          font-family: Inter, sans-serif !important;
        }
      `}</style>
    </div>
  );
}
