# Persistence (serveur)

## Objet

Couche de persistance Infrastructure:

- Base graphe (Kùzu) pour structure d’articles, embeddings, composants, relations
- Repositories fichiers (MDX)

## Sous-dossiers

- `graph/` — Kùzu, requêtes, recherche sémantique, indexation (README dédié)
- `repositories/` — persistance MDX (repository + writer)

## Règles

- Singleton `KuzuConnection` (éviter ré-initialisations)
- Préférer requêtes directes stables (cf. limitations prepared statements)
- Filtrer par `tenant/project` quand applicable

## Tests

- Voir `graph/__tests__` et `repositories/__tests__` (Vitest). DB Kùzu éphémère en test.
