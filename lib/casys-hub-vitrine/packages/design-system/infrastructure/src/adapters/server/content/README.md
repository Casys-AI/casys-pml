# Content Extraction System

## Objet

Système intelligent d'extraction de contenu web utilisant :
- Multiple stratégies d'extraction (Direct Scraping, Jina Reader API, etc.)
- Agent IA pour qualification et nettoyage du contenu
- Architecture LangChain avec pattern Agent/Adapter

## Architecture

### Agents (dans `ai/agents/`)
- `content-extraction.agent.ts` - Agent LangChain principal
- `content-extraction.factory.ts` - Factory pour création simplifiée

### Stratégies (dans `strategies/`)
- `direct-scraping.strategy.ts` - Scraping classique (Mozilla Readability)
- `jina-reader.strategy.ts` - API Jina Reader (extraction spécialisée)
- `types.ts` - Interfaces communes

### Adapters
- `content-extraction.adapter.ts` - Pont entre agent et port métier

## Configuration

Variables d'environnement optionnelles :
- `JINA_API_KEY` - Active l'extraction via Jina Reader
- `FIRECRAWL_API_KEY` - Pour futures intégrations Firecrawl

## Flow

1. **Multi-Strategy Extraction** : Essaie plusieurs stratégies par priorité
2. **AI Qualification** : L'IA nettoie, structure et qualifie le contenu
3. **Caching Intelligent** : Cache les résultats qualifiés
4. **Fallback Robuste** : Dégradation gracieuse en cas d'échec

## Notes d'archi

- Agent LangChain avec pattern `_call(input: string): Promise<string>`
- Stratégies pluggables avec interface commune
- Post-processing IA systematique pour qualité
- Cache par URL pour performance
- Respecte fail-fast avec fallbacks
