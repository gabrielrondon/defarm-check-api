# Production API Key - DeFarm Core
**Date:** 2026-02-01
**Status:** ✅ READY TO INSTALL

---

## 🔑 API Key Information

**API Key:** `ck_prod_defarmcore_215567c8739c9e5d21482b1830bd93ff8406b3e9ad50e70de0b4916a55f3ca7b`

**Details:**
- **Name:** DeFarm Core - Production
- **Prefix:** ck_prod_defa
- **Permissions:** read, write
- **Rate Limit:** 10,000 requests/minute
- **Expires:** Never
- **Created By:** admin
- **Created:** 2026-02-01

⚠️ **IMPORTANT:** This key has NOT been installed in production yet. Follow the installation steps below.

---

## 📥 Installation Steps

### **Option 1: Railway Dashboard (Recommended)**

1. Go to [Railway Dashboard](https://railway.app/)
2. Select your project
3. Click on **PostgreSQL** service
4. Click **Data** or **Query** tab
5. Paste the SQL below and click **Execute**

```sql
INSERT INTO api_keys (
    name,
    key_prefix,
    key_hash,
    is_active,
    rate_limit,
    permissions,
    created_by
) VALUES (
    'DeFarm Core - Production',
    'ck_prod_defa',
    '$2b$10$/veWDrys9YyPEi2mg9tAwOPGDnhpO5IZHdOte0vLwI.tSgshV4SHS',
    true,
    10000,
    '["read", "write"]',
    'admin'
);
```

### **Option 2: Railway CLI**

```bash
# Connect to project
railway link

# Connect to postgres
railway connect postgres

# Paste the SQL above and press Enter
```

### **Option 3: File Execution**

```bash
# SQL is already saved in /tmp/insert-production-key.sql
railway run bash -c 'cat /tmp/insert-production-key.sql | psql $DATABASE_URL'
```

---

## ✅ Verify Installation

After installation, verify the key works:

```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ck_prod_defarmcore_215567c8739c9e5d21482b1830bd93ff8406b3e9ad50e70de0b4916a55f3ca7b" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "12345678000190"
    }
  }'
```

Expected response: `200 OK` with check results.

---

## 🔒 Security Best Practices

### **DO:**
- ✅ Store key in environment variables
- ✅ Use HTTPS only
- ✅ Rotate key every 6-12 months
- ✅ Monitor API usage via /workers/health
- ✅ Set up rate limiting alerts

### **DON'T:**
- ❌ Commit key to Git
- ❌ Share key publicly
- ❌ Use key in client-side code
- ❌ Log full key in application logs
- ❌ Include key in URLs or query params

---

## 📊 Usage Examples

### **Node.js / TypeScript**

```typescript
const API_KEY = process.env.CHECK_API_KEY;
const API_URL = 'https://defarm-check-api-production.up.railway.app';

async function checkCompliance(cnpj: string) {
  const response = await fetch(`${API_URL}/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: JSON.stringify({
      input: {
        type: 'CNPJ',
        value: cnpj
      }
    })
  });

  return await response.json();
}

// Usage
const result = await checkCompliance('12345678000190');
console.log(`Verdict: ${result.verdict}`);
console.log(`Score: ${result.score}`);
```

### **Python**

```python
import os
import requests

API_KEY = os.getenv('CHECK_API_KEY')
API_URL = 'https://defarm-check-api-production.up.railway.app'

def check_compliance(cnpj):
    response = requests.post(
        f'{API_URL}/check',
        headers={
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY
        },
        json={
            'input': {
                'type': 'CNPJ',
                'value': cnpj
            }
        }
    )
    return response.json()

# Usage
result = check_compliance('12345678000190')
print(f"Verdict: {result['verdict']}")
print(f"Score: {result['score']}")
```

### **cURL**

```bash
export CHECK_API_KEY="ck_prod_defarmcore_215567c8739c9e5d21482b1830bd93ff8406b3e9ad50e70de0b4916a55f3ca7b"

curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CHECK_API_KEY" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "12345678000190"
    }
  }'
```

---

## 📈 Monitoring

### **Check API Usage**

```bash
curl https://defarm-check-api-production.up.railway.app/workers/health \
  | jq '.systemHealth'
```

### **View API Key Details** (via database)

```sql
SELECT
    name,
    key_prefix,
    is_active,
    rate_limit,
    permissions,
    last_used_at,
    created_at
FROM api_keys
WHERE name = 'DeFarm Core - Production';
```

---

## 🔄 Key Rotation

When rotating the key:

1. Generate new key using `scripts/generate-production-key.ts`
2. Update defarm-core environment variables
3. Test new key works
4. Deactivate old key:
   ```sql
   UPDATE api_keys
   SET is_active = false
   WHERE key_prefix = 'ck_prod_defa';
   ```
5. Monitor for any errors
6. Delete old key after 30 days:
   ```sql
   DELETE FROM api_keys
   WHERE key_prefix = 'ck_prod_defa'
   AND is_active = false;
   ```

---

## 🚨 Emergency: Revoke Key

If key is compromised:

```sql
-- Immediately deactivate
UPDATE api_keys
SET is_active = false
WHERE name = 'DeFarm Core - Production';

-- Or delete completely
DELETE FROM api_keys
WHERE name = 'DeFarm Core - Production';
```

Then generate and install new key immediately.

---

## 📝 Integration Checklist

For defarm-core team:

- [ ] Install API key in production database (see Installation Steps)
- [ ] Add key to defarm-core environment variables as `CHECK_API_KEY`
- [ ] Test key works with sample requests
- [ ] Update defarm-core documentation with API endpoint
- [ ] Set up monitoring/alerts for API usage
- [ ] Schedule key rotation reminder (6 months)
- [ ] Document error handling for API failures
- [ ] Test rate limiting behavior
- [ ] Implement retry logic with backoff
- [ ] Add API health check to defarm-core monitoring

---

## 🔗 Related Documentation

- API Documentation: Check OpenAPI spec at `/docs`
- Health Check: `/health` endpoint
- Workers Status: `/workers/health` endpoint
- SLA Documentation: `DATA_SOURCES_SLA.md`
- E2E Tests: `E2E_TESTS_REPORT.md`

---

## 📞 Support

For issues or questions:
- Check API health: https://defarm-check-api-production.up.railway.app/health
- Check workers: https://defarm-check-api-production.up.railway.app/workers/health
- Review logs: Railway Dashboard > API Service > Logs
- Check SLAs: DATA_SOURCES_SLA.md

---

**Generated:** 2026-02-01
**Installed:** ⏸️ PENDING INSTALLATION
**Last Updated:** 2026-02-01
