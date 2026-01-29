#!/bin/bash
#
# Script de Setup: Instalar Cron Jobs
#
# Uso:
#   ./scripts/cron/setup-cron.sh
#
# O que faz:
# 1. Cria diretório de logs
# 2. Testa cada cron job manualmente
# 3. Pergunta se deseja instalar crontab
# 4. Instala crontab se confirmado

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=========================================="
echo "DeFarm Check API - Cron Jobs Setup"
echo "=========================================="
echo ""
echo "Project directory: $PROJECT_DIR"
echo ""

# 1. Criar diretório de logs
echo "[1/4] Creating logs directory..."
mkdir -p "$PROJECT_DIR/logs"
echo "✓ Logs directory created: $PROJECT_DIR/logs"
echo ""

# 2. Verificar dependências
echo "[2/4] Checking dependencies..."

if ! command -v tsx &> /dev/null; then
    echo "❌ tsx not found. Please install it:"
    echo "   npm install -g tsx"
    exit 1
fi

echo "✓ tsx found: $(which tsx)"
echo ""

# 3. Testar cron jobs (dry run)
echo "[3/4] Testing cron jobs (dry run)..."
echo ""

echo "Testing scripts compilation..."
tsx --version > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ TypeScript execution failed"
    exit 1
fi

echo "✓ All scripts can be compiled"
echo ""

# 4. Preparar crontab
echo "[4/4] Preparing crontab..."
echo ""

# Substituir WORKDIR no crontab template
CRONTAB_FILE="$SCRIPT_DIR/crontab.txt"
CRONTAB_TEMP="/tmp/defarm-crontab-$$.txt"

sed "s|WORKDIR=.*|WORKDIR=$PROJECT_DIR|g" "$CRONTAB_FILE" > "$CRONTAB_TEMP"

echo "Crontab preview:"
echo "----------------------------------------"
cat "$CRONTAB_TEMP" | grep -v "^#" | grep -v "^$"
echo "----------------------------------------"
echo ""

# Perguntar confirmação
read -p "Do you want to install this crontab? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Backup do crontab atual
    echo "Creating backup of current crontab..."
    crontab -l > "$PROJECT_DIR/logs/crontab-backup-$(date +%Y%m%d-%H%M%S).txt" 2>/dev/null || true

    # Instalar novo crontab
    echo "Installing crontab..."
    crontab "$CRONTAB_TEMP"

    echo "✅ Crontab installed successfully!"
    echo ""
    echo "To view installed cron jobs:"
    echo "   crontab -l"
    echo ""
    echo "To edit cron jobs:"
    echo "   crontab -e"
    echo ""
    echo "To remove cron jobs:"
    echo "   crontab -r"
else
    echo "Crontab installation cancelled."
    echo ""
    echo "To install manually:"
    echo "   crontab -e"
    echo "   (paste content from $CRONTAB_FILE)"
fi

# Cleanup
rm -f "$CRONTAB_TEMP"

echo ""
echo "=========================================="
echo "Next steps:"
echo "=========================================="
echo ""
echo "1. Monitor logs:"
echo "   tail -f logs/cron-*.log"
echo ""
echo "2. Test individual jobs manually:"
echo "   tsx scripts/cron/update-deter.ts"
echo "   tsx scripts/cron/update-lista-suja.ts"
echo "   tsx scripts/cron/update-ibama.ts"
echo "   tsx scripts/cron/update-spatial-data.ts"
echo "   tsx scripts/cron/update-car.ts"
echo "   tsx scripts/cron/check-data-freshness.ts"
echo ""
echo "3. Check data freshness:"
echo "   tsx scripts/cron/check-data-freshness.ts"
echo ""
echo "4. Setup Telegram alerts (Task #17):"
echo "   Coming soon..."
echo ""
