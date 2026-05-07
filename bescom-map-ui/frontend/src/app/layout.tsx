import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "BESCOM Grid Niraksha — Bengaluru EV & Grid Map",
  description: "Interactive map of BESCOM substations, EV charging stations, and HT power lines in Bengaluru.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ height: "100%", margin: 0, padding: 0, overflow: "hidden", background: "#0c0f1a" }}>
        {children}
      </body>
    </html>
  );
}
