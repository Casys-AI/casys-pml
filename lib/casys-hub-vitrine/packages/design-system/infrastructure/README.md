# Infrastructure

Implémentations concrètes des ports (DB, API, providers externes, etc.)

- Ne contient que des adapters techniques
- Peut dépendre de libs externes

## Tests d’intégration News (providers externes)

Ces tests “live” vérifient la structure exacte des requêtes envoyées aux providers (NewsAPI, NewsData, WorldNews) et un smoke minimal. Ils sont désactivés par défaut et nécessitent des clés API.

### Prérequis

- Définir `RUN_INTEGRATION=1`
- Fournir les clés via variables d’environnement (ne pas committer de clés):
  - `NEWS_API_KEY` pour NewsAPI
  - `NEWSDATA_API_KEY` pour NewsData
  - `WORLD_NEWS_API_KEY` pour WorldNews

### Scripts

- NewsAPI (request-structure + smoke):
  ```bash
  NEWS_API_KEY=… pnpm --filter @casys/infrastructure run test:int:newsapi
  ```
- NewsData (request-structure + smoke):
  ```bash
  NEWSDATA_API_KEY=… pnpm --filter @casys/infrastructure run test:int:newsdata
  ```
- WorldNews (request-structure + smoke):
  ```bash
  WORLD_NEWS_API_KEY=… pnpm --filter @casys/infrastructure run test:int:worldnews
  ```
- Tout news (séquentiel):
  ```bash
  NEWS_API_KEY=… pnpm --filter @casys/infrastructure run test:int:newsapi && \
  NEWSDATA_API_KEY=… pnpm --filter @casys/infrastructure run test:int:newsdata && \
  WORLD_NEWS_API_KEY=… pnpm --filter @casys/infrastructure run test:int:worldnews
  ```

### Emplacement des tests

- NewsAPI:
  - `src/adapters/test/news/newsapi-request-structure.integration.test.ts`
  - `src/adapters/test/news/newsapi-real.integration.test.ts`
- NewsData:
  - `src/adapters/test/news/newsdata-request-structure.integration.test.ts`
  - `src/adapters/test/news/newsdata-real.integration.test.ts`
- WorldNews:
  - `src/adapters/test/news/worldnews-request-structure.integration.test.ts`
  - `src/adapters/test/news/worldnews-real.integration.test.ts`

### cURL de référence

- NewsAPI (bucketisée):
  ```bash
  curl -sS -H "X-Api-Key: $NEWS_API_KEY" \
    "https://newsapi.org/v2/everything?language=fr&sortBy=publishedAt&pageSize=10&q=%28BTP%20OR%20chantier%20OR%20construction%29%20AND%20%28administratif%20OR%20conformit%C3%A9%20OR%20r%C3%A9glementaire%29" | jq .
  ```
- NewsData (ex. fonctionnel):
  ```bash
  curl -sS -G 'https://newsdata.io/api/1/news' \
    --data-urlencode 'apikey=$NEWSDATA_API_KEY' \
    --data-urlencode 'q=BTP OR "Horizon 2025"' \
    --data-urlencode 'size=10' \
    --data-urlencode 'language=fr' | jq .
  ```
- WorldNews:
  ```bash
  curl -sS -G 'https://api.worldnewsapi.com/search-news' \
    --data-urlencode 'api-key=$WORLD_NEWS_API_KEY' \
    --data-urlencode 'text=BTP OR construction OR réglementations' \
    --data-urlencode 'source-countries=fr' \
    --data-urlencode 'sort-by=publish-time' \
    --data-urlencode 'sort-direction=DESC' \
    --data-urlencode 'number=20' | jq .
  ```

### Notes

- Ces tests ne forcent pas un nombre de résultats > 0 (volatilité des APIs). Ils verrouillent surtout la structure des requêtes (params, formattage) et appliquent un soft-pass pour rate-limit/quota.
- La logique de composition des requêtes keywords→query est centralisée dans `src/services/provider-keyword-selector.ts`.
