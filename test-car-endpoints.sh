#!/bin/bash

# Test script for new CAR endpoints
# Make sure the API is running: npm run dev

API_URL="${API_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-your-api-key}"

echo "=== Testing CAR Endpoints ==="
echo ""

# 1. Get a sample CAR number
echo "1. Getting sample CAR number..."
SAMPLE_CAR=$(curl -s "$API_URL/samples/car" | jq -r '.samples[0].carNumber')

if [ -z "$SAMPLE_CAR" ] || [ "$SAMPLE_CAR" = "null" ]; then
  echo "❌ No sample CAR found. Make sure database has CAR data."
  exit 1
fi

echo "✅ Sample CAR: $SAMPLE_CAR"
echo ""

# 2. Test GET /car/:carNumber (with geometry)
echo "2. Testing GET /car/$SAMPLE_CAR (with geometry)..."
curl -s "$API_URL/car/$SAMPLE_CAR" | jq '.'
echo ""

# 3. Test GET /car/:carNumber (without geometry)
echo "3. Testing GET /car/$SAMPLE_CAR?includeGeometry=false (metadata only)..."
curl -s "$API_URL/car/$SAMPLE_CAR?includeGeometry=false" | jq '.'
echo ""

# 4. Test GET /car/:carNumber/geojson (GeoJSON Feature)
echo "4. Testing GET /car/$SAMPLE_CAR/geojson (GeoJSON Feature)..."
curl -s "$API_URL/car/$SAMPLE_CAR/geojson" | jq '.'
echo ""

# 5. Test POST /car/batch (multiple CARs)
echo "5. Testing POST /car/batch (batch query)..."
BATCH_CARS=$(curl -s "$API_URL/samples/car" | jq -r '[.samples[0:3][].carNumber]')
curl -s -X POST "$API_URL/car/batch" \
  -H "Content-Type: application/json" \
  -d "{\"carNumbers\": $BATCH_CARS, \"includeGeometry\": false}" | jq '.'
echo ""

# 6. Test 404 (non-existent CAR)
echo "6. Testing 404 (non-existent CAR)..."
curl -s "$API_URL/car/XX-9999999-XXXXXXXX" | jq '.'
echo ""

echo "=== Tests Complete ==="
