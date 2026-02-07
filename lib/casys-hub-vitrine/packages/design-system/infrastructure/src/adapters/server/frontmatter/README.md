# Frontmatter Adapters

## Objet

Générer et appliquer le frontmatter selon la cible (Astro/Hugo) à partir d’un modèle canonique.

## Fichiers clés

- `canonical-builder.ts` — construit le frontmatter canonique (règles de validation, tags requis, etc.)
- `astro-frontmatter.adapter.ts` — rendu pour Astro
- `hugo-frontmatter.adapter.ts` — rendu pour Hugo
- `profile-applier.ts` — applique des profils frontmatter
- `profile-registry.ts` — registre des profils

## Règles et $ref

- Lorsqu’un champ utilise `$ref` vers un canonique (ex: `excerpt`, `tags`), la sortie correspondante est dédupliquée/écrasée (fail-fast si incohérence).

## Tests

- Voir `__tests__/` pour la sérialisation YAML et l’application de profils.

## Bonnes pratiques

- Config-driven via blueprints.
- Pas de fallback implicite; les erreurs sont explicites et précises.
