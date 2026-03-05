---
name: vault-exec-deno
description: Guide d’utilisation de vault-exec en mode Deno (sans binaire vx). Utiliser pour valider un vault markdown, visualiser le DAG, exécuter des targets avec runtime inputs, et gérer init/watch/sync.
---

# Vault Exec — utilisation (Deno)

Se placer dans le repo :

```bash
cd /home/ubuntu/CascadeProjects/AgentCards/lib/vault-exec
```

## Point clé

Le binaire `vx` n’est pas garanti dans le PATH. Utiliser Deno explicitement :

```bash
~/.deno/bin/deno task cli ...
```

## Workflow rapide

```bash
~/.deno/bin/deno task cli validate <vault-path>
~/.deno/bin/deno task cli graph <vault-path>
~/.deno/bin/deno task cli run <vault-path> --target "<Target Note>" --dry
~/.deno/bin/deno task cli run <vault-path> --target "<Target Note>" --inputs '{"days_threshold":7}'
```

## Commandes utiles

- Validation
  - `~/.deno/bin/deno task cli validate <vault-path>`
- Graphe / ordre d’exécution
  - `~/.deno/bin/deno task cli graph <vault-path>`
- Exécution ciblée
  - `~/.deno/bin/deno task cli run <vault-path> --target "<Target Note>"`
- Prévisualisation + schema inputs
  - `~/.deno/bin/deno task cli run <vault-path> --target "<Target Note>" --dry`
- Inputs via fichier JSON
  - `~/.deno/bin/deno task cli run <vault-path> --target "<Target Note>" --inputs @inputs.json`
- Intent routing (GRU)
  - `~/.deno/bin/deno task cli run <vault-path> --intent "..."`
  - auto-select : ajouter `--no-confirm`
- Initialisation apprentissage
  - `~/.deno/bin/deno task cli init <vault-path>`
- Compilation des notes
  - `~/.deno/bin/deno task cli compile <vault-path>` (nécessite `OPENAI_API_KEY`)
- Service
  - `~/.deno/bin/deno task cli watch start <vault-path>`
  - `~/.deno/bin/deno task cli watch status <vault-path>`
  - `~/.deno/bin/deno task cli watch stop <vault-path>`
  - `~/.deno/bin/deno task cli sync <vault-path>`

## Dépannage

- `deno: command not found` → utiliser `~/.deno/bin/deno`
- Erreur runtime inputs → relancer en `--dry` et suivre le schema affiché
- Pas de poids GRU → lancer `init` avant les runs par intent
