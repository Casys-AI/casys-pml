# Configuration de la synchronisation vers le repo public

## Prérequis

Le workflow `sync-to-public.yml` synchronise automatiquement le code Core vers `Casys-AI/casys-pml` (public).

## Configuration des secrets GitHub

### 1. Générer une clé SSH de déploiement

```bash
# Générer une nouvelle clé SSH (sans passphrase)
ssh-keygen -t ed25519 -C "sync-to-public" -f sync-deploy-key -N ""
```

### 2. Ajouter la clé publique au repo PUBLIC

1. Aller sur https://github.com/Casys-AI/casys-pml/settings/keys
2. Cliquer "Add deploy key"
3. Nom: `sync-from-private`
4. Coller le contenu de `sync-deploy-key.pub`
5. **Cocher "Allow write access"** ⚠️ Important
6. Sauvegarder

### 3. Ajouter la clé privée au repo PRIVÉ

1. Aller sur https://github.com/Casys-AI/casys-pml-cloud/settings/secrets/actions
2. Cliquer "New repository secret"
3. Nom: `PUBLIC_REPO_DEPLOY_KEY`
4. Coller le contenu de `sync-deploy-key` (clé privée)
5. Sauvegarder

### 4. Supprimer les fichiers de clé locaux

```bash
rm sync-deploy-key sync-deploy-key.pub
```

## Fichiers exclus de la synchronisation

Le workflow exclut automatiquement :
- `src/cloud/` - Code propriétaire cloud-only
- `packages/mcp-connector/` - Package client premium
- `.github/workflows/sync-to-public.yml` - Ce workflow lui-même
- `.env`, `.env.*`, `.dev.vars` - Variables d'environnement
- `secrets/` - Secrets locaux
- `*.local` - Fichiers locaux

## Test manuel

Pour tester la synchronisation manuellement :
1. Aller sur Actions dans le repo privé
2. Sélectionner "Sync to Public Repo"
3. Cliquer "Run workflow"

## Troubleshooting

### "Permission denied (publickey)"
→ Vérifier que la clé publique est bien ajoutée au repo public avec write access

### "Nothing to commit"
→ Normal si aucun fichier Core n'a changé depuis le dernier sync
