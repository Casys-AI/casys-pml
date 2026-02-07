# Core (Domaine métier)

Entités, value objects, logique métier pure et système d'injection de dépendances.

## Fonctionnalités

- **Domaine métier pur** : Entités et logique métier indépendantes de l'infrastructure
- **Architecture hexagonale** : Séparation claire entre les ports et les adaptateurs
- **Injection de dépendances** : Système d'injection basé sur les tokens Symbol
- **100% testable** : Isolation des dépendances pour des tests unitaires fiables

## Installation

```bash
# Avec npm
npm install @casys/core

# Avec yarn
yarn add @casys/core
```

## Utilisation

### 1. Configuration du CoreModule

```typescript
import { Module } from '@nestjs/common';
import { CoreModule, CoreModuleOptions } from '@casys/core';

@Module({
  imports: [
    CoreModule.forRoot({
      // Configuration requise
      aiTextModel: {
        /* implémentation de AITextModel */
      },
      articleFetcher: {
        /* implémentation de ArticleFetcherPort */
      },
      articleRepository: {
        /* implémentation de ArticleRepositoryPort */
      },
      topicRepository: {
        /* implémentation de TopicRepositoryPort */
      },

      // Options optionnelles
      imageGenerator: {
        /* implémentation de ImageGeneratorPort */
      },
      podcastGenerator: {
        /* implémentation de PodcastGeneratorPort */
      },
      seoHelper: {
        /* implémentation de SeoHelperPort */
      },
    } as CoreModuleOptions),
  ],
  // ...
})
export class AppModule {}
```

### 2. Injection des services

```typescript
import { Injectable, Inject } from '@nestjs/common';
import {
  ARTICLE_GENERATOR,
  ArticleGeneratorPort,
  TREND_ANALYZER,
  TrendAnalyzerPort,
} from '@casys/core';

@Injectable()
export class MyService {
  constructor(
    @Inject(ARTICLE_GENERATOR)
    private readonly articleGenerator: ArticleGeneratorPort,
    @Inject(TREND_ANALYZER)
    private readonly trendAnalyzer: TrendAnalyzerPort
  ) {}

  async generateContent() {
    const trends = await this.trendAnalyzer.analyzeTrends(['tech', 'ai']);
    const article = await this.articleGenerator.generate({
      topic: 'AI Trends',
      keywords: ['machine learning', 'neural networks'],
    });
    return article;
  }
}
```

## Architecture

### Ports disponibles

- `AITextModel` : Génération de texte avec IA
- `ArticleFetcherPort` : Récupération d'articles depuis différentes sources
- `ArticleGeneratorPort` : Génération d'articles
- `TrendAnalyzerPort` : Analyse des tendances
- `ImageGeneratorPort` : Génération d'images
- `PodcastGeneratorPort` : Génération de podcasts
- `SeoHelperPort` : Aide au référencement

### Structure des dossiers

```
src/
├── domain/                  # Logique métier pure
│   ├── entities/            # Entités du domaine
│   ├── ports/               # Interfaces (ports) du domaine
│   └── services/            # Services du domaine
├── core.module.ts           # Module principal d'injection
└── tokens.ts               # Tokens d'injection
```

## Bonnes pratiques

1. **Toujours utiliser les ports** pour les dépendances externes
2. **Éviter les imports directs** entre les couches
3. **Utiliser les tokens d'injection** pour les dépendances
4. **Tester les services** avec des mocks des ports

## Développement

### Tests

```bash
# Exécuter les tests
npm test

# Couverture de code
npm run test:cov
```

### Construction

```bash
# Builder le package
npm run build
```
