#!/bin/bash
# Simple script to serve the Santorini web UI locally

PORT=${1:-8000}

echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                Santorini (no gods) — AlphaZero Web UI                      ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Starting web server on port $PORT..."
echo ""
echo "📂 Open your browser to:"
echo "   🏛️  Santorini: http://localhost:$PORT/santorini.html"
echo ""
echo "⚠️  First load takes 10-20 seconds (downloading AI)"
echo "✨ After that, it's instant!"
echo ""
echo "Press Ctrl+C to stop"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""

python3 -m http.server $PORT
