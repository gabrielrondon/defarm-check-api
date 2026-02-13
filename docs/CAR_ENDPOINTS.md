# CAR Endpoints Documentation

The API now includes dedicated endpoints for querying CAR (Cadastro Ambiental Rural) registrations and retrieving polygon geometries.

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/car/:carNumber` | GET | Get CAR metadata and optional geometry |
| `/car/:carNumber/geojson` | GET | Get CAR as GeoJSON Feature (ready for mapping) |
| `/car/batch` | POST | Get multiple CARs at once |

---

## 1. GET /car/:carNumber

Get CAR registration details including polygon geometry.

### Parameters

- **Path Parameter:**
  - `carNumber` (required): CAR registration number (e.g., `AC-1200013-...`)

- **Query Parameters:**
  - `includeGeometry` (optional, default: `true`): Include polygon geometry as GeoJSON

### Response

```json
{
  "carNumber": "AC-1200013-XXXXXXXX",
  "status": "AT",
  "ownerDocument": "12345678901",
  "ownerName": "João da Silva",
  "propertyName": "Fazenda Esperança",
  "areaHa": 1234,
  "state": "AC",
  "municipality": "Acrelandia",
  "source": "SICAR",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "geometry": {
    "type": "MultiPolygon",
    "coordinates": [[[[...]]]]
  }
}
```

### Examples

**With geometry (default):**
```bash
curl http://localhost:3000/car/AC-1200013-XXXXXXXX
```

**Without geometry (metadata only):**
```bash
curl "http://localhost:3000/car/AC-1200013-XXXXXXXX?includeGeometry=false"
```

**Use Cases:**
- Display CAR property boundaries on a map
- Verify CAR status and ownership
- Export CAR data for GIS analysis
- Build property management dashboards

---

## 2. GET /car/:carNumber/geojson

Get CAR registration as a complete GeoJSON Feature, ready for direct map rendering.

### Parameters

- **Path Parameter:**
  - `carNumber` (required): CAR registration number

### Response

Returns a valid GeoJSON Feature object:

```json
{
  "type": "Feature",
  "properties": {
    "carNumber": "AC-1200013-XXXXXXXX",
    "status": "AT",
    "ownerDocument": "12345678901",
    "ownerName": "João da Silva",
    "propertyName": "Fazenda Esperança",
    "areaHa": 1234,
    "state": "AC",
    "municipality": "Acrelandia",
    "source": "SICAR"
  },
  "geometry": {
    "type": "MultiPolygon",
    "coordinates": [[[[...]]]]
  }
}
```

### Examples

```bash
curl http://localhost:3000/car/AC-1200013-XXXXXXXX/geojson
```

**Use Cases:**
- Direct integration with mapping libraries (Leaflet, Mapbox, Google Maps)
- Download CAR boundary as GeoJSON file
- Combine multiple CAR Features into a FeatureCollection
- Geospatial analysis with QGIS, PostGIS, etc.

**Example: Display on Leaflet Map**
```javascript
const response = await fetch('/car/AC-1200013-XXXXXXXX/geojson');
const feature = await response.json();

L.geoJSON(feature, {
  style: { color: '#0066cc', weight: 2 }
}).addTo(map);
```

---

## 3. POST /car/batch

Get multiple CAR registrations at once (batch query).

### Request Body

```json
{
  "carNumbers": [
    "AC-1200013-XXXXXXXX",
    "MT-5100048-YYYYYYYY",
    "PA-1500131-ZZZZZZZZ"
  ],
  "includeGeometry": false
}
```

**Parameters:**
- `carNumbers` (required): Array of CAR numbers (max 100)
- `includeGeometry` (optional, default: `false`): Include polygon geometries

> ⚠️ **Note:** Batch requests default to `includeGeometry=false` to avoid large responses. Set to `true` only if you need geometries.

### Response

```json
{
  "count": 3,
  "requested": 3,
  "cars": [
    {
      "carNumber": "AC-1200013-XXXXXXXX",
      "status": "AT",
      "ownerName": "João da Silva",
      "areaHa": 1234,
      "state": "AC",
      "municipality": "Acrelandia",
      ...
    },
    ...
  ]
}
```

### Examples

**Without geometries (lightweight):**
```bash
curl -X POST http://localhost:3000/car/batch \
  -H "Content-Type: application/json" \
  -d '{
    "carNumbers": ["AC-1200013-XXXXXXXX", "MT-5100048-YYYYYYYY"],
    "includeGeometry": false
  }'
```

**With geometries:**
```bash
curl -X POST http://localhost:3000/car/batch \
  -H "Content-Type: application/json" \
  -d '{
    "carNumbers": ["AC-1200013-XXXXXXXX"],
    "includeGeometry": true
  }'
```

**Use Cases:**
- Bulk verification of CAR registrations
- Generate reports for multiple properties
- Map multiple CAR boundaries at once
- Data export for compliance audits

---

## Error Responses

### 404 - CAR Not Found

```json
{
  "error": "Not Found",
  "message": "CAR registration not found",
  "carNumber": "XX-9999999-XXXXXXXX"
}
```

### 500 - Internal Server Error

```json
{
  "error": "Internal Server Error",
  "message": "Failed to fetch CAR registration"
}
```

---

## CAR Status Codes

| Code | Description | Compliance |
|------|-------------|------------|
| `AT` | Ativo (Active) | ✅ Regular |
| `PE` | Pendente (Pending) | ⚠️ In Progress |
| `CA` | Cancelado (Cancelled) | ❌ Irregular |
| `SU` | Suspenso (Suspended) | ❌ Irregular |

---

## Integration Examples

### Example 1: Display CAR on Map (React + Leaflet)

```jsx
import { useEffect, useState } from 'react';
import { MapContainer, GeoJSON } from 'react-leaflet';

function CARMap({ carNumber }) {
  const [carData, setCarData] = useState(null);

  useEffect(() => {
    fetch(`/car/${carNumber}/geojson`)
      .then(res => res.json())
      .then(data => setCarData(data));
  }, [carNumber]);

  return (
    <MapContainer>
      {carData && <GeoJSON data={carData} />}
    </MapContainer>
  );
}
```

### Example 2: Batch Verification (Node.js)

```javascript
const carNumbers = [
  'AC-1200013-XXXXXXXX',
  'MT-5100048-YYYYYYYY',
  'PA-1500131-ZZZZZZZZ'
];

const response = await fetch('/car/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    carNumbers,
    includeGeometry: false
  })
});

const { count, cars } = await response.json();

// Check for irregular CARs
const irregular = cars.filter(car =>
  ['CA', 'SU', 'PE'].includes(car.status)
);

console.log(`Found ${irregular.length} irregular CARs`);
```

### Example 3: Export CAR Boundary to File

```bash
# Download CAR as GeoJSON file
curl http://localhost:3000/car/AC-1200013-XXXXXXXX/geojson \
  > car_boundary.geojson

# Import into QGIS, PostGIS, or other GIS tools
ogr2ogr -f "PostgreSQL" PG:"dbname=mydb" car_boundary.geojson
```

---

## Testing

Run the test script to verify all endpoints:

```bash
./test-car-endpoints.sh
```

This will:
1. Get a sample CAR number from the database
2. Test all three endpoints with various parameters
3. Verify error handling (404 responses)

---

## Performance Considerations

- **Geometry Size:** CAR polygons can be large (50+ KB for complex properties). Use `includeGeometry=false` when you only need metadata.
- **Batch Limits:** Maximum 100 CAR numbers per batch request to prevent timeouts.
- **Caching:** Consider caching CAR geometries client-side since they rarely change.

---

## Database Coverage

Current CAR database coverage: **20/27 Brazilian states** (3.5M+ records)

**Covered states:** AC, AL, AP, CE, DF, ES, MA, MS, MT, PA, PB, PE, PI, RN, RO, RR, SE, TO, and partial coverage for BA, GO, MG, PR, RS, SC, SP.

For properties not in our database, use the [official SICAR portal](https://www.car.gov.br/).

---

## Related Endpoints

- **POST /check** - Run full compliance verification (includes CAR check)
- **GET /samples/car** - Get sample CAR numbers for testing

## Questions?

See `/docs` (Swagger UI) for interactive API documentation.
