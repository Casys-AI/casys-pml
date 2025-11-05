# AgentCards - Guide de Test

Guide complet pour tester AgentCards en développement et en production.

## 🧪 Tests Automatisés

### Exécuter tous les tests
```bash
deno task test              # Tous les tests (unit + integration)
deno task test:unit         # Tests unitaires seulement
deno task test:integration  # Tests d'intégration (sans E2E)
deno task test:e2e          # Tests end-to-end (crée fichiers, télécharge model)
deno task check             # Type checking TypeScript
deno task lint              # Linting
```

### Tests avec Mock MCP Servers

```bash
# Dry-run avec 3 mock servers
deno task cli:init:dry:mocks

# Test E2E complet (parallélisation, extraction, embeddings)
deno task test:e2e
```

**Mock servers disponibles:**
- `filesystem-mock` - 3 tools, rapide
- `database-mock` - 4 tools, lent (100ms) pour tester parallélisation
- `api-mock` - 3 tools, moyen (50ms), schemas complexes

**Total:** 10 tools extraits en parallèle

## 🎮 Test du CLI

### 1. Via Deno Tasks (Recommandé)

```bash
# Afficher l'aide de la commande init
deno task cli:init:help

# Test dry-run avec fixture
deno task cli:init:dry

# Commande personnalisée
deno task cli init --dry-run --config /path/to/your/mcp.json
```

### 2. Via Deno Run (Direct)

```bash
# Dry-run avec auto-détection (cherche claude_desktop_config.json)
deno run --allow-all src/main.ts init --dry-run

# Dry-run avec config custom
deno run --allow-all src/main.ts init --dry-run --config /path/to/config.json

# Migration réelle (crée ~/.agentcards/)
deno run --allow-all src/main.ts init --config /path/to/config.json
```

## 🚀 Test End-to-End Complet

### Prérequis

Pour tester la migration complète, tu as besoin de:
- Un fichier `claude_desktop_config.json` (ou utilise le fixture)
- Des MCP servers installés (optionnel pour dry-run)

### Scénario 1: Dry-run avec Fixture

Le plus simple pour tester sans rien installer:

```bash
# Preview ce qui serait migré
deno task cli:init:dry
```

**Résultat attendu:**
```
🔍 DRY RUN - No changes will be made

📊 Migration Preview:
  MCP Config: tests/fixtures/mcp-config-sample.json
  Servers to migrate: 3

  Servers:
    - filesystem (npx)
    - github (mcp-server-github)
    - memory (mcp-server-memory)

  AgentCards config will be created at:
    ~/.agentcards/config.yaml
```

### Scénario 2: Migration avec Config Réel

Si tu as Claude Desktop installé:

```bash
# 1. Vérifier que le config existe
ls -la ~/.config/Claude/claude_desktop_config.json  # Linux
ls -la ~/Library/Application\ Support/Claude/claude_desktop_config.json  # macOS

# 2. Preview la migration
deno run --allow-all src/main.ts init --dry-run

# 3. Exécuter la migration (crée ~/.agentcards/)
deno run --allow-all src/main.ts init
```

**Résultat attendu:**
1. Création de `~/.agentcards/config.yaml`
2. Découverte des MCP servers
3. Extraction des schemas
4. Génération des embeddings
5. Affichage du template pour nouveau `claude_desktop_config.json`

### Scénario 3: Test avec Config Custom

Pour tester avec ton propre config:

```bash
# 1. Créer un test config
cat > /tmp/test-mcp.json << 'EOF'
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["server.js"],
      "protocol": "stdio"
    }
  }
}
EOF

# 2. Test dry-run
deno run --allow-all src/main.ts init --dry-run --config /tmp/test-mcp.json

# 3. Migration (si tu veux vraiment tester)
deno run --allow-all src/main.ts init --config /tmp/test-mcp.json
```

## 🔍 Vérification Post-Migration

Après une migration réelle (pas dry-run):

```bash
# Vérifier que la config a été créée
ls -la ~/.agentcards/
cat ~/.agentcards/config.yaml

# Vérifier la base de données
ls -la ~/.agentcards/.agentcards.db

# Vérifier les logs (si activés)
tail -f ~/.agentcards/logs/*.log
```

## 🐛 Debug et Troubleshooting

### Mode Verbose

```bash
# Avec logs détaillés (TODO: à implémenter)
DENO_LOG=debug deno run --allow-all src/main.ts init --dry-run
```

### Rollback Manuel

Si la migration échoue, le rollback automatique devrait nettoyer, mais tu peux aussi:

```bash
# Supprimer manuellement
rm -rf ~/.agentcards/
```

### Problèmes Courants

**1. "MCP config file not found"**
```bash
# Vérifier le path
deno run --allow-all src/main.ts init --dry-run --config tests/fixtures/mcp-config-sample.json
```

**2. "Cannot connect to database"**
```bash
# Permissions
chmod -R 755 ~/.agentcards/
```

**3. "Model download failed"**
```bash
# Première exécution télécharge ~400MB
# Attendre et réessayer
```

**4. "E2E tests fail with Permission denied" (Snap Deno only)**
```bash
# Known limitation: Snap Deno cannot spawn other snap processes due to AppArmor
# Workaround: Use native Deno installation for E2E tests
# Or: Test only dry-run and unit tests which work fine
```

## 📊 Test de Performance

### Benchmarks

```bash
deno task bench              # Exécuter les benchmarks
```

### Mesurer le temps de migration

```bash
time deno run --allow-all src/main.ts init --dry-run
```

## 🎯 Checklist de Tests Avant Release

- [ ] Tous les tests automatisés passent (`deno task test`)
- [ ] Type checking OK (`deno task check`)
- [ ] Linting OK (`deno task lint`)
- [ ] Dry-run avec fixture fonctionne
- [ ] Dry-run avec vrai config fonctionne
- [ ] Migration complète testée (avec backup!)
- [ ] Rollback testé en cas d'erreur
- [ ] Documentation à jour
- [ ] Build compile sans erreur (`deno task build`)

## 🎓 Pour Aller Plus Loin

### Test avec Mock MCP Servers

Pour tester l'extraction de schemas sans vrais servers:

```bash
# TODO: Créer des mock servers dans tests/mocks/
```

### Test de Charge

Pour tester avec beaucoup de servers:

```bash
# TODO: Script pour générer un gros config
```

## 📝 Notes

- **Dry-run:** Mode sûr, rien n'est modifié sur le disque
- **Migration réelle:** Crée `~/.agentcards/` avec config, DB, et embeddings
- **Rollback:** Automatique en cas d'erreur, supprime `~/.agentcards/`
- **OS Support:** macOS, Linux, Windows (paths auto-détectés)
