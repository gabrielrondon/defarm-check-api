# Data Sources - Uruguay

**Last Updated:** 2026-02-16
**Status:** Research Complete - Implementation Pending

This document catalogs all available public data sources in Uruguay for environmental and social compliance checking, organized by category. Each source includes technical specifications, access methods, and implementation notes.

---

## Table of Contents

1. [Environmental Sources](#environmental-sources)
   - [SNAP - Protected Areas](#1-snap---sistema-nacional-de-áreas-protegidas)
   - [Environmental Complaints](#2-environmental-complaints-denuncias-ambientales)
   - [DINAGUA - Water Permits](#3-dinagua---water-use-permits)
   - [DGF - Forest Management](#4-dgf---forest-management)
   - [Fire Alerts](#5-fire-alerts-incendios-forestales)
2. [Rural Property & Livestock](#rural-property--livestock-sources)
   - [DICOSE - Livestock Registry](#6-dicose---livestock-registry)
   - [Rural Cadastre](#7-catastro-rural---rural-property-registry)
3. [Social & Labor](#social--labor-sources)
   - [MTSS - Labor Violations](#8-mtss---labor-violations)
4. [Legal & Administrative](#legal--administrative-sources)
   - [TCR - Administrative Sanctions](#9-tcr---tribunal-de-cuentas)
   - [DGI - Company Registry](#10-dgi---company-registry-ruc)
5. [Geospatial Infrastructure](#geospatial-infrastructure)
   - [IDE Uruguay](#11-ide-uruguay---infraestructura-de-datos-espaciales)
6. [Document ID Formats](#document-id-formats)
7. [Implementation Roadmap](#implementation-roadmap)

---

## Environmental Sources

### 1. SNAP - Sistema Nacional de Áreas Protegidas

**Status:** ✅ Data Available - Shapefile
**Provider:** Ministerio de Ambiente - DINABISE (Dirección Nacional de Biodiversidad y Servicios Ecosistémicos)
**Description:** Protected areas under Uruguay's National Protected Areas System (22 areas covering 367,683 hectares / 1.16% of national territory)

#### Access Information

- **Metadata Portal:** https://www.ambiente.gub.uy/metadatos/index.php/metadata/md_iframe/18
- **Data Format:** Shapefile (vectorial polygons)
- **Coordinate System:** WGS 84 (EPSG:4326)
- **Update Date:** August 2025
- **Authentication:** None
- **License:** Free usage with citation required (source: DINABISE)
- **Contact:** secretaria.snap@ambiente.gub.uy

#### Data Schema

```
Fields: (To be extracted from shapefile)
- Area name/code
- Protection category
- Geometry (MULTIPOLYGON)
- Legal status
- Creation date
```

#### Implementation Notes

- **Priority:** HIGH - Core environmental checker
- **Checker Type:** Geospatial intersection (PostGIS)
- **Challenge:** Need to download shapefile and convert to PostGIS
- **Alternative Access:** May be available via Ministry's WFS service (see IDE section)
- **Record Count:** 22 protected areas
- **Update Frequency:** Infrequent (protected areas rarely change)

#### Integration Steps

1. Download shapefile from metadata portal
2. Convert to GeoJSON using ogr2ogr or similar
3. Seed into PostgreSQL with PostGIS geometry
4. Create checker similar to Brazil's Indigenous Lands checker
5. Query: `ST_Intersects(coordinate_point, snap_geometry)`

---

### 2. Environmental Complaints (Denuncias Ambientales)

**Status:** ✅ Data Available - CSV/XLSX/XML
**Provider:** Ministerio de Ambiente
**Description:** Environmental complaints received by the Ministry from 2023 onwards

#### Access Information

- **Dataset URL:** https://catalogodatos.gub.uy/dataset/ministerio-de-ambiente-denuncias-ambientales
- **Download Formats:**
  - **CSV:** https://catalogodatos.gub.uy/dataset/14c95c50-3aac-475a-92d1-26d2ddfb6fdc/resource/19911a59-e969-41be-8a09-65da6e4848bd/download/denuncias-ambientales.csv
  - **XLSX:** https://catalogodatos.gub.uy/dataset/14c95c50-3aac-475a-92d1-26d2ddfb6fdc/resource/e678c36b-99fe-49f0-9532-4d576eb5498c/download/denuncias-ambientales.xlsx
  - **XML:** https://catalogodatos.gub.uy/dataset/14c95c50-3aac-475a-92d1-26d2ddfb6fdc/resource/92a6d93a-23ec-4d87-99d8-58811942ef1f/download/denuncias-ambientales.xml
  - **Metadata (JSON):** https://catalogodatos.gub.uy/dataset/14c95c50-3aac-475a-92d1-26d2ddfb6fdc/resource/9715154e-04bd-4464-b231-bff7796e439d/download/metadatos_denuncias-ambientales.json
- **Update Frequency:** Annual
- **Last Update:** July 4, 2024
- **Authentication:** None
- **License:** Licencia de DAG de Uruguay

#### Data Schema

```
Fields: (confirmed from dataset)
- Date of complaint
- Submission method
- Department (geographic)
- Complaint reason/category
- Handling/resolution status
```

#### Implementation Notes

- **Priority:** MEDIUM - Useful for risk assessment
- **Checker Type:** Document/location matching
- **Use Case:** Flag properties/companies with environmental complaint history
- **Coverage:** Data starts 2023 (limited historical data)
- **Limitation:** Complaints are not the same as confirmed violations
- **Update Frequency:** Annual (not real-time)

---

### 3. DINAGUA - Water Use Permits

**Status:** ✅ Data Available - CSV
**Provider:** DINAGUA (Dirección Nacional de Aguas) - Ministerio de Ambiente
**Description:** Registry of water resource use permits with active validity

#### Access Information

- **Dataset URL:** https://catalogodatos.gub.uy/dataset/ambiente-dinagua-aprovechamientos-de-los-recursos-hidricos-vigentes-2019
- **Download Formats:**
  - **CSV:** https://catalogodatos.gub.uy/dataset/07ad6532-7340-4fb6-8000-195f88cd030a/resource/1e98da44-8038-4b6f-9f20-9bd54ec7d1da/download/aprovechamientos-2019.csv
  - **Metadata (XLSX):** https://catalogodatos.gub.uy/dataset/07ad6532-7340-4fb6-8000-195f88cd030a/resource/2fbf5abb-ef6a-4a0a-a878-fae1d0dd6ba0/download/metadatos.xlsx
- **Update Frequency:** Not specified (dataset is for 2019)
- **Last Update:** March 21, 2022
- **Authentication:** None
- **License:** Licencia de Datos Abiertos de Uruguay

#### Data Schema

```
Fields: (to be confirmed from metadata file)
- Permit ID
- Permit holder (name/document)
- Water source/location
- Permitted use type
- Volume/flow rate
- Validity period
- Coordinates (if available)
```

#### Implementation Notes

- **Priority:** MEDIUM - Environmental compliance
- **Checker Type:** Document matching (RUC/CI) + optional spatial
- **Challenge:** Dataset is from 2019 - need updated data
- **Action Required:** Contact DINAGUA for 2024/2025 data
- **Update Frequency:** Annual (based on declarations)
- **Coverage:** Valid permits as of 2019

#### Data Freshness Concern

⚠️ **WARNING:** Current dataset is 5+ years old (2019). Need to:
1. Check catalogodatos.gub.uy for newer DINAGUA datasets
2. Contact DINAGUA for current permit data
3. Explore DINAGUA visualizer: https://www.ambiente.gub.uy/SIH-JSF/paginas/visualizador/visualizador.xhtml

---

### 4. DGF - Forest Management

**Status:** 🔄 Limited Data - Geoportal Available
**Provider:** DGF (Dirección General Forestal) - MGAP
**Description:** Forest management, deforestation monitoring, certification

#### Access Information

- **Geoportal:** https://web.snig.gub.uy/arcgisprtal/apps/webappviewer/index.html?id=b90f805255ae4ef0983c2bfb40be627f
- **Parent Agency:** MGAP (Ministry of Livestock, Agriculture and Fisheries)
- **Contact:** Via MGAP official channels
- **Authentication:** Unknown (geoportal may require login)

#### Available Data

- **Forestry Establishment Tracking:** Geo-referenced forest plantations
- **Deforestation Monitoring:** Uruguay has negative deforestation rates
- **Certification:** Deforestation-free timber certification system
- **National Strategy:** Native Forests conservation (launched 2018)

#### Implementation Notes

- **Priority:** LOW - Uruguay has low deforestation risk
- **Data Access:** No public API/dataset found
- **Geoportal:** Likely for internal/authorized use
- **Context:** Uruguay has 970 kha natural forest (5.0% of land area)
- **Deforestation Rate:** -4.8 kha/year (afforestation > deforestation)
- **Alternative:** Use fire alerts (see below) as proxy for forest damage

#### Action Required

1. Explore geoportal to determine if public access available
2. Contact DGF to request deforestation/violation data
3. Check if forest embargoes tracked separately in catalogodatos.gub.uy

---

### 5. Fire Alerts (Incendios Forestales)

**Status:** ✅ Global APIs Available
**Provider:** NASA FIRMS, INPE Queimadas (Brazil)
**Description:** Real-time satellite fire detection

#### Access Information

**NASA FIRMS (Recommended)**
- **URL:** https://firms.modaps.eosdis.nasa.gov/map/
- **API:** Yes - Near real-time active fire data
- **Coverage:** Global (includes Uruguay)
- **Satellites:** MODIS, VIIRS
- **Format:** CSV, Shapefile, KML, WMS
- **Authentication:** Free API key required
- **Update Frequency:** 3 hours (VIIRS), daily (MODIS)

**INPE Queimadas (Brazil)**
- **URL:** http://queimadas.dgi.inpe.br/queimadas
- **Coverage:** South America (includes Uruguay)
- **Update Frequency:** Every 3 hours
- **Format:** Shapefile, KML, Web API
- **Authentication:** None for public access

#### Data Schema

```
Fields: (NASA FIRMS)
- latitude, longitude
- brightness (temperature)
- scan (pixel size)
- track (pixel size)
- acq_date, acq_time
- satellite (Terra, Aqua, NPP, NOAA-20)
- confidence (0-100%)
- version
- bright_t31 (brightness temperature)
- frp (Fire Radiative Power)
```

#### Implementation Notes

- **Priority:** MEDIUM - Environmental risk assessment
- **Checker Type:** Geospatial + temporal (recent fires near property)
- **Use Case:** Flag properties with recent fire activity
- **Integration:** Similar to Brazil DETER checker
- **Query:** Find fires within X km of coordinates in last Y days
- **Threshold:** Filter by confidence level (> 80%)

---

## Rural Property & Livestock Sources

### 6. DICOSE - Livestock Registry

**Status:** ✅ Data Available - CSV/XML
**Provider:** DICOSE (División de Contralor de Semovientes) - MGAP
**Description:** Sworn livestock declarations by rural producers (annual census)

#### Access Information

- **Latest Dataset (2024):** https://catalogodatos.gub.uy/dataset/mgap-datos-preliminares-basados-en-la-declaracion-jurada-de-existencias-dicose-snig-2024
- **Previous Years:** 2023, 2022, 2021, 2020, 2019, 2018, 2016 available
- **Data Format:** CSV, XML
- **Update Frequency:** Annual (published March following declaration deadline)
- **Last Update:** 2024 (most recent)
- **Authentication:** None
- **License:** DAG de Uruguay

#### Data Schema

**44 CSV files per year, including:**
- **Datos Generales:** General establishment data
- **Datos Animales:** Animal categories by species (bovine, ovine, equine, swine, caprine)
- **Tenencia Tierra:** Land tenure, hectares exploited
- **Uso Suelo:** Land use
- **Mejoras:** Improvements/infrastructure
- **Leche:** Milk production data
- **Tablas de Códigos:** Code tables (activities, categories, departments, species, etc.)

```
Fields: (to be confirmed from actual CSV)
- Establishment/producer ID (possibly RUC)
- Geographic location (department, section)
- Livestock counts by species and category
- Land area (hectares)
- Land use categories
- Production data
```

#### Implementation Notes

- **Priority:** HIGH - Core rural compliance checker
- **Checker Type:** Document matching (RUC/producer ID)
- **Use Case:**
  - Verify rural property registration
  - Validate livestock activity declarations
  - Cross-check with other rural datasets
- **Coverage:** Complete national livestock census (annual)
- **Data Quality:** Official government declarations
- **Update Lag:** 2-3 months (data from year Y published in March Y+1)

#### Integration Steps

1. Download latest year CSV files (44 files)
2. Identify primary key (producer/establishment ID)
3. Normalize to single table or related tables
4. Create lookup by RUC/CI or property identifier
5. Build checker to verify registration and flag missing declarations

---

### 7. Catastro Rural - Rural Property Registry

**Status:** ✅ Data Available - Shapefile (Geometry Only)
**Provider:** Dirección Nacional de Catastro - MEF
**Description:** Cadastral parcels (padrones) for rural and urban properties

#### Access Information

- **Dataset URL:** https://catalogodatos.gub.uy/dataset/direccion-nacional-de-catastro-shapes-del-parcelario-rural-y-urbano
- **Alphanumeric Data:** https://catalogodatos.gub.uy/dataset/direccion-nacional-de-catastro-padrones-urbanos-y-rurales
- **Download Formats (Shapefiles):**
  - **Rural:** https://catalogodatos.gub.uy/dataset/9e0dc092-a669-4697-b3ba-88808165c902/resource/2073596d-f122-4030-9eb4-eaca1cdf1e9c/download/paisrural_shp.zip
  - **Urban:** https://catalogodatos.gub.uy/dataset/9e0dc092-a669-4697-b3ba-88808165c902/resource/3d211675-14a6-4e69-bc0b-6cc549060633/download/paisurbano_shp.zip
  - **Cadastral Sections:** https://catalogodatos.gub.uy/dataset/9e0dc092-a669-4697-b3ba-88808165c902/resource/5ab54026-7ce8-4604-be54-17dcde0a02be/download/paisseccat_shp.zip
  - **Localities:** https://catalogodatos.gub.uy/dataset/9e0dc092-a669-4697-b3ba-88808165c902/resource/510012c9-12b0-4e96-9dbb-52bb10180a91/download/paislocalidades_shp.zip
- **Update Frequency:** Monthly
- **Last Update:** February 4, 2026
- **Authentication:** None
- **License:** Licencia de DAG de Uruguay

#### Data Schema

```
Fields: (from shapefile - to be confirmed)
- NUMEROPADRON: Unique property number (per department)
- Department code
- Cadastral section
- Locality
- Geometry (POLYGON/MULTIPOLYGON)

⚠️ IMPORTANT: Owner names are NOT public data in Uruguay
```

#### Additional Resources

- **Web Viewer:** http://visor.catastro.gub.uy/visordnc/
- **Search Portal:** https://www.snig.gub.uy/ConsultaPadrones
- **WFS Service:** http://catastro.mef.gub.uy (endpoint to be confirmed)
- **IDE Metadata:** https://visualizador.ide.uy/geonetwork/srv/api/records/65c09c97-bd64-43a0-b561-a734fda20598

#### Implementation Notes

- **Priority:** HIGH - Property identification and spatial queries
- **Checker Type:** Geospatial + document matching
- **Use Case:**
  - Convert coordinates to padron number
  - Validate property existence
  - Spatial overlay with environmental layers
- **Limitation:** No ownership data (privacy protected)
- **Workaround:** Use RUC from DICOSE or other sources to link to padron

#### Integration Steps

1. Download rural shapefile (monthly updates available)
2. Convert to GeoJSON/PostGIS
3. Index by NUMEROPADRON and geometry (GIST index)
4. Create spatial lookup: coordinates → padron number
5. Create reverse lookup: padron number → geometry
6. Cross-reference with DICOSE (if possible)

---

## Social & Labor Sources

### 8. MTSS - Labor Violations

**Status:** ❌ No Public Dataset Found
**Provider:** MTSS (Ministerio de Trabajo y Seguridad Social) - IGTSS (Inspección General del Trabajo y de la Seguridad Social)
**Description:** Labor inspection violations, fines, sanctions

#### Search Results

- **MTSS Organization:** https://www.gub.uy/ministerio-trabajo-seguridad-social/
- **IGTSS (Labor Inspection):** https://www.gub.uy/ministerio-trabajo-seguridad-social/institucional/estructura-del-organismo/inspeccion-general-del-trabajo-seguridad-social
- **Catalog Search:** No MTSS labor violations dataset found on catalogodatos.gub.uy
- **Trabajo Category:** 234 datasets (mostly employment statistics, not violations)

#### What Exists

- **Complaint System:** Workers can file complaints via IGTSS
- **Infraction Framework:** Minor, serious, very serious violations
- **Fines:** Applied for infractions to labor regulations
- **Recent Regulation:** Decree 371/2022 (March 1, 2022) - regulates IGTSS functioning

#### What is Missing

- **No public dataset** of labor violations or sanctions
- **No API** for inspection results
- **No open data** on fined companies

#### Implementation Notes

- **Priority:** HIGH - Social compliance critical
- **Status:** BLOCKED - No data source available
- **Action Required:**
  1. Contact MTSS directly to request data
  2. Submit transparency request under Uruguay's access to information law
  3. Check if similar data available from other sources (e.g., union databases)
  4. Monitor catalogodatos.gub.uy for future MTSS datasets

#### Alternative Sources

- **URSEA Sanctions:** https://catalogodatos.gub.uy/dataset/ursea-ursea_basesanciones2019 (energy/water sector only)
- **Consumer Protection:** Various datasets exist for consumer violations
- **Traffic Fines:** Public datasets available

**Recommendation:** Advocate for MTSS to publish labor violation data as open data (transparency initiative)

---

## Legal & Administrative Sources

### 9. TCR - Tribunal de Cuentas

**Status:** ❌ No Public Dataset Found
**Provider:** Tribunal de Cuentas de la República (Supreme Audit Institution)
**Description:** Public finance audits, administrative sanctions, irregularities

#### Access Information

- **Website:** https://www.tcr.gub.uy/
- **Role:** Controls public budget execution and public finance management
- **Authority:** Denounces irregularities, budget law infractions

#### What Exists

- **Institutional website** with resolutions and reports
- **Internal documents** (not open data)
- **Regulatory framework** for oversight

#### What is Missing

- **No public API** for sanctions data
- **No dataset** of administrative violations
- **No structured data** portal

#### Implementation Notes

- **Priority:** LOW - Limited applicability to rural/environmental compliance
- **Status:** BLOCKED - No data source
- **Use Case:** Government contractor violations (not typical rural producer)
- **Action Required:** Contact TCR to confirm if any data available

---

### 10. DGI - Company Registry (RUC)

**Status:** 🔄 Verification Service Available (No Bulk Dataset)
**Provider:** DGI (Dirección General Impositiva) - Tax Administration
**Description:** RUT/RUC tax identification numbers for companies and individuals

#### Access Information

- **Verification Portal:** https://servicios.dgi.gub.uy
- **Service:** Real-time RUT/RUC verification
- **Authentication:** Requires RUC and password for full services
- **Public Access:** Limited verification (confirm registration)

#### RUT/RUC Format

```
Format: 12 digits total
- First 2 digits: Series (e.g., "22" for newer RUTs since Oct 2024)
- Next 6 digits: Activity type
- Last 3 digits: Branch count
- Additional digit: Check digit (validation algorithm)

Older Format:
- 2 digits: Zone/region
- 6 digits: Work type
- 3 digits: Number of branches
```

#### Implementation Notes

- **Priority:** MEDIUM - Document validation
- **Checker Type:** Format validation + online verification
- **Use Case:**
  1. Validate RUC format (regex)
  2. Verify RUC is registered (API call)
  3. Cross-reference with other datasets (DICOSE, permits)
- **Limitation:** No bulk download of all companies
- **Alternative:** OpenCorporates has some Uruguay data (limited)

#### Integration Steps

1. Implement RUC format validator (regex + check digit)
2. Create DGI verification service wrapper (if API available)
3. Use RUC as primary key for company-based checkers
4. Link RUC to other datasets (DICOSE, water permits, etc.)

#### Data Sources

- **DGI Services:** https://www.gub.uy/direccion-general-impositiva/comunicacion/publicaciones/acceso-servicios-linea-dgi
- **Tax ID Guide:** https://lookuptax.com/docs/es/numero-identificacion-fiscal/guia-rut-uruguay
- **OECD TIN Info:** https://www.oecd.org/content/dam/oecd/en/topics/policy-issue-focus/aeoi/uruguay-tin.pdf

---

## Geospatial Infrastructure

### 11. IDE Uruguay - Infraestructura de Datos Espaciales

**Status:** ✅ Active - WFS/WMS Services
**Provider:** Multiple government agencies coordinated by AGESIC
**Description:** National spatial data infrastructure with web services

#### Access Information

- **Main Portal:** https://www.gub.uy/infraestructura-datos-espaciales/
- **Visualizer:** https://visualizador.ide.uy/ideuy/core/load_public_project/ideuy/
- **Geoservices:** https://www.gub.uy/infraestructura-datos-espaciales/geoservicios-ide-uruguay
- **WMS/WFS Base:** https://mapas.ide.uy/geoserver-vectorial/ideuy/ows

#### Key Services

**Ministry of Environment (Ambiente)**
- **Geoservices:** https://www.ambiente.gub.uy/geoservicios/
- **Visualizer:** https://www.ambiente.gub.uy/visualizador/
- **Contact:** oan@ambiente.gub.uy
- **Note:** Currently experiencing server migration (download issues, use WFS/WMS)

**MTOP (Transport and Public Works)**
- **Geoportal:** https://geoportal.mtop.gub.uy/
- **Geoservices:** https://geoportal.mtop.gub.uy/en/geoservicios
- **QGIS Plugin:** MTOPOpenData (https://plugins.qgis.org/plugins/MTOPOpenData/)
- **Layers:** Airports, road network, river extraction permits

**MIDES (Social Development)**
- **Geoservices:** https://guiaderecursos.mides.gub.uy/58169/geoservicios-web-del-mides
- **Layers:** Social vulnerability data

#### Implementation Notes

- **Priority:** HIGH - Access to geospatial layers
- **Use Case:** WFS access to SNAP, watersheds, administrative boundaries
- **Format:** WMS (display), WFS (vector data download)
- **Standard:** OGC WMS/WFS (GeoServer)

#### How to Use

1. **GetCapabilities Request:**
   ```
   https://mapas.ide.uy/geoserver-vectorial/ideuy/ows?service=WFS&version=2.0.0&request=GetCapabilities
   ```

2. **WFS Query Example:**
   ```
   https://mapas.ide.uy/geoserver-vectorial/ideuy/ows?
     service=WFS&
     version=2.0.0&
     request=GetFeature&
     typeName=ideuy:layer_name&
     outputFormat=application/json
   ```

3. **QGIS Integration:**
   - Add WFS layer from URL
   - Filter by bounding box or attributes
   - Export to GeoJSON/Shapefile

#### Action Required

1. Execute GetCapabilities to list all available layers
2. Identify SNAP, watersheds, administrative boundary layers
3. Test WFS download for each relevant layer
4. Document layer names and field schemas

---

## Document ID Formats

### Cédula de Identidad (CI) - Uruguay National ID

**Format:**
- **Length:** 6-7 digits + 1 check digit
- **Pattern:** `1.111.111-1` or `1_111_111_1` or `1.111.111/1`
- **Valid Range:** 1,000,000 to 9,999,999
- **Separators:** `.` (dots), `_` (underscore), `-` or `/` before check digit

**Validation Algorithm:**
1. Multiply each digit by: 2, 9, 8, 7, 6, 3, 4 (left to right)
2. Sum all products
3. Check digit = 10 - (sum mod 10)
4. If result is 10, check digit is 0

**Regex Pattern:**
```regex
^[1-9][\.]?\d{3}[\.]?\d{3}[\.\-/_]?[0-9]$
```

**Implementation:**
```typescript
function validateCI(ci: string): boolean {
  const cleaned = ci.replace(/[._\-\/]/g, '');
  if (!/^\d{7,8}$/.test(cleaned)) return false;

  const digits = cleaned.slice(0, -1).split('').map(Number);
  const checkDigit = parseInt(cleaned.slice(-1));
  const multipliers = [2, 9, 8, 7, 6, 3, 4];

  const sum = digits.reduce((acc, digit, i) =>
    acc + digit * multipliers[i], 0);
  const calculated = (10 - (sum % 10)) % 10;

  return calculated === checkDigit;
}
```

**Resources:**
- GitHub validator: https://github.com/picandocodigo/ci_uy
- GlobalIDCheck: https://globalidcheck.com/en/verify/uruguay-cedula

---

### RUT/RUC - Tax Identification Number

**Format:**
- **Length:** 12 digits
- **Structure:** [Series: 2][Activity: 6][Branches: 3][Check: 1]
- **New Series (2024+):** Start with "22"
- **Old Series:** Start with other codes

**Pattern:**
```regex
^\d{12}$
```

**Usage:**
- **Legal Entities:** All companies must have RUC
- **Individuals:** Business owners may have RUC (different from CI)
- **Verification:** https://servicios.dgi.gub.uy (online verification)

**Implementation:**
```typescript
function validateRUC(ruc: string): boolean {
  return /^\d{12}$/.test(ruc);
  // Note: Full validation requires check digit algorithm from DGI
}

function isNewFormatRUC(ruc: string): boolean {
  return ruc.startsWith('22');
}
```

**Resources:**
- DGI Services: https://www.gub.uy/direccion-general-impositiva/
- Tax ID Guide: https://lookuptax.com/docs/es/numero-identificacion-fiscal/guia-rut-uruguay
- OECD Guide: https://www.oecd.org/content/dam/oecd/en/topics/policy-issue-focus/aeoi/uruguay-tin.pdf

---

## Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1-2)

**Goal:** Add Uruguay support to input types and orchestrator

**Tasks:**
1. ✅ Research data sources (COMPLETED)
2. Add Uruguay country code to input types
3. Add CI and RUC validators
4. Update orchestrator for country-aware checker selection
5. Create Uruguay-specific input normalization

**Files to Modify:**
- `src/types/input.ts` - Add Uruguay document types
- `src/utils/validators.ts` - Add CI/RUC validators
- `src/services/orchestrator.ts` - Add country parameter
- `src/db/schema.ts` - Add Uruguay checker tables

---

### Phase 2: Priority Checkers (Week 3-4)

**Checker 1: SNAP Protected Areas**
- **Priority:** HIGH
- **Complexity:** MEDIUM
- **Data:** Download shapefile from Ambiente
- **Similar to:** Brazil Indigenous Lands checker
- **Implementation:**
  1. Download SNAP shapefile
  2. Convert to GeoJSON
  3. Seed into `snap_areas_uruguay` table
  4. Create `SNAPChecker` class
  5. Add samples endpoint

**Checker 2: DICOSE Livestock Registry**
- **Priority:** HIGH
- **Complexity:** MEDIUM
- **Data:** Download 2024 CSV files (44 files)
- **Similar to:** CAR checker (registry validation)
- **Implementation:**
  1. Download all DICOSE CSV files
  2. Parse and normalize data
  3. Seed into `dicose_registry` table
  4. Create `DICOSEChecker` class
  5. Index by RUC/producer ID

**Checker 3: Rural Cadastre**
- **Priority:** HIGH
- **Complexity:** LOW-MEDIUM
- **Data:** Download rural shapefile (monthly updates)
- **Similar to:** CAR geometry checker
- **Implementation:**
  1. Download rural parcel shapefile
  2. Convert to PostGIS
  3. Seed into `catastro_rural_uruguay` table
  4. Create `CatastroRuralChecker` class
  5. Enable coordinate → padron lookup

---

### Phase 3: Additional Checkers (Week 5-6)

**Checker 4: Environmental Complaints**
- **Priority:** MEDIUM
- **Complexity:** LOW
- **Data:** Download CSV from catalogodatos.gub.uy
- **Implementation:**
  1. Download denuncias-ambientales.csv
  2. Parse and validate
  3. Seed into `environmental_complaints_uruguay` table
  4. Create `EnvironmentalComplaintsChecker` class

**Checker 5: DINAGUA Water Permits**
- **Priority:** MEDIUM
- **Complexity:** MEDIUM
- **Data:** Request updated 2024/2025 data
- **Blocker:** Need current data (2019 too old)
- **Implementation:**
  1. Contact DINAGUA for updated data
  2. Download and parse CSV
  3. Seed into `water_permits_uruguay` table
  4. Create `WaterPermitsChecker` class

**Checker 6: NASA FIRMS Fire Alerts**
- **Priority:** MEDIUM
- **Complexity:** MEDIUM
- **Data:** NASA FIRMS API (real-time)
- **Similar to:** Brazil DETER checker
- **Implementation:**
  1. Register for NASA FIRMS API key
  2. Create download script for Uruguay bbox
  3. Seed into `fire_alerts` table (shared with Brazil)
  4. Create `FireAlertsChecker` class
  5. Add to daily cron job

---

### Phase 4: Blocked/Future Checkers

**Not Available (Advocacy Required):**
- ❌ MTSS Labor Violations - No public data
- ❌ TCR Administrative Sanctions - No public data
- ❌ DGF Forest Violations - No public data

**Action Items:**
1. Submit transparency requests to MTSS, TCR
2. Contact DGF about forest violation data
3. Document in GitHub issue for future implementation

**Low Priority (Global Data):**
- DGI RUC Verification - Online verification only (no bulk dataset)
- DINAMA Environmental Permits - No public API found

---

## Data Summary Table

| # | Source | Provider | Format | Auth | Records | Priority | Status |
|---|--------|----------|--------|------|---------|----------|--------|
| 1 | SNAP Protected Areas | Ambiente | Shapefile | None | 22 areas | HIGH | ✅ Available |
| 2 | Environmental Complaints | Ambiente | CSV/XLSX/XML | None | ~1000+ | MEDIUM | ✅ Available |
| 3 | DINAGUA Water Permits | Ambiente | CSV | None | ? (2019) | MEDIUM | ⚠️ Outdated |
| 4 | DGF Forest Management | MGAP | Geoportal | Unknown | ? | LOW | 🔄 Limited |
| 5 | Fire Alerts | NASA/INPE | API | API Key | Daily | MEDIUM | ✅ Available |
| 6 | DICOSE Livestock | MGAP | CSV/XML | None | ~50K+ | HIGH | ✅ Available |
| 7 | Catastro Rural | MEF | Shapefile | None | ~100K+ | HIGH | ✅ Available |
| 8 | MTSS Labor Violations | MTSS | N/A | N/A | N/A | HIGH | ❌ Missing |
| 9 | TCR Sanctions | TCR | N/A | N/A | N/A | LOW | ❌ Missing |
| 10 | DGI RUC Verification | DGI | Online | None | Verify only | MEDIUM | 🔄 Limited |
| 11 | IDE Uruguay WFS | Multiple | WFS/WMS | None | Varies | HIGH | ✅ Available |

**Legend:**
- ✅ Available: Data accessible, ready for implementation
- ⚠️ Outdated: Data exists but needs update
- 🔄 Limited: Partial access or limited scope
- ❌ Missing: No public data source found

---

## Next Steps

### Immediate Actions (This Week)

1. **Update Task #1 Status to Completed**
2. **Download Sample Data:**
   - SNAP shapefile
   - DICOSE 2024 CSV (general data file)
   - Rural cadastre shapefile
   - Environmental complaints CSV
3. **Explore IDE WFS:**
   - Execute GetCapabilities request
   - Document available layers
4. **Create Input Type Updates:**
   - Add Uruguay country enum
   - Add CI/RUC input types
   - Implement validators

### Data Requests (Next Week)

1. **Contact DINAGUA:** Request 2024/2025 water permits data
2. **Contact Ambiente:** Confirm SNAP WFS layer name for IDE access
3. **Register NASA FIRMS:** Get API key for fire alerts
4. **Transparency Requests:** Submit to MTSS and TCR for violation data

### Development (Week 3+)

1. Implement Phase 2 checkers (SNAP, DICOSE, Catastro)
2. Create sample endpoints for Uruguay data
3. Add integration tests
4. Update API documentation
5. Deploy to staging for testing

---

## Resources

### Official Portals
- **Open Data Catalog:** https://catalogodatos.gub.uy
- **IDE Uruguay:** https://www.gub.uy/infraestructura-datos-espaciales/
- **Ministry of Environment:** https://www.gub.uy/ministerio-ambiente/
- **MGAP:** https://www.gub.uy/ministerio-ganaderia-agricultura-pesca/
- **MTSS:** https://www.gub.uy/ministerio-trabajo-seguridad-social/

### Technical Documentation
- **GeoServer WFS:** https://docs.geoserver.org/stable/en/user/services/wfs/
- **NASA FIRMS API:** https://firms.modaps.eosdis.nasa.gov/
- **OpenCorporates Uruguay:** https://opencorporates.com/registers/271

### Contact Points
- **SNAP Data:** secretaria.snap@ambiente.gub.uy
- **Ambiente Geoservices:** oan@ambiente.gub.uy
- **IDE Support:** Contact via gub.uy portal

---

**Document Version:** 1.0
**Author:** Research by Claude (Anthropic)
**Date:** 2026-02-16
**Status:** Research Complete - Ready for Implementation
