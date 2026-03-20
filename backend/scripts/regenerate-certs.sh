#!/bin/bash
# Regenerate SSL certs with your current IP for WebSocket/socket.io to work from mobile
# Run this if your IP changes or hands-up/queue stops syncing

cd "$(dirname "$0")/.."
mkdir -p certs

# Get primary local IP (en0 = WiFi on Mac)
IP=$(ipconfig getifaddr en0 2>/dev/null || echo "192.168.1.8")

echo "Generating cert for: localhost, 127.0.0.1, $IP"

openssl req -x509 -newkey rsa:2048 \
  -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.1.8,IP:192.168.1.14,IP:$IP"

echo "Done. Restart the backend: node server.js"
