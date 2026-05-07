#!/bin/bash
echo "Stopping existing servers if running..."
kill -9 $(lsof -t -i:8000) 2>/dev/null
kill -9 $(lsof -t -i:3000) 2>/dev/null

echo "Starting Backend on Port 8000..."
cd "/Volumes/DATA/Karnataka govt /EV optimization and detection /Github/EDA by google antigravity /bescom-map-ui/backend"
/Volumes/DATA/conda/anaconda3/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &

echo "Starting Frontend on Port 3000..."
cd "/Volumes/DATA/Karnataka govt /EV optimization and detection /Github/EDA by google antigravity /bescom-map-ui/frontend"
npm run dev &

echo "✅ Both servers are starting up!"
echo "👉 Frontend Map: http://localhost:3000"
echo "👉 Backend API: http://localhost:8000/docs"
wait
