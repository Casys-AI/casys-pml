#!/bin/bash
set -e

PROJECT_DIR="/home/ubuntu/CascadeProjects/AgentCards"
cd "$PROJECT_DIR"

echo "=== Casys Deployment ==="
echo ""

# Build Fresh dashboard
echo "[1/4] Building Fresh dashboard..."
cd src/web
deno task fresh:build 2>&1 || {
    echo "ERROR: Fresh build failed"
    exit 1
}
cd "$PROJECT_DIR"
echo "       Build complete!"

# Reload systemd daemon
echo "[2/4] Reloading systemd..."
sudo systemctl daemon-reload

# Restart services
echo "[3/4] Restarting services..."
sudo systemctl restart casys-dashboard
sudo systemctl restart casys-api
sudo systemctl reload caddy

# Health checks
echo "[4/4] Running health checks..."
sleep 3

DASHBOARD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/dashboard 2>/dev/null || echo "000")
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null || echo "000")

echo ""
echo "=== Health Check Results ==="
if [ "$DASHBOARD_STATUS" = "200" ]; then
    echo "Dashboard: OK (HTTP $DASHBOARD_STATUS)"
else
    echo "Dashboard: FAIL (HTTP $DASHBOARD_STATUS)"
fi

if [ "$API_STATUS" = "200" ]; then
    echo "API:       OK (HTTP $API_STATUS)"
else
    echo "API:       FAIL (HTTP $API_STATUS)"
fi

echo ""
echo "=== Service Status ==="
sudo systemctl is-active casys-dashboard && echo "casys-dashboard: running" || echo "casys-dashboard: stopped"
sudo systemctl is-active casys-api && echo "casys-api: running" || echo "casys-api: stopped"
sudo systemctl is-active caddy && echo "caddy: running" || echo "caddy: stopped"

echo ""
echo "Deploy complete!"
echo ""
echo "URLs (after DNS setup):"
echo "  Dashboard: https://intelligence.casys.ai"
echo "  API:       https://intelligence.casys.ai/api"
