#!/bin/bash
# Script to seed production database on Railway from local environment

set -e

echo "🌱 Seeding Production Database on Railway..."
echo ""

# Check if DATABASE_URL is set
if [ -z "$RAILWAY_DATABASE_URL" ]; then
  echo "❌ Error: RAILWAY_DATABASE_URL not set"
  echo ""
  echo "Usage:"
  echo "  export RAILWAY_DATABASE_URL='postgresql://postgres:YOUR_PASSWORD@postgis.railway.internal:5432/railway'"
  echo "  ./scripts/seed-production.sh"
  exit 1
fi

echo "📊 Using database: ${RAILWAY_DATABASE_URL:0:30}..."
echo ""

# Temporarily set DATABASE_URL to production
export DATABASE_URL=$RAILWAY_DATABASE_URL

echo "1️⃣  Seeding PRODES sample data..."
npm run data:prodes
echo "✅ PRODES data seeded"
echo ""

echo "2️⃣  Seeding Lista Suja (MTE)..."
if [ ! -f "data/lista_suja.json" ]; then
  echo "   Downloading Lista Suja..."
  npm run data:lista-suja
fi
echo "✅ Lista Suja ready"
echo ""

echo "3️⃣  Seeding IBAMA Embargoes..."
if [ ! -f "data/ibama_embargos.json" ]; then
  echo "   Downloading IBAMA data..."
  npm run data:ibama
fi
echo "✅ IBAMA data ready"
echo ""

echo "🎉 Production database seeded successfully!"
echo ""
echo "Test it:"
echo "  curl https://defarm-check-api-production.up.railway.app/health"
