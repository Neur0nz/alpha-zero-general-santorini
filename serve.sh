#!/bin/bash
# Simple script to serve the web UI locally

PORT=${1:-8000}

echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                    AlphaZero Board Games - Web UI                          ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Starting web server on port $PORT..."
echo ""
echo "📂 Open your browser to:"
echo "   🎮 Santorini (with gods): http://localhost:$PORT/santorini_with_gods.html"
echo "   🏛️  Santorini (classic):   http://localhost:$PORT/santorini.html"
echo "   💎 Splendor:              http://localhost:$PORT/splendor.html"
echo "   🗺️  Small World:           http://localhost:$PORT/smallworld.html"
echo "   🌟 All games:             http://localhost:$PORT/"
echo ""
echo "⚠️  First load takes 10-20 seconds (downloading AI)"
echo "✨ After that, it's instant!"
echo ""
echo "Press Ctrl+C to stop"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""

python3 -m http.server $PORT

