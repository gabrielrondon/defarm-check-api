#!/bin/bash
#
# Script para rodar seed de produção no Railway
# Uso: ./seed-production-railway.sh
#

set -e

echo "🚀 Seed de Produção - Railway"
echo ""

# Verificar se railway CLI está instalado
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI não encontrado!"
    echo "Instale com: npm install -g @railway/cli"
    exit 1
fi

# Verificar login
echo "👤 Verificando autenticação..."
railway whoami || {
    echo "❌ Não está logado no Railway!"
    echo "Faça login com: railway login"
    exit 1
}

echo ""
echo "🔗 Linkando projeto..."
echo "   Projeto: checker"
echo "   Ambiente: production"
echo ""
echo "Por favor, selecione:"
echo "  - Projeto: checker"
echo "  - Ambiente: production"
echo ""

# Link interativo
railway link

echo ""
echo "✅ Projeto linkado!"
echo ""
echo "🌱 Rodando seeds..."
echo ""

# Rodar seed
railway run npm run seed:all-production

echo ""
echo "✅ Seed concluído!"
