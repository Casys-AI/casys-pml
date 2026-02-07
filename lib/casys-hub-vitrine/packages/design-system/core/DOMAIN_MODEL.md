# 📊 Modèle de domaine CASYS

> Architecture DDD (Domain-Driven Design) - Hexagonale Clean Architecture

## 🏢 Hiérarchie organisationnelle

```
┌─────────────────────────────────────────────────────────────┐
│ Tenant (Entity)                                             │
│ - id, name, config                                          │
│ - Organisation/locataire multi-tenant                       │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ TENANT_HAS_PROJECT
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Project (Entity)                                            │
│ - id, tenantId, name, language, siteUrl                     │
│ - industry, targetAudience, contentType                     │
│ - Projet de contenu (blog, site, etc.)                      │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ HAS_SEO_BRIEF
                   ▼
```

## 📝 Stratégie SEO & Editorial

### SeoBrief (Value Object) - Source de vérité SEO

```
┌─────────────────────────────────────────────────────────────┐
│ SeoBrief (Value Object)                                     │
│ - _keywordPlan: KeywordPlan                                 │
│ - _search: SearchIntentData                                 │
│                                                              │
│ Getters dérivés:                                            │
│ - enrichedKeywords: string[]                                │
│ - userQuestions: string[]                                   │
│ - contentGaps: {keyword, reason, details}[]                 │
│ - seoRecommendations: string[]                              │
│ - searchIntent, searchConfidence                            │
│ - contentRecommendations: string[]                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ HAS_KEYWORD_PLAN
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ KeywordPlan (Type - Aggregate)                              │
│ - tags: KeywordTag[]                                        │
│                                                              │
│ Propriétés persistées (Neo4j):                              │
│ - id, project_id, seo_brief_id                              │
│ - plan_hash, is_plan_aggregate                              │
│ - created_at, updated_at                                    │
│                                                              │
│ Relations:                                                   │
│ - (:SeoBrief)-[:HAS_KEYWORD_PLAN]->(:KeywordPlan)          │
│ - (:KeywordPlan)-[:SEED]->(:KeywordTag)                    │
│ - (:KeywordPlan)-[:INCLUDES]->(:KeywordTag)                │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ INCLUDES / SEED
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ KeywordTag (Type)                                           │
│ - label, slug, source, weight                               │
│                                                              │
│ Métriques SEO (DataForSEO):                                 │
│ - searchVolume, difficulty, cpc, competition                │
│ - lowTopOfPageBid, highTopOfPageBid                         │
│ - monthlySearches: {year, month, searchVolume}[]            │
│                                                              │
│ Sources possibles:                                          │
│ - 'seed': Mot-clé de départ (config projet)                │
│ - 'opportunity': Opportunité SEO identifiée                 │
│ - 'trend': Tendance détectée                                │
│ - 'ai': Suggéré par l'IA                                    │
│ - 'related_keywords': Mots-clés associés                    │
│ - 'serp_discovered': Découvert via SERP                     │
│ - 'ai_plus_dataforseo': Enrichi IA + DataForSEO             │
│                                                              │
│ Relations:                                                   │
│ - (:KeywordTag)-[:PART_OF]->(:KeywordPlan)                 │
│ - (:Article)-[:ARTICLE_HAS_TAG]->(:KeywordTag)             │
└─────────────────────────────────────────────────────────────┘
```

### SearchIntentData (Type)

```typescript
interface SearchIntentData {
  intent: 'informational' | 'commercial' | 'navigational' | 'transactional'
  confidence: number // 0..1
  supportingQueries?: string[]
  contentRecommendations?: string[]
  contentGaps?: string[]  // ✅ Déplacé depuis KeywordPlan
  seoRecommendations?: string[]  // ✅ Déplacé depuis KeywordPlan
}
```

**Principe clé:** `contentGaps` et `seoRecommendations` font partie de l'**intention de recherche**, pas du plan de mots-clés. Ils décrivent **ce qu'il faut faire** (stratégie), pas **quels mots-clés utiliser** (tactique).

### EditorialBrief (Aggregate)

```
┌─────────────────────────────────────────────────────────────┐
│ EditorialBrief (Aggregate)                                  │
│ - id, tenantId, projectId, language                         │
│ - angle: EditorialAngle (VO)                                │
│ - seoBrief: SeoBrief (VO)                                   │
│ - businessContext: {targetAudience, industry,               │
│                     businessDescription, contentType}       │
│ - corpusTopicIds: string[]                                  │
│ - createdAt                                                 │
│                                                              │
│ Invariants:                                                 │
│ - tenantId, projectId, language requis                      │
│ - businessContext complet requis                            │
│ - Au moins un topic ou seoBrief requis                      │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ USES_TOPICS
                   ▼
```

## 📰 Contenu & Topics

```
┌─────────────────────────────────────────────────────────────┐
│ Topic (Entity)                                              │
│ - id, title, sourceUrl, language                            │
│ - imageUrls, sourceContent, createdAt                       │
│                                                              │
│ TopicCandidate (variant):                                   │
│ - + description, content, publishedAt, author               │
│ - + categories, relevanceScore, metadata                    │
│                                                              │
│ TopicSource:                                                │
│ - type: 'rss' | 'newsapi' | 'worldnews' | 'newsdata' |     │
│         'webagent' | 'custom'                               │
│ - name, url, apiKey, params, enabled                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ TOPIC_FOR_ARTICLE
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ ArticleStructure (Aggregate)                                │
│ - article: ArticleNode                                      │
│ - sections: SectionNode[]                                   │
│ - topics: Topic[]                                           │
│ - componentUsages: ComponentUsage[]                         │
│ - textFragments: TextFragment[]                             │
│ - comments: ArticleComment[]                                │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ├─► ArticleNode
                   │   - id, title, description, language
                   │   - keywords, tags, cover, sources
                   │   - tenantId, projectId, content
                   │
                   ├─► SectionNode
                   │   - id, title, level, content, summary
                   │   - position, articleId, parentSectionId
                   │   - relatedArticles[], relatedSources[]
                   │
                   ├─► TextFragment
                   │   - id, content, sectionId, position
                   │   - startOffset, endOffset
                   │
                   └─► ArticleComment
                       - id, articleId, textFragmentId
                       - content, position, authorId
                       - replies[], metadata
```

## 🔗 Relations Graph (Neo4j)

### Hiérarchie organisationnelle
```cypher
(:Tenant)-[:TENANT_HAS_PROJECT]->(:Project)
(:Project)-[:HAS_SEO_BRIEF]->(:SeoBrief)
```

### Stratégie SEO
```cypher
(:SeoBrief)-[:HAS_KEYWORD_PLAN]->(:KeywordPlan {project_id, seo_brief_id})
(:KeywordPlan)-[:SEED]->(:KeywordTag {source:'seed'})
(:KeywordPlan)-[:INCLUDES]->(:KeywordTag)
(:KeywordTag)-[:PART_OF]->(:KeywordPlan)
```

### Contenu
```cypher
(:Article)-[:ARTICLE_HAS_TAG]->(:KeywordTag)
(:Article)-[:HAS_SECTION]->(:Section)
(:Section)-[:HAS_TEXT_FRAGMENT]->(:TextFragment)
(:TextFragment)-[:HAS_COMMENT]->(:Comment)
(:Article)-[:USES_TOPIC]->(:Topic)
(:Section)-[:LINKS_TO_TOPIC]->(:Topic)
```

### Liaison intelligente des tags
```cypher
// Matching vectoriel pour lier tags d'article au KeywordPlan
// 1. Déduplication exacte via INCLUDES
// 2. Matching vectoriel avec seeds (seuil 0.7)
// 3. Fallback: tag orphelin

(:Article)-[:ARTICLE_HAS_TAG]->(:KeywordTag)-[:PART_OF]->(:KeywordPlan)
```

## 🎯 Types de support

### SeoStrategy (Composition)

```typescript
type SeoStrategy = SeoStrategyCore 
  & Partial<SeoCompetitiveContext>
  & Partial<SeoTrendContext>
  & Partial<SeoMeta>
  & ProjectContext

interface SeoStrategyCore {
  keywordPlan: KeywordPlan
  searchIntent: SearchIntentData
}

interface SeoCompetitiveContext {
  competitors: CompetitorData[]
  competitionScore?: number
}

interface SeoTrendContext {
  trends: TrendData[]
  trendScore?: number
}

interface SeoMeta {
  id?: string
  language?: string
  createdAt?: string
}

interface ProjectContext {
  contentType?: string
}
```

### SeoBriefData (Projection pour prompts/application)

```typescript
interface SeoBriefData {
  enrichedKeywords: string[]
  userQuestions: string[]
  contentGaps: string[]
  seoRecommendations: string[]
  searchIntent: SearchIntentKind
  searchConfidence: number
  contentRecommendations: string[]
}
```

**Usage:** Utilisé dans les prompts IA et l'application. Dérivé du `SeoBrief` VO via `toObject()`.

## 📦 Value Objects

| Value Object | Responsabilité | Invariants |
|--------------|----------------|------------|
| **SeoBrief** | Stratégie SEO consolidée | Au moins 1 champ non vide |
| **EditorialAngle** | Angle éditorial unique | Non vide, trimmed |
| **ProjectSeoSettings** | Configuration SEO projet | seedKeywords requis |
| **Domain** | Domaine web | Format URL valide |
| **ContentGap** | Manque de contenu | keyword + reason requis |
| **ExtractedKeyword** | Mot-clé extrait | label requis |
| **Keyword** | Mot-clé générique | label requis |
| **PageCandidate** | Page candidate | URL + score requis |

## 🏗️ Principes architecturaux

### 1. Source de vérité unique
- **SeoBrief** = source de vérité pour la stratégie SEO
- **KeywordPlan** = exécution tactique (mots-clés)
- **SearchIntentData** = stratégie (gaps, recommendations)

### 2. Normalisation
- `tenant_id` supprimé de `KeywordPlan` (redondant)
- `project_id` conservé pour requêtes rapides
- Navigation: `KeywordPlan → SeoBrief → Project → Tenant`

### 3. Liaison intelligente
- Tags d'article liés au `KeywordPlan` via matching vectoriel
- Déduplication automatique
- Fallback orphelin si aucun plan trouvé

### 4. Fail-fast
- Validation stricte dans les constructeurs
- Pas de valeurs nulles/undefined non gérées
- Erreurs explicites avec messages clairs

### 5. Immutabilité
- Value Objects immutables
- Entities avec getters uniquement
- Modifications via méthodes explicites

## 🔄 Flux de données

### Création d'un article

```
1. SeoAnalysisUseCase
   ↓ Crée SeoBrief
   ↓ Crée KeywordPlan(s) liés au SeoBrief
   
2. GenerateArticleLinearUseCase
   ↓ Utilise SeoBrief
   ↓ Crée EditorialBrief
   ↓ Génère Article
   ↓ Upsert tags d'article
   
3. TagRepository (liaison intelligente)
   ↓ Matching vectoriel avec seeds
   ↓ Lie tags au KeywordPlan
   ↓ Crée (:KeywordTag)-[:PART_OF]->(:KeywordPlan)
```

### Analyse d'un article existant

```
1. AnalyzeExistingArticleUseCase
   ↓ Parse article (frontmatter + contenu)
   ↓ Extrait tags
   
2. SeoAnalysisUseCase (si pas de SeoBrief)
   ↓ Crée SeoBrief
   ↓ Crée KeywordPlan(s)
   
3. TagRepository
   ↓ Upsert tags parsés
   ↓ Liaison intelligente au KeywordPlan
```

## 📚 Références

- **DDD**: Domain-Driven Design (Eric Evans)
- **Clean Architecture**: Robert C. Martin
- **Hexagonal Architecture**: Alistair Cockburn
- **CQRS**: Command Query Responsibility Segregation
- **Event Sourcing**: Pour audit trail (futur)
