# Casys PML Cloud - Production

## Deployment

| Script | Description |
|--------|-------------|
| `deno task deploy:all` | Full deploy: git pull, vite build, restart services |
| `deno task prod:restart` | Restart services without rebuild |
| `deno task prod:logs` | Stream logs from both services |
| `deno task prod:status` | Check service status |

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
