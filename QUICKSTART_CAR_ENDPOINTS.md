# Quick Start: CAR Geometry Endpoints

## 🚀 Start Using CAR Endpoints in 3 Steps

### Step 1: Start the API
```bash
npm run dev
```

### Step 2: Get a Sample CAR Number
```bash
curl http://localhost:3000/samples/car | jq -r '.samples[0].carNumber'
```

### Step 3: Test the Endpoints

**Get CAR with geometry:**
```bash
curl http://localhost:3000/car/AC-1200013-XXXXXXXX | jq '.'
```

**Get as GeoJSON Feature (for maps):**
```bash
curl http://localhost:3000/car/AC-1200013-XXXXXXXX/geojson | jq '.'
```

**Batch query multiple CARs:**
```bash
curl -X POST http://localhost:3000/car/batch \
  -H "Content-Type: application/json" \
  -d '{"carNumbers": ["AC-1200013-X", "MT-5100048-Y"], "includeGeometry": false}' | jq '.'
```

## 📊 Response Example

```json
{
  "carNumber": "AC-1200013-XXXXXXXX",
  "status": "AT",
  "ownerName": "João da Silva",
  "propertyName": "Fazenda Esperança",
  "areaHa": 1234,
  "state": "AC",
  "municipality": "Acrelandia",
  "geometry": {
    "type": "MultiPolygon",
    "coordinates": [[[[...]]]]
  }
}
```

## 🗺️ Display on a Map

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head>
<body>
  <div id="map" style="height: 500px;"></div>

  <script>
    const map = L.map('map').setView([-10, -55], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // Fetch and display CAR
    fetch('/car/AC-1200013-XXXXXXXX/geojson')
      .then(res => res.json())
      .then(feature => {
        L.geoJSON(feature, {
          style: { color: '#0066cc', weight: 2, fillOpacity: 0.2 }
        }).addTo(map);
      });
  </script>
</body>
</html>
```

## 🧪 Run Automated Tests

```bash
chmod +x test-car-endpoints.sh
./test-car-endpoints.sh
```

## 📚 Full Documentation

- **API Reference:** `docs/CAR_ENDPOINTS.md`
- **Code Examples:** `examples/car-geometry-example.js`
- **Implementation Details:** `CAR_ENDPOINTS_SUMMARY.md`

## ✅ Build Verification

The project has been built and verified:
```bash
npm run build  # ✅ Success
```

All endpoints are ready to use! 🎉
