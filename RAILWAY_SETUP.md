# Railway Deployment Guide

## Current Infrastructure

**Project ID:** `54217b47-61c5-4dcf-ae17-2ec0c7a249f0`
**Project Name:** checker

### Services:
1. **PostgreSQL + PostGIS** (caboose.proxy.rlwy.net:18740)
2. **Redis** (to be added)
3. **Check API** (to be deployed)

## Setup Steps

### 1. Add Redis Service ✅ COMPLETED

Redis service has been created with these credentials:
- **Internal URL** (for Railway services): `redis://default:$REDIS_PASSWORD@redis.railway.internal:6379`
- **Public URL** (for external access): `redis://default:$REDIS_PASSWORD@maglev.proxy.rlwy.net:XXXX`
- **Password**: `xiAPMUNayRBGxVOjsDzHxLmlHlFgDGYR`

✅ Tested and working from local environment

### 2. Deploy Check API

1. In Railway project, click "+ New" → "GitHub Repo"
2. Select repository: `gabrielrondon/defarm-check-api`
3. Configure service:
   - **Name:** check-api
   - **Branch:** main
   - **Root Directory:** (leave empty)

### 3. Configure Environment Variables

Add these variables to the **check-api** service:

```bash
# Environment
NODE_ENV=production

# Server
PORT=3000
HOST=0.0.0.0

# Database (PostGIS service named "caboose")
DATABASE_URL=${{caboose.DATABASE_URL}}

# Redis (use internal URL for better performance within Railway)
# Railway auto-provides this as ${{Redis.REDIS_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
REDIS_PASSWORD=${{Redis.REDIS_PASSWORD}}

# API Security
API_SECRET=<generate-a-secure-secret-here>
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# Cache
CACHE_ENABLED=true
DEFAULT_CACHE_TTL=3600

# Logging
LOG_LEVEL=info
LOG_PRETTY=false
```

**Note:** Railway automatically provides `${{serviceName.VARIABLE}}` references for service-to-service communication.

### 4. Build Configuration

Railway should auto-detect the build from `package.json`:

```json
{
  "scripts": {
    "build": "tsc && tsc-alias",
    "start": "node dist/index.js"
  }
}
```

If needed, configure manually:
- **Build Command:** `npm run build`
- **Start Command:** `npm start`

### 5. Health Check Endpoint

Add a health check route (recommended):

```
GET /health
```

Should return:
```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### 6. Database Migrations

**Before first deployment**, run migrations:

```bash
# Locally, with Railway DATABASE_URL
export DATABASE_URL="postgresql://postgres:$DATABASE_PASSWORD@caboose.proxy.rlwy.net:XXXX/railway"
npm run db:migrate
```

Or add as Railway deployment command:
```bash
npm run build && npm run db:migrate && npm start
```

### 7. Seed Data (Optional)

If you want to seed data on Railway (not recommended for large datasets):

```bash
npm run data:lista-suja
npm run data:ibama
npm run data:prodes
```

**Recommended:** Keep large data files local and access Railway DB remotely.

## Redis URLs Explained

Railway provides two types of URLs for Redis:

**1. Internal URL** (recommended for production):
```
redis://default:$REDIS_PASSWORD@redis.railway.internal:6379
```
- Used by services running **inside** Railway
- Faster (no external network)
- Free bandwidth (no egress costs)
- Use this in production environment variables

**2. Public URL** (for external access):
```
redis://default:$REDIS_PASSWORD@maglev.proxy.rlwy.net:XXXX
```
- Used from **outside** Railway (e.g., your local machine)
- Useful for debugging production data
- Incurs egress bandwidth costs
- Use this in local `.env` for testing production data

**Configuration:**
- **Local development**: Use `REDIS_PUBLIC_URL` in `.env`
- **Railway production**: Use `${{Redis.REDIS_URL}}` (internal URL)

## Production Checklist

- [x] Redis service created and tested
- [ ] Check API service deployed to Railway
- [ ] Environment variables configured
- [ ] API_SECRET changed to secure value
- [ ] LOG_PRETTY=false (JSON logging for production)
- [ ] Database migrations applied
- [ ] Data seeded (Lista Suja, IBAMA, PRODES)
- [ ] Health check endpoint responding
- [ ] Test API endpoint: `POST /check`
- [ ] Monitor logs for errors
- [ ] Set up custom domain (optional)
- [ ] Enable Railway metrics/monitoring

## Testing Production

Once deployed, test with:

```bash
# Get your Railway URL (e.g., https://check-api-production.up.railway.app)
RAILWAY_URL="https://your-app.railway.app"

# Test health
curl $RAILWAY_URL/health

# Test check endpoint
curl -X POST $RAILWAY_URL/check \
  -H "Content-Type: application/json" \
  -d '{"input":{"type":"COORDINATES","value":{"lat":-7.0945,"lon":-61.089}}}'
```

## Integration with defarm-core

Once deployed, defarm can call the Check API:

```typescript
// In defarm-core
const response = await fetch('https://check-api.railway.app/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    input: {
      type: 'CNPJ',
      value: '12345678000190'
    }
  })
});

const result = await response.json();
// result: { checkId, verdict, score, sources, summary, metadata }
```

## Future Enhancements

1. **Authentication:** Add API key authentication (Task #9)
2. **Webhooks:** Add webhook support for async checks
3. **Monitoring:** Set up Railway metrics + external monitoring (Sentry, DataDog)
4. **Custom Domain:** Map to defarm.com subdomain
5. **Rate Limiting:** Adjust based on actual usage
6. **Caching Strategy:** Tune TTL values per checker

## Troubleshooting

**Redis connection errors:**
- Verify REDIS_URL is correct
- Check Redis service is running
- Ensure network policies allow connection

**Database connection errors:**
- Verify DATABASE_URL is correct
- Ensure PostGIS extension is installed
- Check migrations are applied

**Build failures:**
- Check Node.js version (>=18.0.0)
- Verify all dependencies in package.json
- Check build logs in Railway dashboard
