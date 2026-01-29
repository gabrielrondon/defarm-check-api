# 🔴 Security Incident Report - Credentials Leak

**Date:** January 29, 2026
**Severity:** CRITICAL
**Status:** ⚠️ REMEDIATION IN PROGRESS

## Summary

GitGuardian detected exposed credentials in the public GitHub repository `gabrielrondon/defarm-check-api`.

## Exposed Credentials

### 1. Redis Password
- **Value:** `xiAPMUNayRBGxVOjsDzHxLmlHlFgDGYR`
- **Files:** `RAILWAY_SETUP.md`, `.env.production.example`
- **Impact:** Attacker can access/flush cache, read sensitive data, DoS

### 2. PostgreSQL Password
- **Value:** `gA22AgAddGceGg55Dd62d6b3EaD32bg5`
- **Files:** `RAILWAY_SETUP.md`, `scripts/seed-production.sh`
- **Impact:** Full database access - read/modify/delete all data

### 3. Production API Key
- **Value:** `ck_056af37680464425d1f23c543515951920f9947f022e3cb5735844673edb4f12`
- **Files:** `docs/EXAMPLES.md` (5 occurrences)
- **Impact:** 10,000 requests/min, consume resources, access check results

## Root Cause

1. Documentation files included real credentials instead of placeholders
2. No pre-commit hooks to detect secrets
3. No GitGuardian integration before push
4. `.env.production.example` contained real passwords

## Immediate Actions Required

### 🚨 Priority 1: Revoke ALL Credentials (DO THIS NOW)

#### 1.1 Rotate Redis Password on Railway
```bash
# Railway Dashboard:
1. Go to Redis service
2. Click "Settings" → "Variables"
3. Click regenerate on REDIS_PASSWORD
4. Copy new password
5. Update check-api service environment variables
6. Redeploy check-api
```

#### 1.2 Rotate Database Password on Railway
```bash
# Railway Dashboard:
1. Go to PostgreSQL (caboose) service
2. Click "Settings" → "Variables"
3. Click regenerate on POSTGRES_PASSWORD
4. Copy new password
5. Update check-api service environment variables
6. Redeploy check-api
```

#### 1.3 Revoke Exposed API Key
```bash
# In your local environment:
cd /Users/gabrielrondon/defarm/check

# Connect to production database
export DATABASE_URL="postgresql://postgres:NEW_PASSWORD@caboose.proxy.rlwy.net:18740/railway"

# Revoke the key
psql $DATABASE_URL -c "UPDATE api_keys SET is_active = false WHERE key_hash LIKE '%056af376%';"

# Create new API key
npm run create-api-key -- --name "defarm-core Production (NEW)" --rate-limit 10000

# Save the new key securely in password manager
```

### ⏱️ Priority 2: Clean Repository

#### 2.1 Commit Placeholder Changes
```bash
# Already done - files cleaned:
git add RAILWAY_SETUP.md
git add scripts/seed-production.sh
git add .env.production.example
git add docs/EXAMPLES.md
git add .gitguardian.yaml
git commit -m "security: remove exposed credentials, add secret detection"
```

#### 2.2 Clean Git History (BREAKS HISTORY - Notify Team First!)

**Option A: BFG Repo-Cleaner (Recommended)**
```bash
# Install BFG
brew install bfg

# Create backup
git clone https://github.com/gabrielrondon/defarm-check-api.git defarm-check-api-backup

# Clone fresh copy
git clone --mirror https://github.com/gabrielrondon/defarm-check-api.git defarm-check-api-clean.git

cd defarm-check-api-clean.git

# Create passwords.txt with secrets to remove
cat > /tmp/passwords.txt << EOF
xiAPMUNayRBGxVOjsDzHxLmlHlFgDGYR
gA22AgAddGceGg55Dd62d6b3EaD32bg5
ck_056af37680464425d1f23c543515951920f9947f022e3cb5735844673edb4f12
EOF

# Remove secrets from history
bfg --replace-text /tmp/passwords.txt

# Clean reflog
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (DANGEROUS - breaks history)
git push --force
```

**Option B: git-filter-repo**
```bash
# Install
pip3 install git-filter-repo

# Clone fresh copy
git clone https://github.com/gabrielrondon/defarm-check-api.git defarm-check-api-clean
cd defarm-check-api-clean

# Remove sensitive files from history
git filter-repo --path RAILWAY_SETUP.md --invert-paths --force
git filter-repo --path scripts/seed-production.sh --invert-paths --force

# Force push
git push origin main --force
```

**Option C: Orphan Branch (Simplest - Loses All History)**
```bash
cd /Users/gabrielrondon/defarm/check

# Backup current branch
git branch backup-main

# Create orphan branch (no history)
git checkout --orphan new-main

# Stage all files
git add -A

# Commit
git commit -m "chore: clean repository (removed credential history)"

# Delete old main
git branch -D main

# Rename new-main to main
git branch -m main

# Force push
git push -f origin main
```

### 📋 Priority 3: Prevent Future Leaks

#### 3.1 Enable Pre-commit Hooks
```bash
# Already done - hook created at .git/hooks/pre-commit
# Test it:
echo "redis://default:xiAPMUNayRBGxVOjsDzHxLmlHlFgDGYR@redis" > test.txt
git add test.txt
git commit -m "test"  # Should be BLOCKED
rm test.txt
```

#### 3.2 Install GitGuardian CLI (Optional but Recommended)
```bash
# Install ggshield
pip3 install ggshield

# Authenticate
ggshield auth login

# Scan current repository
ggshield secret scan repo .

# Add to CI/CD
# Add to .github/workflows/security.yml (see below)
```

#### 3.3 Update .gitignore
```bash
cat >> .gitignore << EOF

# Security - Never commit these
.env
.env.local
.env.production
.env.*.local
**/secrets.json
**/credentials.json
**/*password*.txt
**/*secret*.txt
EOF

git add .gitignore
git commit -m "security: update gitignore to prevent secret commits"
```

### 🔍 Priority 4: Audit & Monitor

#### 4.1 Check Railway Logs for Suspicious Activity
```bash
# Railway Dashboard:
1. Go to check-api service
2. Click "Logs"
3. Look for:
   - Unusual API requests
   - Failed authentication attempts
   - Database queries from unknown IPs
   - High CPU/memory usage
```

#### 4.2 Check Database for Unauthorized Changes
```bash
# Connect to database
psql $DATABASE_URL

-- Check for unauthorized API keys
SELECT name, created_at, last_used_at
FROM api_keys
WHERE created_at > '2026-01-29'
ORDER BY created_at DESC;

-- Check for unusual check requests
SELECT COUNT(*), DATE(timestamp)
FROM check_requests
WHERE timestamp > '2026-01-29'
GROUP BY DATE(timestamp)
ORDER BY COUNT(*) DESC;

-- Check for data deletions
-- (You should have audit logs - if not, implement them!)
```

#### 4.3 Review GitHub Repository Access
```bash
# GitHub Settings:
1. Go to repository Settings → Collaborators
2. Review all users with access
3. Remove any suspicious accounts
4. Enable "Require 2FA"
```

## Lessons Learned

### What Went Wrong
1. ❌ Used real credentials in documentation/examples
2. ❌ No pre-commit hooks to catch secrets
3. ❌ No GitGuardian scan before push
4. ❌ `.env.production.example` had real passwords
5. ❌ No security review of commits

### What Should Have Been Done
1. ✅ Use placeholders (`YOUR_PASSWORD`, `YOUR_API_KEY`) in all docs
2. ✅ Use environment variable references (`$REDIS_PASSWORD`)
3. ✅ Enable GitGuardian GitHub integration
4. ✅ Add pre-commit hooks for secret detection
5. ✅ Security review before public repository
6. ✅ Separate public docs from internal runbooks

## Prevention Checklist

- [x] Remove credentials from code (committed)
- [ ] Rotate Redis password on Railway
- [ ] Rotate Database password on Railway
- [ ] Revoke exposed API key
- [ ] Create new API key
- [ ] Update Railway environment variables
- [ ] Clean git history (choose method above)
- [ ] Force push cleaned repository
- [x] Add pre-commit hook
- [x] Add .gitguardian.yaml
- [ ] Install ggshield (optional)
- [ ] Review Railway logs
- [ ] Audit database access
- [ ] Enable 2FA on GitHub
- [ ] Document incident in team wiki
- [ ] Schedule security training
- [ ] Implement audit logging

## Communication

### Who to Notify
- [ ] Security team
- [ ] DevOps team
- [ ] Engineering manager
- [ ] Users of the exposed API key (defarm-core team)

### Template Email
```
Subject: [SECURITY] Credentials Exposed in GitHub - Action Required

Team,

We discovered that production credentials were accidentally committed to our public GitHub repository on January 29, 2026.

Exposed:
- Redis password
- PostgreSQL password
- Production API key

Actions taken:
- All credentials have been rotated
- Repository has been cleaned
- Pre-commit hooks added to prevent future incidents

Impact:
- No evidence of unauthorized access
- All systems operational
- New credentials deployed

Actions required from you:
- [If you saved the old API key] Delete it and use the new one: [new key]
- Enable 2FA on GitHub if not already enabled
- Review security best practices document

Please let me know if you have any questions.

Best regards,
[Your Name]
```

## References

- [GitGuardian Alert Details](https://dashboard.gitguardian.com)
- [Railway Dashboard](https://railway.app)
- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)
- [git-filter-repo](https://github.com/newren/git-filter-repo)
- [GitGuardian ggshield](https://github.com/GitGuardian/ggshield)

---

**Last Updated:** January 29, 2026
**Incident Manager:** [Your Name]
**Status:** IN PROGRESS
