# SeoAnalysisUseCase

**Source :** `packages/application/src/usecases/seo-analysis.usecase.ts`

## Objectif

Analyse SERP/intentions/gaps/competitors pour guider la rédaction avec enrichissement IA + validation DataForSEO.

## Signature

```ts
interface SeoAnalysisCommandDTO {
  tenantId: string;
  projectId: string;
  keywords: string[];
  language: string;
}

execute(input: SeoAnalysisCommandDTO): Promise<SeoStrategy>
```

## Ports requis

- `UserProjectConfigPort` - configuration SEO
- `PromptTemplatePort` - templates POML
- `AITextModelPort` - enrichissement IA
- `SeoAnalysisService` - logique métier SEO (Core)
- `GoogleScrapingPort` - scraping SERP
- `GoogleTrendsPort` - données tendances
- `SeoKeywordRepositoryPort` - persistance keywords

## Configuration requise

```yaml
generation:
  seoAnalysis:
    template: 'path/to/seo-analysis.poml'
    industry: 'Technology'
    targetAudience: 'Developers'
    contentType: 'article'
    businessDescription: 'Tech blog'
    keywords: ['ai', 'automation'] # fallback config-driven si non fourni en input
```

## Étapes détaillées

1. **Validation entrées** : fail-fast sur `tenantId`, `projectId`, `language`
2. **Chargement config** : récupération template + contexte projet
3. **Enrichissement IA** : analyse initiale sans contexte concurrent/trends
4. **Validation IA** : fail-fast si aucun keyword enrichi ou intention manquante
5. **Validation DataForSEO** : SERP + Trends sur top 3 keywords IA
6. **Scraping SERP** : récupération concurrents (max 5 résultats par keyword)
7. **Récupération trends** : données Google Trends par région
8. **Construction stratégie** : via `SeoAnalysisService` (logique métier Core)
9. **KeywordPlan.tags** : génération de `KeywordTag[]` (source de vérité), avec `label` et `slug`
10. **Persistance/relations** : upsert + relations seed→enriched (normalisés)

## Enrichissement IA (étape 3)

```ts
// Input IA (avant DataForSEO)
{
  keywords: ['ai', 'automation'],
  language: 'fr',
  businessDescription: 'Tech blog',
  competitorTitles: [],  // vide initialement
  trendData: [],         // vide initialement
  webContext: 'No competitor context'
}

// Output IA attendu
{
  enrichedKeywords: ['intelligence artificielle', 'automation ia', '...'],
  searchIntent: { keyword: 'ai', intent: 'informational' },
  contentGaps: ['manque analyse technique'],
  recommendations: ['focus sur cas pratiques']
}
```

## Validation DataForSEO (étapes 5-7)

- **Top 3 keywords IA** : validation marché sur mots-clés les plus pertinents
- **SERP scraping** : 5 résultats max par keyword
- **Fail-fast** : si toutes les requêtes SERP échouent
- **Trends obligatoires** : fail-fast si 0 résultat trends

## Sortie KeywordPlan.tags (étapes 9–10)

```ts
// KeywordPlan.tags — source de vérité pour les tags
type KeywordTag = { label: string; slug: string; source?: 'seed' | 'opportunity' | 'trend' | 'ai'; weight?: number };

const keywordPlan = {
  tags: [
    { label: 'Intelligence Artificielle', slug: 'intelligence-artificielle', source: 'ai' },
    { label: 'Automation IA', slug: 'automation-ia', source: 'ai' },
  ],
  contentGaps: ['manque analyse technique'],
  recommendations: ['focus sur cas pratiques'],
};

// Relations seed→enriched: traçabilité entre seeds fournis et tags enrichis
const seeds = ['ai', 'automation'];
const enriched = keywordPlan.tags.map(t => t.slug); // ['intelligence-artificielle', 'automation-ia']
```

Notes:
- Les `slug` sont indispensables pour les liens graphe ultérieurs (mapping `keywordNormalized = slug`).
- En aval, `BuildTopicsFromFetchResultsUseCase` attend des `KeywordTag[]` alignés (avec slugs) pour créer `Topic→KeywordPlan`.

## Erreurs fail-fast

- `tenantId`/`projectId`/`language` manquants
- Template SEO non configuré
- Industry/targetAudience manquants en config
- **Keywords manquants** : ni en input ni en config `generation.seoAnalysis.keywords`
- Aucun keyword enrichi retourné par l'IA
- Intention de recherche manquante (IA)
- Toutes les requêtes SERP ont échoué
- TrendData manquant (0 résultat)
- Aucun Tag généré dans `keywordPlan.tags` ou tag sans `slug`

## Exemple d'utilisation

```ts
const useCase = new SeoAnalysisUseCase(
  configReader,
  promptTemplate,
  aiTextModel,
  seoAnalysisService,
  googleScraping,
  googleTrends,
  seoKeywordRepo
);

const strategy = await useCase.execute({
  tenantId: 'tenant1',
  projectId: 'blog-tech',
  keywords: ['ai', 'automation'],
  language: 'fr',
});

console.log('Keywords enrichis:', strategy.enrichedKeywords.length);
console.log('Intention:', strategy.searchIntent.intent);
console.log('Concurrents:', strategy.competitorAnalysis.length);
```

## Notes d'architecture

- **Pipeline 2-étapes** : IA d'abord, puis validation DataForSEO
- **Fail-fast strict** : aucun fallback sur données externes
- **Persistance post-stratégie** : keywords + relations seed/enriched
- **Region mapping** : langue → région DataForSEO automatique
