#!/bin/bash
# Simple script to serve the Santorini web UI locally

PORT=${1:-5174}

echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                 Ascent Demo - Vite Dev Server                 ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Starting Vite on port $PORT..."
echo ""
echo "📦 Installing dependencies if needed..."
npm --prefix web install >/dev/null 2>&1
echo "🚀 Launching dev server"
npm --prefix web run dev -- --host --port "$PORT"
