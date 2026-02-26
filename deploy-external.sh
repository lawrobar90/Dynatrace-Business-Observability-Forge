#!/bin/bash

# BizObs Deployment Script
# Deploys BizObs app to EC2 with external ingress access
# URL: http://bizobs.c469ba93-51c8-40eb-979d-1c9075a148a0.dynatrace.training/

set -e

echo "🚀 BizObs External Deployment Script"
echo "======================================"

cd /home/dt_training/Partner-PowerUp-BizObs-App

# Ensure ingress is deployed
echo "📡 Applying ingress configuration..."
kubectl apply -f k8s/bizobs-ingress.yaml

# Check if BizObs is already running
if lsof -i:8080 -sTCP:LISTEN -t >/dev/null ; then
    echo "✅ BizObs app is already running on port 8080"
else
    echo "🚀 Starting BizObs app..."
    # Clean up any stale processes
    pkill -f "node server.js" || true
    sleep 2
    
    # Start the app in background
    nohup node --require ./otel.cjs server.js > logs/bizobs.log 2>&1 &
    SERVER_PID=$!
    echo "📝 BizObs started with PID: $SERVER_PID"
    
    # Wait for startup
    sleep 5
    
    # Verify it's running
    if curl -s http://localhost:8080/health > /dev/null; then
        echo "✅ BizObs app is running and healthy"
    else
        echo "❌ BizObs app failed to start properly"
        exit 1
    fi
fi

# Verify ingress is working
echo "🔍 Testing ingress connectivity..."
if kubectl get ingress bizobs-ingress > /dev/null 2>&1; then
    echo "✅ Ingress is deployed"
    
    # Test connectivity through ingress
    if curl -s -H "Host: bizobs.c469ba93-51c8-40eb-979d-1c9075a148a0.dynatrace.training" http://localhost/health > /dev/null; then
        echo "✅ Ingress routing is working"
    else
        echo "⚠️  Ingress routing may not be working properly"
    fi
else
    echo "❌ Ingress deployment failed"
    exit 1
fi

echo ""
echo "🎉 BizObs Deployment Complete!"
echo "=============================="
echo "🌐 External URL: http://bizobs.c469ba93-51c8-40eb-979d-1c9075a148a0.dynatrace.training/"
echo "🏠 Local URL: http://localhost:8080/"
echo ""
echo "📊 Available Endpoints:"
echo "  • Main UI: http://bizobs.c469ba93-51c8-40eb-979d-1c9075a148a0.dynatrace.training/"
echo "  • Health Check: http://bizobs.c469ba93-51c8-40eb-979d-1c9075a148a0.dynatrace.training/health"
echo "  • Admin Status: http://bizobs.c469ba93-51c8-40eb-979d-1c9075a148a0.dynatrace.training/api/admin/services/status"
echo ""
echo "🎭 Demo Features Available:"
echo "  • Customer Journey Simulation"
echo "  • Multi-persona Load Generation" 
echo "  • Dynatrace Metadata Injection"
echo "  • Real-time Observability Metrics"
echo ""