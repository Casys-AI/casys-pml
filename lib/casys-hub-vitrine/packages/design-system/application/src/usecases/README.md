# Documentation des Use Cases (@casys/application)

Chaque use case est documenté dans une fiche dédiée pour éviter un README trop volumineux.

Principes communs

- Fail-fast: entrées invalides → erreurs explicites
- DDD/Hexa: orchestration en application, règles dans `@casys/core`, I/O via ports
- Config-driven: lecture via `UserProjectConfigPort`
- Événements: `ApplicationEventHandler` (optionnels)

Fiches par use case

- [GenerateArticleLinearUseCase](./docs/generate-article-linear.md)
- [SelectTopicUseCase](./docs/select-topic.md)
- [SeoAnalysisUseCase](./docs/seo-analysis.md)
- [WriteSectionsUseCase](./docs/write-sections.md)
- [GenerateCoverImageUseCase](./docs/generate-cover-image.md)
- [GenerateComponentFromCommentUseCase](./docs/generate-component-from-comment.md)
- [ListComponentsUseCase](./docs/list-components.md)
- [IndexComponentsUseCase](./docs/index-components.md)
- [IndexArticlesUseCase](./docs/index-articles.md)
- [ListArticlesUseCase](./docs/list-articles.md)
- [PublishArticleUseCase](./docs/publish-article.md)
- [IndexArticleProgressivelyUseCase](./docs/index-article-progressively.md)
- [BuildTopicsFromFetchResultsUseCase](./docs/build-topics-from-fetch-results.md)
- [CreateEditorialBriefUseCase](./docs/create-editorial-brief.md)
- [IndexProjectSeedKeywordsUseCase](./docs/index-project-seed-keywords.md)
- [SuggestArticleTagsUseCase](./docs/suggest-article-tags.md)
- [UpsertArticleTagsUseCase](./docs/upsert-article-tags.md)
