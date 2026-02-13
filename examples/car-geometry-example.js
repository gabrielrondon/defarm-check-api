/**
 * CAR Geometry API - Usage Examples
 *
 * This file demonstrates how to use the new CAR endpoints to:
 * - Fetch CAR metadata and geometries
 * - Display CAR boundaries on maps
 * - Batch query multiple properties
 */

const API_URL = 'http://localhost:3000';

// Example 1: Get CAR with geometry
async function getCARWithGeometry(carNumber) {
  const response = await fetch(`${API_URL}/car/${carNumber}`);
  const data = await response.json();

  console.log('CAR Information:');
  console.log(`- Number: ${data.carNumber}`);
  console.log(`- Status: ${data.status}`);
  console.log(`- Owner: ${data.ownerName}`);
  console.log(`- Area: ${data.areaHa} hectares`);
  console.log(`- Municipality: ${data.municipality}, ${data.state}`);
  console.log(`- Geometry: ${data.geometry ? 'Included' : 'Not included'}`);

  return data;
}

// Example 2: Get CAR metadata only (without geometry)
async function getCARMetadata(carNumber) {
  const response = await fetch(`${API_URL}/car/${carNumber}?includeGeometry=false`);
  const data = await response.json();

  console.log('CAR Metadata (no geometry):');
  console.log(JSON.stringify(data, null, 2));

  return data;
}

// Example 3: Get CAR as GeoJSON Feature (ready for Leaflet/Mapbox)
async function getCARAsGeoJSON(carNumber) {
  const response = await fetch(`${API_URL}/car/${carNumber}/geojson`);
  const feature = await response.json();

  console.log('GeoJSON Feature:');
  console.log(`- Type: ${feature.type}`);
  console.log(`- Properties: ${Object.keys(feature.properties).length} fields`);
  console.log(`- Geometry Type: ${feature.geometry?.type}`);

  return feature;
}

// Example 4: Batch query multiple CARs
async function batchGetCARs(carNumbers, includeGeometry = false) {
  const response = await fetch(`${API_URL}/car/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ carNumbers, includeGeometry })
  });

  const data = await response.json();

  console.log(`Batch Query Results:`);
  console.log(`- Requested: ${data.requested}`);
  console.log(`- Found: ${data.count}`);
  console.log(`- Cars:`, data.cars);

  return data;
}

// Example 5: Display CAR on Leaflet map (browser)
function displayCAROnLeafletMap(carNumber) {
  return `
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />

    <div id="map" style="height: 500px;"></div>

    <script>
      const map = L.map('map').setView([-10, -55], 5);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      // Fetch CAR as GeoJSON Feature
      fetch('${API_URL}/car/${carNumber}/geojson')
        .then(res => res.json())
        .then(feature => {
          // Add to map
          const layer = L.geoJSON(feature, {
            style: {
              color: '#0066cc',
              weight: 2,
              fillOpacity: 0.2
            },
            onEachFeature: (feature, layer) => {
              // Add popup with CAR info
              layer.bindPopup(\`
                <b>CAR: \${feature.properties.carNumber}</b><br>
                Status: \${feature.properties.status}<br>
                Owner: \${feature.properties.ownerName}<br>
                Area: \${feature.properties.areaHa} ha<br>
                Municipality: \${feature.properties.municipality}, \${feature.properties.state}
              \`);
            }
          }).addTo(map);

          // Zoom to CAR boundary
          map.fitBounds(layer.getBounds());
        });
    </script>
  `;
}

// Example 6: React component for CAR map
const ReactCARMap = `
  import { useEffect, useState } from 'react';
  import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
  import 'leaflet/dist/leaflet.css';

  function CARMap({ carNumber }) {
    const [carFeature, setCarFeature] = useState(null);

    useEffect(() => {
      fetch(\`${API_URL}/car/\${carNumber}/geojson\`)
        .then(res => res.json())
        .then(data => setCarFeature(data))
        .catch(err => console.error('Failed to load CAR:', err));
    }, [carNumber]);

    if (!carFeature) return <div>Loading CAR...</div>;

    return (
      <MapContainer
        style={{ height: '500px', width: '100%' }}
        center={[-10, -55]}
        zoom={5}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />

        <GeoJSON
          data={carFeature}
          style={{ color: '#0066cc', weight: 2, fillOpacity: 0.2 }}
          onEachFeature={(feature, layer) => {
            layer.bindPopup(\`
              <b>CAR: \${feature.properties.carNumber}</b><br>
              Status: \${feature.properties.status}<br>
              Owner: \${feature.properties.ownerName}<br>
              Area: \${feature.properties.areaHa} ha
            \`);
          }}
        />
      </MapContainer>
    );
  }
`;

// Example 7: Find irregular CARs in batch
async function findIrregularCARs(carNumbers) {
  const response = await fetch(`${API_URL}/car/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      carNumbers,
      includeGeometry: false // Don't need geometry for status check
    })
  });

  const { cars } = await response.json();

  // Filter irregular statuses: CA (Cancelled), SU (Suspended), PE (Pending)
  const irregular = cars.filter(car =>
    ['CA', 'SU', 'PE'].includes(car.status)
  );

  console.log(`Found ${irregular.length} irregular CARs:`);
  irregular.forEach(car => {
    console.log(`- ${car.carNumber}: ${car.status} (${car.municipality}, ${car.state})`);
  });

  return irregular;
}

// Example 8: Export CAR geometry to GeoJSON file
async function exportCARToFile(carNumber, filename = 'car_boundary.geojson') {
  const response = await fetch(`${API_URL}/car/${carNumber}/geojson`);
  const feature = await response.json();

  // In Node.js:
  const fs = require('fs');
  fs.writeFileSync(filename, JSON.stringify(feature, null, 2));
  console.log(`Exported CAR to ${filename}`);

  // In browser:
  // const blob = new Blob([JSON.stringify(feature, null, 2)], { type: 'application/json' });
  // const url = URL.createObjectURL(blob);
  // const a = document.createElement('a');
  // a.href = url;
  // a.download = filename;
  // a.click();
}

// Run examples (uncomment to test)
async function runExamples() {
  try {
    // First, get a sample CAR number
    const samplesResponse = await fetch(`${API_URL}/samples/car`);
    const samplesData = await samplesResponse.json();

    if (!samplesData.samples || samplesData.samples.length === 0) {
      console.log('No sample CARs available. Make sure the database has CAR data.');
      return;
    }

    const sampleCAR = samplesData.samples[0].carNumber;
    console.log(`\nUsing sample CAR: ${sampleCAR}\n`);

    // Example 1
    console.log('\n=== Example 1: Get CAR with Geometry ===');
    await getCARWithGeometry(sampleCAR);

    // Example 2
    console.log('\n=== Example 2: Get CAR Metadata Only ===');
    await getCARMetadata(sampleCAR);

    // Example 3
    console.log('\n=== Example 3: Get CAR as GeoJSON ===');
    await getCARAsGeoJSON(sampleCAR);

    // Example 4
    console.log('\n=== Example 4: Batch Query ===');
    const carNumbers = samplesData.samples.slice(0, 3).map(s => s.carNumber);
    await batchGetCARs(carNumbers);

    // Example 7
    console.log('\n=== Example 7: Find Irregular CARs ===');
    await findIrregularCARs(carNumbers);

  } catch (err) {
    console.error('Error running examples:', err.message);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getCARWithGeometry,
    getCARMetadata,
    getCARAsGeoJSON,
    batchGetCARs,
    findIrregularCARs,
    exportCARToFile,
    runExamples
  };
}

// Auto-run if executed directly
if (require.main === module) {
  runExamples();
}
