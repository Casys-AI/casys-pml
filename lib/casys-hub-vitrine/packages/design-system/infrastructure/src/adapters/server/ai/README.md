# Adapters IA (serveur)

## Objet

Ces adaptateurs implémentent les ports d’IA de l’application (out-ports) pour:

- Texte (LLM)
- Embeddings
- Text-to-Speech (TTS)
- Génération d’images

Ils encapsulent les fournisseurs (ex: OpenAI) et appliquent nos règles Fail Fast (pas de fallback implicite) et config-driven.

## Ports implémentés

- AiTextModelPort (texte)
- EmbeddingModelPort (vecteurs)
- TtsPort (voix)
- ImageGeneratorPort (images)

Les ports sont définis côté Core/Application, et ces adaptateurs sont l’implémentation Infrastructure.

## Fichiers clés

- `openai.adapter.ts` — modèle texte
- `openai-embedding.adapter.ts` — embeddings
- `openai-tts.adapter.ts` — TTS
- `generic-image.adapter.ts` — génération d’images

## Configuration

- Clés API via variables d’environnement (ex: `OPENAI_API_KEY`).
- Les modèles et temps d’inférence sont pilotés par la config projet.
- Node 22 / TS 5.8.

## Tests

- Ajouter des tests unitaires sous `__tests__/` si besoin. La suite Vitest du package `@casys/infrastructure` couvre les intégrations.

## Bonnes pratiques

- Fail fast: validation stricte des inputs/outputs (format, MIME, base64 non vide, etc.).
- Pas de ré-essais silencieux; la stratégie de retry se fait au niveau application si nécessaire.
