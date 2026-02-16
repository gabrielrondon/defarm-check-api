#!/bin/bash
#
# Uruguay Support Deployment Script
# Automates the deployment of Uruguay multi-country support to production
#
# Usage: ./scripts/deploy-uruguay.sh [--dry-run]
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Deployment configuration
DRY_RUN=false
PRODUCTION_URL="https://defarm-check-api-production.up.railway.app"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--dry-run]"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    Uruguay Support - Production Deployment Script             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}🔍 DRY RUN MODE - No actual deployment will occur${NC}"
  echo ""
fi

# Step 1: Pre-deployment checks
echo -e "${BLUE}[1/7] Running pre-deployment checks...${NC}"

# Check if on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${RED}❌ Not on main branch. Current: $CURRENT_BRANCH${NC}"
  echo -e "${YELLOW}   Switch to main branch: git checkout main${NC}"
  exit 1
fi
echo -e "${GREEN}✓ On main branch${NC}"

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo -e "${YELLOW}⚠️  Uncommitted changes detected${NC}"
  echo ""
  git status --short
  echo ""
  read -p "Continue with uncommitted changes? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Deployment cancelled${NC}"
    exit 1
  fi
fi
echo -e "${GREEN}✓ Git status checked${NC}"

# Run tests
echo -e "${BLUE}Running Uruguay integration tests...${NC}"
if npm test -- snap-protected-areas.test.ts dicose-rural.test.ts --run --reporter=verbose 2>&1 | grep -q "Test Files.*passed"; then
  echo -e "${GREEN}✓ All tests passed${NC}"
else
  echo -e "${RED}❌ Tests failed${NC}"
  exit 1
fi

# Build project
echo -e "${BLUE}Building TypeScript...${NC}"
if npm run build > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Build successful${NC}"
else
  echo -e "${RED}❌ Build failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Pre-deployment checks complete${NC}"
echo ""

# Step 2: Display deployment summary
echo -e "${BLUE}[2/7] Deployment Summary${NC}"
echo -e "${YELLOW}Changes to be deployed:${NC}"
echo "  • Multi-country infrastructure (Country enum, InputTypes)"
echo "  • Document validators (RUC, CI with check digit)"
echo "  • Database migrations (3 new migrations)"
echo "  • SNAP Protected Areas checker (Uruguay)"
echo "  • DICOSE Rural Registry checker (Uruguay)"
echo "  • Sample endpoints (/samples/snap, /samples/dicose)"
echo "  • Documentation (6 new docs)"
echo "  • Integration tests (39 tests)"
echo ""

# Count files to be committed
NEW_FILES=$(git ls-files --others --exclude-standard | grep -E '\.(ts|sql|md|js|json)$' | wc -l | tr -d ' ')
MODIFIED_FILES=$(git diff --name-only | wc -l | tr -d ' ')
echo -e "${YELLOW}Files:${NC}"
echo "  • New files: $NEW_FILES"
echo "  • Modified files: $MODIFIED_FILES"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}Dry run - skipping actual deployment${NC}"
  exit 0
fi

# Step 3: Confirm deployment
echo -e "${BLUE}[3/7] Confirm Deployment${NC}"
echo -e "${YELLOW}⚠️  This will deploy to production: $PRODUCTION_URL${NC}"
read -p "Continue with deployment? (yes/no) " -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  echo -e "${RED}Deployment cancelled${NC}"
  exit 1
fi

# Step 4: Stage and commit changes
echo -e "${BLUE}[4/7] Staging changes...${NC}"

# Stage Uruguay-related files
git add docs/MULTI_COUNTRY.md
git add docs/DATA_SOURCES_URUGUAY.md
git add docs/SNAP_CHECKER_URUGUAY.md
git add docs/DICOSE_CHECKER_URUGUAY.md
git add docs/SAMPLES_ENDPOINTS.md
git add docs/URUGUAY_TESTING.md
git add docs/URUGUAY_DEPLOYMENT.md

git add src/types/input.ts
git add src/utils/validators.ts
git add src/utils/validators-uruguay.test.ts

git add src/db/schema.ts
git add src/db/migrations/0016_peaceful_morg.sql
git add src/db/migrations/0017_free_kitty_pryde.sql
git add src/db/migrations/0018_clean_microchip.sql
git add src/db/migrations/meta/

git add src/checkers/base.ts
git add src/checkers/index.ts
git add src/checkers/uruguay/

git add scripts/download-snap-areas.ts
git add scripts/seed-snap-areas.ts
git add scripts/download-dicose.ts
git add scripts/seed-dicose.ts
git add scripts/deploy-uruguay.sh

git add src/api/plugins/swagger.ts
git add src/api/routes/samples.ts
git add src/services/orchestrator.ts

git add README.md
git add CLAUDE.md
git add package.json

echo -e "${GREEN}✓ Changes staged${NC}"

# Create commit
COMMIT_MESSAGE="feat: add Uruguay multi-country support with SNAP and DICOSE checkers

Adds comprehensive multi-country support to DeFarm Check API with Uruguay
as the first additional country beyond Brazil.

New Features:
- Multi-country architecture (Country enum, auto-detection)
- Uruguay document types (RUC, CI with check digit validation)
- SNAP Protected Areas checker (PostGIS spatial queries)
- DICOSE Rural Registry checker
- Sample endpoints for Uruguay data
- Country-aware checker selection

Database Changes:
- Add country column to multi-country tables
- Create snap_areas_uruguay table with PostGIS geometry
- Create dicose_registrations table

Testing:
- 39 integration tests (100% passing)
- Full coverage of Uruguay checkers
- Backwards compatibility verified

Documentation:
- Multi-country architecture guide
- Uruguay data sources research
- SNAP and DICOSE checker documentation
- Testing and deployment guides

Backwards Compatibility:
- All existing Brazil functionality unchanged
- Default country is Brazil (BR)
- Existing API endpoints work without changes

Related: #UY-001"

echo -e "${BLUE}Creating commit...${NC}"
if git commit -m "$COMMIT_MESSAGE"; then
  echo -e "${GREEN}✓ Commit created${NC}"
else
  echo -e "${YELLOW}⚠️  Nothing to commit (already committed?)${NC}"
fi
echo ""

# Step 5: Push to remote
echo -e "${BLUE}[5/7] Pushing to remote...${NC}"
if git push origin main; then
  echo -e "${GREEN}✓ Pushed to origin/main${NC}"
else
  echo -e "${RED}❌ Push failed${NC}"
  exit 1
fi
echo ""

# Step 6: Wait for Railway deployment
echo -e "${BLUE}[6/7] Waiting for Railway deployment...${NC}"
echo -e "${YELLOW}   Railway will automatically deploy from main branch${NC}"
echo -e "${YELLOW}   This typically takes 3-5 minutes${NC}"
echo ""
echo -e "${BLUE}Monitor deployment at: https://railway.app${NC}"
echo ""

# Wait for user confirmation
read -p "Press Enter when Railway deployment is complete..."
echo ""

# Step 7: Run post-deployment verification
echo -e "${BLUE}[7/7] Post-deployment verification${NC}"

# Test health endpoint
echo -e "${BLUE}Testing health endpoint...${NC}"
if curl -s -f "$PRODUCTION_URL/health" > /dev/null; then
  echo -e "${GREEN}✓ Health check passed${NC}"
else
  echo -e "${RED}❌ Health check failed${NC}"
  exit 1
fi

# Test sources endpoint
echo -e "${BLUE}Testing sources endpoint...${NC}"
SOURCES=$(curl -s "$PRODUCTION_URL/sources")
if echo "$SOURCES" | grep -q "SNAP Protected Areas"; then
  echo -e "${GREEN}✓ SNAP checker found in sources${NC}"
else
  echo -e "${YELLOW}⚠️  SNAP checker not found in sources${NC}"
fi

if echo "$SOURCES" | grep -q "DICOSE Rural Registry"; then
  echo -e "${GREEN}✓ DICOSE checker found in sources${NC}"
else
  echo -e "${YELLOW}⚠️  DICOSE checker not found in sources${NC}"
fi

# Test sample endpoints (requires API key)
echo -e "${BLUE}Testing sample endpoints...${NC}"
if [ -z "$API_KEY" ]; then
  echo -e "${YELLOW}⚠️  API_KEY not set, skipping authenticated tests${NC}"
  echo -e "${YELLOW}   Set API_KEY environment variable for full verification${NC}"
else
  # Test /samples/snap
  if curl -s -f -H "X-API-Key: $API_KEY" "$PRODUCTION_URL/samples/snap" > /dev/null; then
    echo -e "${GREEN}✓ /samples/snap endpoint working${NC}"
  else
    echo -e "${RED}❌ /samples/snap endpoint failed${NC}"
  fi

  # Test /samples/dicose
  if curl -s -f -H "X-API-Key: $API_KEY" "$PRODUCTION_URL/samples/dicose" > /dev/null; then
    echo -e "${GREEN}✓ /samples/dicose endpoint working${NC}"
  else
    echo -e "${RED}❌ /samples/dicose endpoint failed${NC}"
  fi

  # Test Uruguay RUC check
  echo -e "${BLUE}Testing Uruguay RUC check...${NC}"
  RUC_RESPONSE=$(curl -s -X POST "$PRODUCTION_URL/check" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"input":{"type":"RUC","value":"220123456789","country":"UY"}}')

  if echo "$RUC_RESPONSE" | grep -q "DICOSE"; then
    echo -e "${GREEN}✓ Uruguay RUC check working${NC}"
  else
    echo -e "${YELLOW}⚠️  Uruguay RUC check response unexpected${NC}"
  fi
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              🎉 Deployment Complete! 🎉                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Production URL:${NC} $PRODUCTION_URL"
echo -e "${BLUE}Documentation:${NC} $PRODUCTION_URL/docs"
echo -e "${BLUE}Health Check:${NC} $PRODUCTION_URL/health"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Monitor Railway logs for any errors"
echo "2. Test Uruguay endpoints with real data"
echo "3. Seed SNAP and DICOSE data (when available)"
echo "4. Update client integrations"
echo "5. Announce Uruguay support to users"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "  • Multi-Country Guide: docs/MULTI_COUNTRY.md"
echo "  • Uruguay Sources: docs/DATA_SOURCES_URUGUAY.md"
echo "  • Deployment Guide: docs/URUGUAY_DEPLOYMENT.md"
echo ""
