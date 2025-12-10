# Story: Self-Host Dashboard with Caddy SSL

## Overview

Configure self-hosted deployment of Fresh dashboard and MCP Gateway API with automatic SSL via Caddy
reverse proxy.

## Goals

- Deploy dashboard on `dashboard.casys.ai` (or configurable subdomain)
- Deploy API on `api.casys.ai` (or configurable subdomain)
- Automatic SSL certificate provisioning via Let's Encrypt
- Process management with systemd for auto-restart
- Single server deployment (dashboard + API)

## Acceptance Criteria

### AC1: Caddy Installation & Configuration

- [ ] Install Caddy on Ubuntu server
- [ ] Create Caddyfile with reverse proxy config for both services
- [ ] Configure automatic HTTPS with Let's Encrypt

### AC2: Systemd Services

- [ ] Create `casys-dashboard.service` for Fresh production server
- [ ] Create `casys-api.service` for MCP Gateway
- [ ] Enable auto-start on boot
- [ ] Configure restart on failure

### AC3: Environment Configuration

- [ ] Create `.env.production` with production settings
- [ ] Configure `API_BASE` to point to `https://api.casys.ai`
- [ ] Set appropriate ports (dashboard: 8080, API: 3001)

### AC4: Build & Deploy Script

- [ ] Create `scripts/deploy.sh` for one-command deployment
- [ ] Include build step, service restart, health checks

### AC5: DNS Configuration (Manual)

- [ ] Document DNS A record setup for subdomains
- [ ] Point `dashboard.casys.ai` and `api.casys.ai` to server IP

## Technical Details

### Caddyfile

```
dashboard.casys.ai {
    reverse_proxy localhost:8080
}

api.casys.ai {
    reverse_proxy localhost:3001

    # CORS headers for dashboard
    header Access-Control-Allow-Origin https://dashboard.casys.ai
    header Access-Control-Allow-Methods "GET, POST, OPTIONS"
    header Access-Control-Allow-Headers "Content-Type"
}
```

### Systemd Service (casys-dashboard.service)

```ini
[Unit]
Description=Casys Dashboard (Fresh)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/CascadeProjects/Casys Intelligence
ExecStart=/home/ubuntu/.deno/bin/deno task fresh:start
Restart=on-failure
RestartSec=5
Environment=API_BASE=https://api.casys.ai

[Install]
WantedBy=multi-user.target
```

### Systemd Service (casys-api.service)

```ini
[Unit]
Description=Casys MCP Gateway API
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/CascadeProjects/Casys Intelligence
ExecStart=/home/ubuntu/.deno/bin/deno task serve:playground
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Deploy Script (scripts/deploy.sh)

```bash
#!/bin/bash
set -e

echo "Building Fresh dashboard..."
deno task fresh:build

echo "Restarting services..."
sudo systemctl restart casys-dashboard
sudo systemctl restart casys-api

echo "Checking health..."
sleep 3
curl -s -o /dev/null -w "Dashboard: %{http_code}\n" http://localhost:8080/dashboard
curl -s -o /dev/null -w "API: %{http_code}\n" http://localhost:3001/health

echo "Deploy complete!"
```

## Prerequisites

- Ubuntu server with public IP
- Domain with DNS access (casys.ai)
- Deno installed
- Ports 80/443 open for Caddy

## Out of Scope

- Docker containerization
- Load balancing / multiple instances
- Database backups
- Monitoring / alerting

## Estimation

- Setup: ~30 minutes
- Testing: ~15 minutes

## Dependencies

- Story 6.4 (Dashboard) - completed
- Fresh production build working
