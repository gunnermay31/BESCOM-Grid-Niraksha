"use client";
import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("@/components/Dashboard"), {
  ssr: false,
  loading: () => (
    <div style={{ width:"100vw", height:"100vh", background:"#0b1628", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, fontFamily:"Inter,sans-serif" }}>
      <div style={{ width:48, height:48, border:"4px solid #3b82f6", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 1s linear infinite" }} />
      <div style={{ color:"#7aa0cc", fontSize:14 }}>Loading BESCOM Grid Niraksha…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  ),
});

export default function Home() {
  return <Dashboard />;
}
