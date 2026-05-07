#!/bin/bash

echo "Starting BESCOM Grid Niraksha Services..."

# Function to cleanly kill all background processes on exit
cleanup() {
    echo ""
    echo "Shutting down all servers..."
    kill $PID1 $PID2 $PID3 2>/dev/null
    exit
}

# Trap CTRL+C and call cleanup
trap cleanup SIGINT SIGTERM

echo "1/3 Starting ML Backend (Port 8001)..."
cd backend
python3 -m uvicorn app:app --host 0.0.0.0 --port 8001 &
PID1=$!
cd ..

echo "2/3 Starting Gateway API (Port 8000)..."
cd bescom-map-ui/backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
PID2=$!
cd ../..

echo "3/3 Starting Next.js Frontend (Port 3000)..."
cd bescom-map-ui/frontend
npm run dev &
PID3=$!
cd ../..

echo "================================================="
echo "✅ All services are starting up!"
echo "📍 Dashboard will be available at: http://localhost:3000"
echo "🛑 Press CTRL+C at any time to safely stop all servers."
echo "================================================="

# Wait for background processes to finish (or until interrupted)
wait
