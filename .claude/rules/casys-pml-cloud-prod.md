# Casys PML Cloud - Production

## Deployment

**IMPORTANT**: Production scripts have been removed from deno.json for safety.
Use direct systemctl commands ON THE PRODUCTION SERVER ONLY:

```bash
# Status
sudo systemctl status casys-dashboard casys-api

# Logs
journalctl -u casys-api -u casys-dashboard -f

# Restart (NEVER without explicit user approval)
sudo systemctl restart casys-dashboard casys-api

# Full deploy
git pull origin main && cd src/web && vite build && sudo systemctl restart casys-dashboard casys-api
```

## Services

- `casys-dashboard` - Fresh SSR frontend (port 8081)
- `casys-api` - API server (port 3003)

## PML Package Release

1. Update `PACKAGE_VERSION` in `packages/pml/src/cli/shared/constants.ts`
2. Update `version` in `packages/pml/deno.json`
3. Commit and push
4. Create GitHub release: `gh release create vX.Y.Z --repo Casys-AI/casys-pml --title "PML vX.Y.Z" --notes "..."`
5. Wait for Release workflow to build binaries
6. Users upgrade with: `pml upgrade`
