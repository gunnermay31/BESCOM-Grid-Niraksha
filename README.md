# BESCOM Grid Niraksha: EV & Grid Decision Support System

An advanced AI-powered decision support system designed for Bangalore Electricity Supply Company (BESCOM). It enables data-driven infrastructure planning for EV charging stations by predicting demand patterns and recommending optimal charging locations while considering grid constraints and real-world KPTCL telemetry.

## Directory Structure

- `backend/`: Python backend containing the Machine Learning API (`app.py`), the trained Random Forest EV demand model, and data pipelines. Runs on port 8001.
- `bescom-map-ui/backend/`: Gateway API (`main.py`) serving frontend endpoints, processing geospatial files, and integrating KPTCL live grid data. Runs on port 8000.
- `bescom-map-ui/frontend/`: Next.js frontend providing an interactive dashboard and real-time visualization layer. Runs on port 3000.
- `eda_full.py`: Complete end-to-end data processing and model training pipeline.
- `BESCOM_EV_Charging_EDA.ipynb`: Exploratory Data Analysis notebook detailing the underlying methodology.

## System Requirements
- **Node.js**: v18+ 
- **Python**: 3.9+
- **Package Manager**: npm

## Setup & Running the Application

This is a multi-service architecture requiring three running servers. For your convenience, we have provided a single script to start everything simultaneously.

### The Fast Way (One Command)
Run the automated startup script from the root directory:
```bash
./start_all.sh
```
This will automatically start the ML Backend (8001), the Gateway API (8000), and the Next.js Frontend (3000) in the background. Press `CTRL+C` at any time to gracefully shut down all three servers.

---

### Alternative: Manual Setup (3 Terminals)

If you prefer to run the services in separate terminals to view individual logs:

**1. ML Backend Server (Port 8001)**
```bash
cd backend
pip install -r requirements.txt # or install fastapi uvicorn pandas scikit-learn
python -m uvicorn app:app --host 0.0.0.0 --port 8001
```

**2. Gateway API Server (Port 8000)**
```bash
cd bescom-map-ui/backend
pip install fastapi uvicorn requests httpx
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

**3. Next.js Frontend Dashboard (Port 3000)**
```bash
cd bescom-map-ui/frontend
npm install
npm run dev
```

### Accessing the App
Once all servers are running, open your browser and navigate to:
**http://localhost:3000**
