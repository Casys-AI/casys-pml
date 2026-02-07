# News / Topic Discovery

## Objet

Découverte de sujets et récupération d’articles via fournisseurs externes (NewsAPI, NewsData, WorldNews, RSS, Bing).

## Fichiers clés

- `newsapi-article-fetcher.adapter.ts`
- `newsdata-article-fetcher.adapter.ts`
- `worldnews-article-fetcher.adapter.ts`
- `rss-article-fetcher.adapter.ts`
- `bing-search-adapter.ts`
- `tenant-aware-topic-discovery.ts`, `topic-discovery-factory.ts`

## Ports

- `TopicDiscoveryPort`, `ArticleFetcherPort`

## Langue

- La langue vient de l’input utilisateur (use case). Un fallback `'en'` existe côté adaptateurs si absent.

## Tests

- Voir `__tests__/` (contract/integration tests prioritaires).
