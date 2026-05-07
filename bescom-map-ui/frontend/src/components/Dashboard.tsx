"use client";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";

const MapCore = dynamic(() => import("./MapCore"), { ssr: false, loading: () => (
  <div style={{ width:"100%",height:"100%",background:"#0c1828",display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8",flexDirection:"column",gap:12 }}>
    <div style={{ width:40,height:40,border:"3px solid #3b82f6",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite" }} />
    <span style={{ fontSize:13 }}>Loading Map…</span>
  </div>
)});

const API = "http://localhost:8000";

const TILES: Record<string, string> = {
  Satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  Street:    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  Dark:      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
};

/* ── Interactive SVG demand chart with hover tooltip ── */
function DemandChart({ hours, currentHour, title }: { hours: any[]; currentHour: number; title?: string }) {
  const [hover, setHover] = useState<number|null>(null);
  if (!hours.length) return <div style={{color:'#475569',fontSize:11,textAlign:'center',padding:20}}>No forecast data for this node</div>;
  const W = 312, H = 120, pad = 28;
  const vals = hours.map(h => h.predicted_mw || 0).filter(Boolean);
  const max = Math.max(...vals, 1), min = 0;
  const px = (i: number) => pad + (i / 23) * (W - pad * 2);
  const py = (v: number) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  const pts = hours.map((h,i) => `${px(i)},${py(h.predicted_mw||0)}`).join(' ');
  const actPts = hours.filter(h=>h.actual_mw!=null).map((h,i)=>`${px(i)},${py(h.actual_mw)}`).join(' ');
  const hov = hover !== null ? hours[hover] : null;
  const actionColor = (a: string) => a==='charge_now'?'#10b981':a==='delay_charge'?'#ef4444':'#f59e0b';
  return (
    <div style={{position:'relative'}}>
      {title && <div style={{fontSize:10,color:'#7dd3fc',marginBottom:4,fontWeight:600}}>{title}</div>}
      <svg width={W} height={H} style={{overflow:'visible',cursor:'crosshair'}}
        onMouseLeave={()=>setHover(null)}>
        <rect x={px(17)} y={pad} width={px(21)-px(17)} height={H-pad*2} fill="#ef444415" rx={2}/>
        <rect x={px(0)} y={pad} width={px(6)-px(0)} height={H-pad*2} fill="#10b98112" rx={2}/>
        <rect x={px(10)} y={pad} width={px(14)-px(10)} height={H-pad*2} fill="#10b98112" rx={2}/>
        <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth={2} opacity={0.8}/>
        {actPts && <polyline points={actPts} fill="none" stroke="#10b981" strokeWidth={1.5}/>}
        <line x1={px(currentHour)} y1={pad} x2={px(currentHour)} y2={H-pad} stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4,3"/>
        {hours.map((h,i)=>(
          <rect key={i} x={px(i)-5} y={pad} width={10} height={H-pad*2} fill="transparent"
            onMouseEnter={()=>setHover(i)}/>
        ))}
        {hover!==null && (
          <>
            <line x1={px(hover)} y1={pad} x2={px(hover)} y2={H-pad} stroke="rgba(255,255,255,0.3)" strokeWidth={1}/>
            <circle cx={px(hover)} cy={py(hov?.predicted_mw||0)} r={4} fill="#3b82f6" stroke="#fff" strokeWidth={1.5}/>
          </>
        )}
        {[0,6,12,18,23].map(i=>(
          <text key={i} x={px(i)} y={H-6} textAnchor="middle" fontSize={9} fill="#64748b">{i}h</text>
        ))}
        {[0,Math.round(max/2),max].map((v,i)=>(
          <text key={i} x={pad-4} y={py(v)+3} textAnchor="end" fontSize={9} fill="#64748b">{Math.round(v)}</text>
        ))}
      </svg>
      {hov && (
        <div style={{position:'absolute',top:0,right:0,background:'rgba(11,22,40,0.95)',border:'1px solid rgba(99,179,255,0.2)',borderRadius:8,padding:'6px 10px',fontSize:10,minWidth:130,zIndex:10,pointerEvents:'none'}}>
          <div style={{fontWeight:700,color:'#e2efff',marginBottom:3}}>{hov.label}</div>
          <div style={{color:'#3b82f6'}}>Predicted: <b>{(hov.predicted_mw||0).toFixed(1)} MW</b></div>
          {hov.actual_mw!=null && <div style={{color:'#10b981'}}>Actual: <b>{hov.actual_mw.toFixed(1)} MW</b></div>}
          {hov.grid_stress!=null && <div style={{color:'#f59e0b'}}>Grid stress: {(hov.grid_stress||0).toFixed(0)}%</div>}
          <div style={{color:actionColor(hov.charging_action||''),marginTop:2,fontWeight:600}}>
            {hov.charging_action==='charge_now'?'✅ Charge Now':hov.charging_action==='delay_charge'?'❌ Delay':'⚠ Flexible'}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── colours ── */
const C = {
  bg: "#0b1628", panel: "#0f2040", border: "rgba(99,179,255,0.15)",
  text: "#e2efff", muted: "#7aa0cc", accent: "#3b82f6", green: "#10b981",
  amber: "#f59e0b", red: "#ef4444", purple: "#a855f7",
};

const s = {
  card: { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10 },
  label: { fontSize: 9, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 1.2, marginBottom: 4 },
  section: { fontSize: 10, color: "#7dd3fc", textTransform: "uppercase" as const, letterSpacing: 1.2, marginBottom: 8, fontWeight: 600 },
};

export default function Dashboard() {
  const [subs,  setSubs]  = useState<any>(null);
  const [lines, setLines] = useState<any>(null);
  const [evs,   setEvs]   = useState<any>(null);
  const [kptcl, setKptcl] = useState<any>(null);
  const [demand, setDemand] = useState<any>(null);
  const [zones,  setZones]  = useState<any[]>([]);
  const [recs,   setRecs]   = useState<any[]>([]);
  const [sched,  setSched]  = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);

  const [tile,      setTile]      = useState("Satellite");
  const [showSubs,  setShowSubs]  = useState(true);
  const [showEvs,   setShowEvs]   = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showRecsMap,  setShowRecsMap]  = useState(false);   // map markers only
  const [showRecsList, setShowRecsList] = useState(false);   // Part B card list
  const [activeTab, setActiveTab] = useState<"A"|"B"|"map">("A");

  const [selectedEv,   setSelectedEv]   = useState<any>(null);
  const [nearest,      setNearest]      = useState<any>(null);
  const [refreshing,   setRefreshing]   = useState(false);
  const [nodeData,     setNodeData]     = useState<any>(null);
  const [nodeLoading,  setNodeLoading]  = useState(false);
  const [selectedNode, setSelectedNode] = useState<string|null>(null);
  const [simStress,    setSimStress]    = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/substations`).then(r=>r.json()).catch(()=>null),
      fetch(`${API}/api/ht_lines`).then(r=>r.json()).catch(()=>null),
      fetch(`${API}/api/ev_stations`).then(r=>r.json()).catch(()=>null),
      fetch(`${API}/api/kptcl/live`).then(r=>r.json()).catch(()=>null),
      fetch(`${API}/api/demand/hourly`).then(r=>r.json()).catch(()=>null),
      fetch(`${API}/api/demand/zones`).then(r=>r.json()).catch(()=>null),
      fetch(`${API}/api/locations/recommendations`).then(r=>r.json()).catch(()=>null),
      fetch(`${API}/api/schedule/optimal`).then(r=>r.json()).catch(()=>null),
      fetch(`${API}/api/ml/metrics`).then(r=>r.json()).catch(()=>null),
    ]).then(([s,h,e,k,d,z,rc,sc,mx]) => {
      if(s) setSubs(s); if(h) setLines(h); if(e) setEvs(e); if(k) setKptcl(k);
      if(d) setDemand(d); if(z) setZones(z.zones||[]); if(rc) setRecs(rc.recommendations||[]);
      if(sc) setSched(sc); if(mx) setMetrics(mx);
    });
  }, []);

  const handleEvClick = useCallback(async (f: any) => {
    setSelectedEv(f); setNearest(null);
    const r = await fetch(`${API}/api/nearest-substation/${f.properties.id}`).catch(()=>null);
    if(r) setNearest(await r.json());
    // Load per-node demand
    const name = f.properties.name || f.properties.operator || '';
    setSelectedNode(name); setNodeData(null); setNodeLoading(true);
    const nd = await fetch(`${API}/api/demand/node/${encodeURIComponent(name)}`).catch(()=>null);
    if(nd) setNodeData(await nd.json());
    setNodeLoading(false);
  }, []);

  const handleSubClick = useCallback(async (name: string) => {
    setSelectedNode(name); setNodeData(null); setNodeLoading(true);
    setActiveTab('A');
    const nd = await fetch(`${API}/api/demand/node/${encodeURIComponent(name)}`).catch(()=>null);
    if(nd) setNodeData(await nd.json());
    setNodeLoading(false);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    const r = await fetch(`${API}/api/kptcl/refresh`).catch(()=>null);
    if(r){ const d=await r.json(); if(d.data) setKptcl(d.data); }
    setRefreshing(false);
  };

  const rawBl = kptcl?.snapshot?.escom_loads?.BESCOM;
  const bl    = simStress ? { actual_mw: 7485, schedule_mw: 6600, ui: "+885" } : rawBl;
  const ui    = parseInt(bl?.ui||"0");
  const freq  = simStress ? 49.82 : 50.06;
  const gridOk = simStress ? false : Math.abs(ui) < 300;

  const totalSubs  = subs?.features.length  || 0;
  const totalEvs   = evs?.features.length   || 0;
  const totalLines = lines?.features.length || 0;

  /* tab button */
  const Tab = ({ id, label }: { id: "A"|"B"|"map"; label: string }) => (
    <button onClick={() => setActiveTab(id)} style={{
      flex:1, padding:"7px 0", fontSize:12, border:"none", cursor:"pointer", borderRadius:6,
      background: activeTab===id ? C.accent : "rgba(255,255,255,0.06)",
      color: activeTab===id ? "#fff" : C.muted, fontWeight: activeTab===id ? 600 : 400,
    }}>{label}</button>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", width:"100vw", height:"100vh", background:C.bg, color:C.text, fontFamily:"'Inter',sans-serif", overflow:"hidden" }}>

      {/* ══ TOP BAR ══ */}
      <header style={{ display:"flex", alignItems:"center", padding:"0 18px", height:50, borderBottom:`1px solid ${simStress ? C.red : C.border}`, background: simStress ? 'rgba(239,68,68,0.1)' : C.panel, flexShrink:0, gap:24, transition:"all 0.3s" }}>
        <div style={{ fontWeight:700, fontSize:16, display:"flex", alignItems:"center", gap:8, marginRight:8, animation: simStress ? "pulseRed 1.5s infinite" : "none" }}>
          <span>⚡</span><span>BESCOM Grid Niraksha</span>
          <span style={{ fontSize:10, color:C.muted, fontWeight:400 }}>· Bengaluru EV Decision Support</span>
        </div>
        {/* KPIs */}
        {[
          { label:"BESCOM Load", val: bl?.actual_mw ? `${bl.actual_mw} MW` : "—", col: C.green },
          { label:"Frequency", val: `${freq} Hz`, col: Math.abs(freq-50)<0.05 ? C.green : C.red },
          { label:"Grid Status", val: gridOk ? "Normal ✓" : "Alert ⚠", col: gridOk ? C.green : C.red },
          { label:"Substations", val: totalSubs.toString(), col: C.amber },
          { label:"EV Stations", val: totalEvs.toString(), col: C.green },
          { label:"Power Lines", val: totalLines.toString(), col: "#3b82f6" },
        ].map(({label,val,col}) => (
          <div key={label} style={{ textAlign:"center", minWidth:72 }}>
            <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase" }}>{label}</div>
            <div style={{ fontSize:14, fontWeight:700, color:col }}>{val}</div>
          </div>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={()=>setSimStress(!simStress)} style={{ background: simStress ? C.red : "rgba(239,68,68,0.1)", border:`1px solid ${simStress ? C.red : "rgba(239,68,68,0.3)"}`, borderRadius:6, padding:"4px 12px", color:simStress?"#fff":C.red, fontSize:11, cursor:"pointer", fontWeight:600, transition:"all 0.3s", animation: simStress ? "pulseRed 1.5s infinite" : "none" }}>
            {simStress ? "🛑 END STRESS SIMULATION" : "🚨 SIMULATE PEAK STRESS"}
          </button>
          <span style={{ fontSize:10, color:C.muted, marginLeft:8 }}>{kptcl?.snapshot?.timestamp || "Loading…"}</span>
          <button onClick={refresh} style={{ background:C.accent, border:"none", borderRadius:6, padding:"4px 12px", color:"#fff", fontSize:12, cursor:"pointer" }}>
            {refreshing ? "↻…" : "↻ Refresh"}
          </button>
        </div>
      </header>

      {/* ══ MAIN ══ */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* ── LEFT: Map Controls ── */}
        <aside style={{ width:220, flexShrink:0, background:C.panel, borderRight:`1px solid ${C.border}`, overflowY:"auto", padding:"12px 10px", display:"flex", flexDirection:"column", gap:8 }}>

          <div style={s.section}>Map Layers</div>
          {[
            { label:`Substations (${totalSubs})`, col:C.amber, val:showSubs, fn:setShowSubs },
            { label:`EV Stations (${totalEvs})`, col:C.green, val:showEvs, fn:setShowEvs },
            { label:`Power Lines (${totalLines})`, col:"#3b82f6", val:showLines, fn:setShowLines },
            { label:`New Sites (${recs.length})`, col:C.purple, val:showRecsMap, fn:setShowRecsMap },
          ].map(({label,col,val,fn}) => (
            <label key={label} style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", fontSize:12 }}>
              <input type="checkbox" checked={val} onChange={()=>fn((v:boolean)=>!v)} style={{accentColor:col}} />
              <span style={{ width:8,height:8,borderRadius:"50%",background:col,display:"inline-block" }}></span>
              {label}
            </label>
          ))}

          <div style={{ marginTop:6, ...s.section }}>Base Map</div>
          {Object.keys(TILES).map(k => (
            <button key={k} onClick={()=>setTile(k)} style={{ padding:"5px 8px", borderRadius:6, fontSize:12, border:"none", cursor:"pointer", marginBottom:4,
              background: tile===k ? C.accent : "rgba(255,255,255,0.07)", color: tile===k ? "#fff" : C.muted }}>
              {k}
            </button>
          ))}

          <div style={{ marginTop:6, ...s.section }}>Legend</div>
          <div style={{ fontSize:10, color:C.muted, lineHeight:1.8 }}>
            <div>🟡 Substation ≥400 MVA</div>
            <div>🟠 Substation 200 MVA</div>
            <div>🟤 Substation &lt;200 MVA</div>
            <div>▲ EV DC Fast ≥50kW</div>
            <div style={{ color:C.purple }}>■ Rec. New Site</div>
            <div style={{ marginTop:6 }}>
              <span style={{ display:"inline-block",width:18,height:3,background:"#ef4444",verticalAlign:"middle" }}></span> EHV ≥220kV<br/>
              <span style={{ display:"inline-block",width:18,height:3,background:"#3b82f6",verticalAlign:"middle" }}></span> 66kV<br/>
              <span style={{ display:"inline-block",width:18,height:3,background:"#06b6d4",verticalAlign:"middle" }}></span> Unknown
            </div>
          </div>

          {/* nearest sub result */}
          {nearest && selectedEv && (
            <div style={{ ...s.card, marginTop:8 }}>
              <div style={{ ...s.label, color:C.green }}>Selected EV</div>
              <div style={{ fontSize:11, fontWeight:600, color:"#6ee7b7", marginBottom:4 }}>{selectedEv.properties.name}</div>
              <div style={{ ...s.label, color:C.amber }}>Nearest Substation</div>
              <div style={{ fontSize:11, fontWeight:600, color:C.amber }}>{nearest.nearest_substation.properties.name}</div>
              <div style={{ fontSize:10, color:C.muted }}>Capacity: {nearest.nearest_substation.properties.capacity_mva} MVA</div>
              <div style={{ marginTop:4, fontSize:11, color:"#f43f5e", fontFamily:"monospace" }}>📏 {nearest.distance_km} km</div>
              <button onClick={()=>{setSelectedEv(null);setNearest(null);}} style={{ marginTop:6, fontSize:10, color:C.muted, background:"none", border:"none", cursor:"pointer" }}>✕ Clear</button>
            </div>
          )}
        </aside>

        {/* ── CENTER: Map ── */}
        <div style={{ flex:1, position:"relative", minWidth:0 }}>
          <MapCore
            subs={subs} evs={evs} lines={lines}
            showSubs={showSubs} showEvs={showEvs} showLines={showLines}
            recSites={recs} showRecs={showRecsMap} tile={tile}
            onEvClick={handleEvClick} onSubClick={handleSubClick}
            nearest={nearest} selectedEv={selectedEv}
          />
          {/* map overlay badge */}
          <div style={{ position:"absolute", top:10, left:"50%", transform:"translateX(-50%)", zIndex:999, background: simStress ? "rgba(239,68,68,0.9)" : "rgba(11,22,40,0.85)", border:`1px solid ${simStress ? C.red : C.border}`, borderRadius:20, padding:"4px 14px", fontSize:11, color: simStress ? "#fff" : C.muted, backdropFilter:"blur(8px)", fontWeight: simStress ? 700 : 400, transition:"all 0.3s", boxShadow: simStress ? "0 0 15px rgba(239,68,68,0.5)" : "none" }}>
            {simStress ? "🚨 CRITICAL GRID EVENT: LOAD SHEDDING IMMINENT" : "🗺 Bengaluru Grid Infrastructure Map"}
          </div>
        </div>

        {/* ── RIGHT: Analytics Panel ── */}
        <aside style={{ width:340, flexShrink:0, background:C.panel, borderLeft:`1px solid ${C.border}`, overflowY:"auto", display:"flex", flexDirection:"column" }}>

          {/* Tabs */}
          <div style={{ display:"flex", gap:6, padding:"10px 10px 0", flexShrink:0 }}>
            <Tab id="A" label="📈 Part A — Demand" />
            <Tab id="B" label="📍 Part B — Locations" />
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:"10px" }}>

            {/* ════ PART A ════ */}
            {activeTab === "A" && (
              <div>
                {/* Grid live banner */}
                <div style={{ ...s.card, background: gridOk ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", borderColor: gridOk ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ ...s.label }}>🔴 KPTCL Live Grid Status</div>
                      <div style={{ fontSize:20, fontWeight:700, color: gridOk ? C.green : C.red }}>{bl?.actual_mw || "—"} <span style={{ fontSize:11, fontWeight:400 }}>MW</span></div>
                      <div style={{ fontSize:11, color:C.muted }}>Sched: {bl?.schedule_mw||"—"} MW · UI: <span style={{ color: ui>0 ? C.red : C.green }}>{bl?.ui||"—"} MW</span></div>
                    </div>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:22, fontWeight:700, color: C.purple }}>{freq}</div>
                      <div style={{ fontSize:9, color:C.muted }}>Hz</div>
                    </div>
                  </div>
                </div>

                {/* 24h demand chart */}
                {demand && (
                  <div style={s.card}>
                    <div style={s.section}>EV Charging Demand Prediction — 24h</div>
                    <div style={{ display:"flex", gap:12, marginBottom:8, fontSize:10 }}>
                      <span style={{ color:"#3b82f6" }}>── Predicted</span>
                      <span style={{ color:C.green }}>── Actual</span>
                      <span style={{ color:"#fbbf24" }}>┄ Now</span>
                    </div>
                    <DemandChart hours={demand.hours} currentHour={demand.current_hour} />
                    <div style={{ display:"flex", gap:10, marginTop:8, fontSize:10 }}>
                      <div style={{ flex:1, background:"rgba(239,68,68,0.1)", borderRadius:6, padding:"6px 8px", border:"1px solid rgba(239,68,68,0.2)" }}>
                        <div style={{ color:C.red, fontWeight:600 }}>⚠ Peak: {demand.peak_mw} MW</div>
                        <div style={{ color:C.muted }}>At {demand.peak_hour}:00 IST</div>
                      </div>
                      <div style={{ flex:1, background:"rgba(16,185,129,0.1)", borderRadius:6, padding:"6px 8px", border:"1px solid rgba(16,185,129,0.2)" }}>
                        <div style={{ color:C.green, fontWeight:600 }}>✅ Off-Peak Windows</div>
                        <div style={{ color:C.muted }}>00–06h · 10–14h</div>
                      </div>
                    </div>
                    <div style={{ marginTop:6, fontSize:9, color:C.muted, display:"flex", alignItems:"center", gap:8 }}>
                      {demand.model && demand.model !== 'synthetic_fallback'
                        ? <span style={{ background:"rgba(16,185,129,0.15)", color:C.green, border:"1px solid rgba(16,185,129,0.3)", borderRadius:4, padding:"2px 6px" }}>🤖 {demand.model}</span>
                        : <span style={{ color:C.muted }}>📌 Synthetic fallback</span>}
                    </div>
                  </div>
                )}

                {/* Charging schedule */}
                {sched && (
                  <div style={s.card}>
                    <div style={s.section}>Optimal Charging Schedule</div>
                    {sched.recommendations.map((r: any) => (
                      <div key={r.window} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"6px 0", borderBottom:`1px solid ${C.border}` }}>
                        <div style={{ minWidth:90, fontSize:11, fontFamily:"monospace", color:C.text }}>{r.window}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:11, fontWeight:600, color: r.type.includes("Best") ? C.green : r.type.includes("Good") ? "#4ade80" : r.type.includes("Avoid") ? C.red : C.amber }}>{r.type}</div>
                          <div style={{ fontSize:10, color:C.muted, lineHeight:1.4 }}>{r.reason}</div>
                        </div>
                        <div style={{ fontSize:11, fontWeight:700, color: r.savings_pct>0 ? C.green : C.red, minWidth:36, textAlign:"right" }}>{r.savings_pct>0?"+":""}{r.savings_pct}%</div>
                      </div>
                    ))}
                    <div style={{ marginTop:8, fontSize:9, color:C.muted }}>Savings % = cost reduction vs unmanaged charging baseline</div>
                  </div>
                )}

                {/* ── Per-node forecast panel (shown when substation/EV station clicked) ── */}
                {selectedNode && (
                  <div style={{ ...s.card, borderColor: nodeData?.has_ml_data ? "rgba(16,185,129,0.35)" : C.border }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      <div style={s.section}>📡 Node: {selectedNode.length > 28 ? selectedNode.slice(0,28)+"…" : selectedNode}</div>
                      <button onClick={()=>{setSelectedNode(null);setNodeData(null);}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>✕</button>
                    </div>
                    {nodeLoading && <div style={{fontSize:11,color:C.muted,textAlign:"center",padding:10}}>⟳ Loading node data…</div>}
                    {nodeData && !nodeLoading && (
                      <>
                        {nodeData.has_ml_data
                          ? <DemandChart hours={nodeData.hours} currentHour={new Date().getHours()} />
                          : <div style={{fontSize:10,color:C.muted,padding:"8px 0"}}>No ML hourly data for this node.</div>}
                        {nodeData.voltage_summary && (
                          <div style={{marginTop:8,padding:"6px 8px",background:"rgba(251,191,36,0.07)",borderRadius:6,border:"1px solid rgba(251,191,36,0.2)"}}>
                            <div style={{fontSize:9,color:"#fbbf24",textTransform:"uppercase",marginBottom:4}}>⚡ Bus Voltage 2024 (KPTCL)</div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:10}}>
                              <div>HV Max: <b style={{color:C.green}}>{nodeData.voltage_summary.hv_max_mean?.toFixed(1)} kV</b></div>
                              <div>HV Min: <b style={{color:C.amber}}>{nodeData.voltage_summary.hv_min_mean?.toFixed(1)} kV</b></div>
                              <div>LV Max: <b style={{color:C.green}}>{nodeData.voltage_summary.lv_max_mean?.toFixed(1) ?? "—"} kV</b></div>
                              <div>LV Min: <b style={{color:C.amber}}>{nodeData.voltage_summary.lv_min_mean?.toFixed(1) ?? "—"} kV</b></div>
                            </div>
                            <div style={{fontSize:9,color:C.muted,marginTop:3}}>{nodeData.voltage_summary.voltage_class} · {nodeData.voltage_summary.months_recorded} months recorded</div>
                          </div>
                        )}
                        {!nodeData.voltage_summary && (
                          <div style={{fontSize:9,color:C.muted,marginTop:4}}>ℹ️ No voltage data matched for this node in KPTCL records</div>
                        )}
                        <div style={{marginTop:4,fontSize:9,color:C.muted}}>source: {nodeData.source}</div>
                      </>
                    )}
                    <div style={{fontSize:9,color:C.muted,marginTop:6}}>💡 Click any orange ● substation or green ▲ EV marker on the map to load its node data</div>
                  </div>
                )}

                {/* Model performance card */}
                {metrics && (
                  <div style={{ ...s.card, background:"rgba(99,102,241,0.08)", borderColor:"rgba(99,102,241,0.25)" }}>
                    <div style={s.section}>🧠 ML Model Performance</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, textAlign:"center" }}>
                      {metrics.metrics?.map((m: any) => (
                        <div key={m.metric} style={{ background:"rgba(0,0,0,0.2)", borderRadius:6, padding:"6px 4px" }}>
                          <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase" }}>{m.metric}</div>
                          <div style={{ fontSize:14, fontWeight:700, color:"#818cf8" }}>{typeof m.value === 'number' ? m.value.toFixed(m.metric==='r2'?3:1) : m.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop:6, fontSize:9, color:C.muted }}>RandomForestRegressor · 30 features · {metrics.train_rows?.toLocaleString()} train rows</div>
                  </div>
                )}
                {/* Zone demand table */}
                <div style={s.card}>
                  <div style={s.section}>Zone Demand Scores</div>
                  {zones.slice(0,5).map((z: any) => (
                    <div key={z.zone} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                      <div style={{ flex:1, fontSize:11 }}>{z.zone}</div>
                      <div style={{ fontSize:10, color:C.muted }}>{z.ev_density} EVs/km²</div>
                      <div style={{ fontSize:12, fontWeight:700, color: z.demand_score>85 ? C.red : z.demand_score>70 ? C.amber : C.green }}>{z.demand_score}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ════ PART B ════ */}
            {activeTab === "B" && (
              <div>
                {/* Zone heatmap scores */}
                <div style={s.card}>
                  <div style={s.section}>High-Demand Zones — Infrastructure Gap</div>
                  {zones.map((z: any) => (
                    <div key={z.zone} style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:3 }}>
                        <span>{z.zone}</span>
                        <span style={{ color:C.muted }}>{z.priority}</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ flex:1, height:6, background:"rgba(255,255,255,0.08)", borderRadius:3, overflow:"hidden" }}>
                          <div style={{ width:`${z.demand_score}%`, height:"100%", background: z.demand_score>85 ? C.red : z.demand_score>70 ? C.amber : C.green, borderRadius:3 }} />
                        </div>
                        <span style={{ fontSize:10, color:C.muted, minWidth:28 }}>{z.demand_score}</span>
                      </div>
                      <div style={{ fontSize:9, color:C.muted }}>Grid: {z.grid_load_pct}% · {z.ev_density} EV/km²</div>
                    </div>
                  ))}
                </div>

                {/* Recommended locations — collapsed by default */}
                <div style={s.card}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: showRecsList ? 8 : 4 }}>
                    <div style={{ ...s.section, marginBottom:0 }}>🏗 Recommended New Stations ({recs.length})</div>
                    <div style={{display:'flex',gap:5,alignItems:'center',flexShrink:0}}>
                      <label title="Show on map" style={{ display:"flex", alignItems:"center", gap:3, fontSize:10, cursor:"pointer", color:C.muted }}>
                        <input type="checkbox" checked={showRecsMap} onChange={()=>setShowRecsMap(v=>!v)} style={{ accentColor:C.purple, width:12, height:12 }} />
                        <span>map</span>
                      </label>
                      <button onClick={()=>setShowRecsList(v=>!v)}
                        style={{background: showRecsList ? 'rgba(168,85,247,0.2)' : 'none', border:`1px solid rgba(168,85,247,0.4)`,borderRadius:5,color:C.purple,fontSize:10,cursor:'pointer',padding:'2px 8px',fontWeight:600}}>
                        {showRecsList ? '▲ Hide' : '▼ Show'}
                      </button>
                    </div>
                  </div>
                  {!showRecsList && (
                    <div style={{fontSize:10,color:C.muted,padding:'4px 0'}}>Click <b style={{color:C.purple}}>▼ Show</b> to expand {recs.length} ML-ranked stations · <span style={{color:C.muted}}>map checkbox = pin on map</span></div>
                  )}
                  {showRecsList && recs.map((r: any) => (
                    <div key={r.rank} style={{ ...s.card, marginBottom:8, background:"rgba(168,85,247,0.08)", borderColor:"rgba(168,85,247,0.25)" }}>
                      <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                        <div style={{ width:26, height:26, borderRadius:6, background:C.purple, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0, color:'#fff' }}>#{r.rank}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:"#d8b4fe", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</div>
                          <div style={{ fontSize:9, color:C.muted, margin:"2px 0", lineHeight:1.4 }}>{r.reason}</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:"3px 8px", fontSize:9, marginTop:2 }}>
                            <span style={{color:C.text}}>🔌 {r.suggested_chargers}× {r.charger_type}</span>
                            <span style={{ color:C.green }}>⚡ +{r.capacity_gap_kw} kW</span>
                            <span style={{ color: r.grid_headroom_mw>40 ? C.green : C.amber }}>Grid: {r.grid_headroom_mw} MW</span>
                          </div>
                        </div>
                        <div style={{ textAlign:"center", minWidth:34, flexShrink:0 }}>
                          <div style={{ fontSize:16, fontWeight:700, color: r.score>90 ? C.green : r.score>80 ? C.amber : C.muted }}>{r.score}</div>
                          <div style={{ fontSize:8, color:C.muted }}>score</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize:9, color:C.muted, marginTop:4, borderTop:`1px solid ${C.border}`, paddingTop:4 }}>📌 40% EV gap · 35% grid stress · 25% capacity pressure</div>
                </div>

                {/* Summary callout */}
                <div style={{ ...s.card, background:"rgba(59,130,246,0.08)", borderColor:"rgba(59,130,246,0.25)" }}>
                  <div style={s.section}>Decision Support Summary</div>
                  <div style={{ fontSize:11, lineHeight:1.7, color:C.text }}>
                    <div>🔴 <b>3 Critical zones</b> need immediate infrastructure</div>
                    <div>🟠 <b>Whitefield &amp; Electronic City</b> flagged as priority corridors</div>
                    <div>⚡ <b>Evening 17:00–22:00</b> is peak load window — schedule shift recommended</div>
                    <div>✅ <b>Off-peak window 00:00–06:00</b> offers 35% cost savings</div>
                    <div>🏗 <b>5 recommended sites</b> align with substation proximity &lt;2.5 km</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulseRed { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 70% { box-shadow: 0 0 0 6px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(99,179,255,0.2); border-radius: 3px; }
        .leaflet-popup-content-wrapper { font-family: Inter,sans-serif !important; border-radius: 10px !important; }
      `}</style>
    </div>
  );
}
