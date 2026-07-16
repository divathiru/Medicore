#!/bin/bash
# MediCore — Day 4 startup script
# Run this from your normal terminal (docker group already active there)
set -e

cd "$(dirname "$0")"
echo "==> Building and starting all MediCore services..."
docker compose up --build -d
echo ""
echo "==> Waiting for services to become healthy (30s)..."
sleep 30
echo ""
echo "==> Service status:"
docker compose ps
echo ""
echo "==> Health checks:"
curl -sf http://localhost:4000/health && echo " [OK] Gateway (4000)"
curl -sf http://localhost:4001/health && echo " [OK] Patient (4001)"
curl -sf http://localhost:4002/health && echo " [OK] Doctor  (4002)"
curl -sf http://localhost:4003/health && echo " [OK] Cashier (4003)"
curl -sf http://localhost:5000/health && echo " [OK] AI      (5000)"
curl -sf http://localhost:5173/ > /dev/null && echo " [OK] Frontend (5173)"
echo ""
echo "==> Open http://localhost:5173 in your browser."
echo ""
echo "==> Demo accounts:"
echo "    Patient:  sign up at /signup"
echo "    Doctor:   dr.amelia.chen@medicore.dev / devpass123"
echo "    Cashier:  cashier@medicore.dev / devpass123"
