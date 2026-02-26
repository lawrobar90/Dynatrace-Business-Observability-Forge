#!/bin/bash

# Quick Deploy Script for BizObs AppEngine App
# This script builds and deploys the AppEngine app to Dynatrace

set -e

echo "🚀 BizObs AppEngine Deployment"
echo "=============================="

# Check if tenant URL is provided
if [ -z "$1" ]; then
  echo "❌ Error: Tenant URL required"
  echo "Usage: ./deploy-appengine.sh <tenant-url>"
  echo "Example: ./deploy-appengine.sh https://YOUR_TENANT_ID.apps.dynatracelabs.com"
  exit 1
fi

TENANT_URL="$1"
APP_DIR="app"

echo "📍 Target tenant: $TENANT_URL"
echo "📁 App directory: $APP_DIR"

# Navigate to app directory
cd "$APP_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Build the app
echo "🔨 Building app..."
npm run build

# Deploy to Dynatrace
echo "🚀 Deploying to Dynatrace..."
npx dt-app deploy --tenant-url="$TENANT_URL"

echo "✅ Deployment complete!"
echo ""
echo "🌐 Your app should now be available in the Dynatrace Apps menu"
echo ""
echo "Next steps:"
echo "1. Open Dynatrace UI"
echo "2. Navigate to Apps > BizObs Generator"
echo "3. Verify connection to external server (http://YOUR_SERVER_IP:8080)"
