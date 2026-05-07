# Idea Submission: BESCOM Grid Niraksha

## 1. Problem Statement
The rapid adoption of Electric Vehicles (EVs) introduces highly variable loads to the existing electrical distribution network. Currently, BESCOM requires a data-driven approach to:
- Predict EV charging demand dynamically across time and spatial zones.
- Optimize the placement of new charging infrastructure without exacerbating grid stress.
- Schedule optimal charging periods to flatten the load curve and reduce peak demand.

## 2. Proposed Solution
**Grid Niraksha** is an AI-powered spatial decision-support system. It integrates actual infrastructure data, historical KPTCL bus voltage telemetry, and synthetic baseline estimations to generate actionable insights. The system acts as a non-intrusive monitoring layer.

### Core Capabilities:
- **Part A (EV Charging Demand & Scheduling):** Uses a `RandomForestRegressor` (R²=0.981) to predict localized EV demand. Provides specific node-by-node 24-hour demand curves. Recommends time-of-use charging (e.g., charge overnight, delay during peak 17:00-21:00) offering up to 35% estimated load-shifting savings.
- **Part B (Charging Infrastructure Planning):** Generates ML-ranked priority locations for new charging stations based on a 40% EV service gap + 35% grid stress + 25% transformer capacity pressure weighted scoring model. 
- **Explainable & Actionable UI:** A dark-themed, highly interactive Next.js map dashboard overlaying EHV lines, substations, and current EV stations. Clicking specific substations yields real-time granular voltage information (HV/LV max and min) alongside its demand projection.

## 3. Technology Stack
- **Frontend:** Next.js, React, Leaflet (React-Leaflet) for geospatial visualization.
- **Backend/Middleware:** FastAPI (Python), serving concurrent data streams from models and scrapers.
- **Data & AI/ML Pipeline:** Python, Pandas, Scikit-learn (RandomForest). Includes robust data synthesis methods for fallback and data alignment tools (e.g., KPTCL live scraping).
- **Topology Analytics:** Haversine-based distance matrices for substation-to-EV proximity calculations.

## 4. Key Outcomes & Impact
- Improved infrastructure planning visibility for city engineers and grid planners.
- Reduced risk of local transformer overload through predictive scheduling insights.
- Actionable decision support with clear, measurable model performance metrics directly embedded in the user interface.
