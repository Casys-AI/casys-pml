# Extractors

## Objet

Extraction de métadonnées et composants techniques depuis des sources (MDX/AST/etc.). Sert à alimenter le domaine (ex: `ComponentUsage`).

## Fichier clé

- `component-extractor.ts` — extrait les placeholders/occurrences de composants.

## Règles DDD

- Le mapping final respecte le domaine: `ComponentUsage` référence `textFragmentId` (et non `sectionId`).

## Tests

- Ajouter des tests ciblés si vous enrichissez les heuristiques d’extraction.
