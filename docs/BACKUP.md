# Database Backup Configuration

Automated PostgreSQL backup for DeFarm Check API.

## Strategy

- **Frequency**: Weekly (Sundays 01:00 UTC)
- **Method**: pg_dump + gzip
- **Storage**: GitHub (branch `backups`)
- **Retention**: Last 7 backups
- **Notifications**: Telegram (success/failure)

## Setup (Railway)

### 1. Install PostgreSQL Client

PostgreSQL client tools (pg_dump) should be available in Railway by default. If not, add to `nixpacks.toml`:

```toml
[phases.setup]
aptPkgs = ["postgresql-client"]
```

### 2. Configure GitHub Token

Create a GitHub Personal Access Token with `repo` scope:

1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scope: `repo` (full control)
4. Copy token

Add to Railway environment variables:

```bash
railway variables set GITHUB_TOKEN=ghp_your_token_here
```

### 3. Configure Git (Railway)

Add to Railway environment or startup script:

```bash
git config --global user.name "DeFarm Backup Bot"
git config --global user.email "backup@defarm.com"
git config --global credential.helper store
```

### 4. Deploy

The backup job will run automatically every Sunday at 01:00 UTC.

## Manual Backup

```bash
# Local
npm run backup:database

# Railway
railway run npm run backup:database
```

## Restore from Backup

### 1. Download Backup

```bash
# List available backups
git clone https://github.com/gabrielrondon/defarm-check-api.git
cd defarm-check-api
git checkout backups

# Download specific backup
wget https://github.com/gabrielrondon/defarm-check-api/raw/backups/defarm-check-backup-2026-02-01.sql.gz
```

### 2. Decompress

```bash
gunzip defarm-check-backup-2026-02-01.sql.gz
```

### 3. Restore to Database

```bash
# Warning: This will DROP existing tables and recreate them!

psql $DATABASE_URL < defarm-check-backup-2026-02-01.sql
```

## Troubleshooting

### pg_dump not found

Install PostgreSQL client:
```bash
# Ubuntu/Debian
apt-get install postgresql-client

# macOS
brew install postgresql
```

### Git push fails (authentication)

Check GITHUB_TOKEN is set:
```bash
railway variables | grep GITHUB_TOKEN
```

Reconfigure git credentials:
```bash
git config --global credential.helper store
echo "https://$GITHUB_TOKEN:x-oauth-basic@github.com" > ~/.git-credentials
```

### Backup too large

Backups are compressed with gzip (typically 80-90% compression).

If still too large:
- Consider `--data-only` or `--schema-only` pg_dump
- Use external storage (S3, Cloudflare R2)
- Exclude large tables: `--exclude-table=table_name`

## Monitoring

- Check Telegram notifications (sent after each backup)
- View logs: `railway logs --service check-api-worker | grep backup`
- Check GitHub branch: https://github.com/gabrielrondon/defarm-check-api/tree/backups

## Cost

- ✅ **Free**: GitHub storage (included in repo)
- ✅ **Free**: Railway execution (uses existing worker service)
- ✅ **Free**: Telegram notifications

No additional costs!
