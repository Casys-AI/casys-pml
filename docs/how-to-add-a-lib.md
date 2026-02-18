# How to Add a New lib/

Le monorepo `AgentCards` est la source de verite. Chaque `lib/` peut etre publiee sur un repo GitHub public + JSR via un pipeline automatise.

## Structure requise

```
lib/{name}/
  deno.json           # name, version, exports, publish, imports
  mod.ts              # Point d'entree public
  server.ts           # MCP server (si applicable)
  README.md           # Documentation pour le repo public
  LICENSE             # MIT
  .gitignore          # node_modules/, deno.lock, dist/
  .github/
    workflows/
      publish.yml     # Publie sur JSR quand le repo public recoit un push sur main
  src/
    ...
  tests/
    ...
  docs/               # Documentation interne (optionnel)
```

## Etape par etape

### 1. Creer la lib dans le monorepo

```bash
mkdir -p lib/{name}/src lib/{name}/tests lib/{name}/docs
```

### 2. deno.json

```json
{
  "name": "@casys/{name}",
  "version": "0.1.0",
  "exports": {
    ".": "./mod.ts"
  },
  "publish": {
    "include": ["mod.ts", "server.ts", "src/**/*.ts", "README.md", "LICENSE"],
    "exclude": ["**/*_test.ts", "**/*.test.ts", "**/*.bench.ts"]
  },
  "imports": {
    "@casys/mcp-server": "jsr:@casys/mcp-server"
  }
}
```

- `imports` : toujours pointer vers JSR/npm pour les deps publiees, PAS vers des chemins locaux (`../server/mod.ts`). Les chemins locaux cassent quand le code est copie vers le repo public.
- `publish.include` : lister explicitement ce qui part sur JSR.

### 3. LICENSE

MIT. Copier depuis une autre lib.

### 4. README.md

Documentation pour le repo public. C'est ce que les utilisateurs verront sur GitHub.

### 5. .gitignore

```
node_modules/
deno.lock
src/ui/dist/
```

### 6. publish.yml (dans la lib)

Ce workflow tourne dans le repo public (copie par le sync). Il publie sur JSR a chaque push sur main.

```yaml
name: Publish

on:
  push:
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v5
      - name: Publish package
        run: npx jsr publish
```

Placer dans `lib/{name}/.github/workflows/publish.yml`.

### 7. Creer le repo GitHub public

```bash
gh repo create Casys-AI/{name} --public --description "Description"
```

### 8. Workflow de sync (dans le monorepo)

Creer `.github/workflows/sync-{name}.yml` a la racine du monorepo. Ce workflow copie `lib/{name}/` vers le repo public a chaque push sur `main` qui touche ce dossier.

```yaml
name: Sync {Name}

on:
  push:
    branches: [main]
    paths:
      - "lib/{name}/**"
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout private repo
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Configure Git
        run: |
          git config --global user.name "GitHub Action"
          git config --global user.email "action@github.com"

      - name: Clone public repo
        run: |
          git clone https://x-access-token:${{ secrets.PUBLIC_REPO_PAT }}@github.com/Casys-AI/{name}.git {name}-repo
          cd {name}-repo
          git checkout main || git checkout -b main

      - name: Sync files
        run: |
          find {name}-repo -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
          cp -r lib/{name}/* {name}-repo/
          if [ -d "lib/{name}/.github" ]; then
            cp -r lib/{name}/.github {name}-repo/
          fi
          if [ -f "lib/{name}/.gitignore" ]; then
            cp lib/{name}/.gitignore {name}-repo/
          fi
          if [ -f "lib/{name}/LICENSE" ]; then
            cp lib/{name}/LICENSE {name}-repo/LICENSE
          else
            cp LICENSE {name}-repo/LICENSE
          fi

      - name: Commit and push
        run: |
          cd {name}-repo
          git add -A
          if git diff --staged --quiet; then
            echo "No changes to sync"
            exit 0
          fi
          COMMIT_MSG=$(git log -1 --format="%s" ${{ github.sha }} 2>/dev/null || echo "Sync from pml-cloud")
          git commit -m "$COMMIT_MSG" -m "Synced from pml-cloud"
          git push origin main

      - name: Create version tag if needed
        run: |
          cd {name}-repo
          VERSION=$(grep '"version"' deno.json | sed 's/.*"version": *"\([^"]*\)".*/\1/')
          TAG="v$VERSION"
          if git ls-remote --tags origin | grep -q "refs/tags/$TAG"; then
            echo "Tag $TAG already exists, skipping"
          else
            git tag "$TAG"
            git push origin "$TAG"
          fi
```

### 9. Secret requis

Le workflow de sync utilise `secrets.PUBLIC_REPO_PAT` — un Personal Access Token GitHub avec scope `repo` pour push vers les repos publics. Deja configure dans le monorepo.

## Pipeline complet

```
lib/{name}/ modifie
    |
    v
push sur main (monorepo)
    |
    v
sync-{name}.yml → copie vers Casys-AI/{name} (repo public)
    |
    v
publish.yml (dans le repo public) → publie sur JSR (@casys/{name})
```

## Libs existantes

| Lib | Repo public | JSR |
|-----|------------|-----|
| `lib/server` | `Casys-AI/mcp-server` | `@casys/mcp-server` |
| `lib/mcp-apps-bridge` | `Casys-AI/mcp-bridge` | `@casys/mcp-bridge` |
| `lib/shgat-tf` | `Casys-AI/shgat` | `@casys/shgat` |
| `lib/std` | `Casys-AI/mcp-std` | `@casys/mcp-std` |
| `lib/erpnext` | `Casys-AI/mcp-erpnext` | `@casys/mcp-erpnext` |

## Erreurs courantes

- **Import local dans deno.json** (`"../server/mod.ts"`) → casse dans le repo public. Toujours JSR.
- **Oublier publish.yml dans la lib** → le sync copie les fichiers mais rien ne publie sur JSR.
- **Oublier .gitignore** → `node_modules/` et `deno.lock` se retrouvent dans le repo public.
