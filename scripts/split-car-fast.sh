#!/bin/bash
# Fast CAR file splitter using jq (10-100x faster than Node.js)
#
# Usage: ./scripts/split-car-fast.sh BA GO MG PR RS SC SP
# Or: npm run split:car:fast -- BA GO MG

set -e

CHUNK_SIZE=${CHUNK_SIZE:-50000}
DATA_DIR="./data"

if [ $# -eq 0 ]; then
  echo "Usage: $0 STATE1 [STATE2 ...]"
  echo "Example: $0 BA SP MG"
  exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo "❌ Error: jq is not installed"
  echo "Install with: brew install jq"
  exit 1
fi

echo "🚀 Fast CAR splitter (using jq)"
echo "Chunk size: $(printf "%'d" $CHUNK_SIZE) features per file"
echo ""

for STATE in "$@"; do
  STATE_UPPER=$(echo "$STATE" | tr '[:lower:]' '[:upper:]')
  STATE_LOWER=$(echo "$STATE" | tr '[:upper:]' '[:lower:]')

  INPUT_FILE="$DATA_DIR/car_${STATE_LOWER}.json"

  if [ ! -f "$INPUT_FILE" ]; then
    echo "❌ $STATE_UPPER: File not found - $INPUT_FILE"
    continue
  fi

  FILE_SIZE=$(du -h "$INPUT_FILE" | cut -f1)
  echo "📦 Splitting $STATE_UPPER ($INPUT_FILE - $FILE_SIZE)..."

  # Extract features array and count
  echo "  📊 Counting features..."
  TOTAL_FEATURES=$(jq '.features | length' "$INPUT_FILE")
  echo "  ✅ Found $(printf "%'d" $TOTAL_FEATURES) features"

  # Calculate number of chunks
  CHUNKS=$(( ($TOTAL_FEATURES + $CHUNK_SIZE - 1) / $CHUNK_SIZE ))
  echo "  📂 Creating $CHUNKS chunks..."

  # Split into chunks
  CHUNK_NUM=1
  for ((i=0; i<$TOTAL_FEATURES; i+=$CHUNK_SIZE)); do
    OUTPUT_FILE="$DATA_DIR/car_${STATE_LOWER}_chunk${CHUNK_NUM}.json"

    END=$((i + $CHUNK_SIZE))
    if [ $END -gt $TOTAL_FEATURES ]; then
      END=$TOTAL_FEATURES
    fi

    CHUNK_FEATURES=$((END - i))

    echo -n "  ⏳ Chunk $CHUNK_NUM/$CHUNKS ($CHUNK_FEATURES features)... "

    # Extract slice and wrap in FeatureCollection
    jq "{
      type: \"FeatureCollection\",
      features: .features[$i:$END]
    }" "$INPUT_FILE" > "$OUTPUT_FILE"

    CHUNK_SIZE_MB=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo "✅ ($CHUNK_SIZE_MB)"

    CHUNK_NUM=$((CHUNK_NUM + 1))
  done

  echo "  ✨ $STATE_UPPER split into $CHUNKS chunks ($(printf "%'d" $TOTAL_FEATURES) features)"
  echo ""
done

echo "═══════════════════════════════════════════"
echo "✅ All files split successfully!"
echo ""
echo "Next step:"
echo "  npm run seed:car-v2"
echo "═══════════════════════════════════════════"
