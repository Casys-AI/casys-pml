# SEO Adapters

## Objet

Intégrations SEO via **DataForSEO API** pour l'analyse de domaines, keywords, SERP et trends.

## Fichiers clés

### Adaptateurs actifs
- `dataforseo-domain.adapter.ts` - Analyse de domaine (ranked keywords, metrics)
- `dataforseo-serp.adapter.ts` - Scraping SERP Google (top results)
- `dataforseo-trends.adapter.ts` - Google trends (tendances keywords)
- `dataforseo-site-keywords.adapter.ts` - Keywords pertinents pour un domaine

### Ports
- `DomainAnalysisPort` - Analyse de domaines
- `GoogleScrapingPort` - Scraping SERP
- `GoogleTrendsPort` - Tendances
- `SiteKeywordsPort` - Keywords du site

## APIs DataForSEO utilisées

### APIs fonctionnelles

| API | Endpoint | Usage | Qualité |
|-----|----------|-------|---------|
| **Ranked Keywords** | `/v3/dataforseo_labs/google/ranked_keywords/live` | Keywords où le domaine rank (top 100) | ⭐⭐⭐⭐⭐Excellent |
| **SERP** | `/v3/serp/google/organic/live/advanced` | Top résultats Google pour un keyword | ⭐⭐⭐⭐⭐Excellent |
| **Google trends** | `/v3/keywords_data/google_trends/explore/live` | Tendances temporelles des keywords | ⭐⭐⭐⭐ Good |
| **Keywords for Site** | `/v3/dataforseo_labs/google/keywords_for_site/live` | Keywords pertinents pour un domaine | ⭐⭐ Bad (trop générique) |
| **Related Keywords** | `/v3/dataforseo_labs/google/related_keywords/live` | Keywords similaires (nécessite seed) | ⭐⭐⭐⭐ Good |
| **Keyword Suggestions** | `/v3/dataforseo_labs/google/keyword_suggestions/live` | Suggestions (nécessite seed) | ⭐⭐⭐⭐ Good |
| **Backlinks** | `/v3/backlinks/summary/live` | Résumé backlinks | ⭐⭐ OK |

### APIs non disponibles (40400 Error)

- **Domain Overview** - Nécessite activation spéciale
- **Domain Metrics** - Nécessite activation spéciale
- **Keywords for Pages** - Non disponible avec le plan actuel

## Limitations identifiées

### 1. **Ranked Keywords** (API principale)
- ✅ Fonctionne bien pour sites avec trafic organique > 50 visites/mois
- ❌ Retourne **0 keywords** pour :
  - Très petits sites locaux (TPE, artisans)
  - Sites niche avec keywords < 50 recherches/mois
  - Sites récents (< 6 mois)
  - Sites sans backlinks

**Exemples testés** :
- ✅ `thenocodeguy.com` : 6 keywords (vol: 50-210)
- ✅ `clermont.fr` : 88 keywords (vol: 170-480)
- ✅ `plombier-paris.fr` : 10 keywords (vol: 90+)
- ❌ `kellyassist.fr` : 0 keywords (service niche)
- ❌ `boulangerie-bo.fr` : 0 keywords (commerce local)

### 2. **Keywords for Site** (API secondaire)
- ⚠️ Retourne souvent des keywords **non pertinents** :
  - Keywords de pages support/FAQ ("login", "sign up")
  - Termes ultra-génériques ("artificial intelligence dolls")
  - Keywords de concurrents mentionnés sur le site
- ❌ **Non recommandé** pour production

**Exemples testés** :
- `stripe.com` → "what countries accept us dollars", "germany currency" (FAQ)
- `airtable.com` → "salesforce formula", "vlookup" (concurrents)
- `thenocodeguy.com` → "artificial intelligence mcdonald's" (hors-sujet)

### 3. **Couverture géographique**
- ✅ Excellente pour sites **internationaux** (EN, US)
- ⚠️ Limitée pour sites **locaux français** (< 100 vol/mois)
- ❌ Quasi-nulle pour sites **ultra-locaux** (boulangerie, coiffeur)

## Recommandations

### Pour production
1. **Utiliser uniquement `Ranked Keywords`** (topKeywords) - Données fiables
2. **Désactiver `Keywords for Site`** (siteKeywords) - Trop de bruit
3. **Implémenter fallback IA** pour sites sans données :
   ```
   if (topKeywords.length === 0) {
     // Scraper homepage + IA extraction
     // OU Related Keywords avec seeds IA
     // OU Génération pure IA basée sur business context
   }
   ```

### Stratégie hybride recommandée
```
Niveau 1: Ranked Keywords (DataForSEO)
  ↓ Si 0 résultats
Niveau 2: Scraper + IA extraction + Related Keywords
  ↓ Si échec
Niveau 3: IA pure (génération basée sur business context)
```

## Configuration

### Variables d'environnement
```bash
DATAFORSEO_LOGIN=your-email@domain.com
DATAFORSEO_PASSWORD=your-password
# OU
DATAFORSEO_API_KEY=your-api-key

DATAFORSEO_BASE_URL=https://api.dataforseo.com
DATAFORSEO_TIMEOUT_MS=80000
```

### Coûts API (indicatifs)
- Ranked Keywords: 1 crédit/domaine
- Keywords for Site: 1 crédit/requête
- SERP: 0.1 crédit/keyword
- trends: 0.1 crédit/keyword

## Tests

- Voir `__tests__/` pour tests unitaires
- Tests d'intégration avec vrais domaines dans `DATAFORSEO-AUDIT.md`
