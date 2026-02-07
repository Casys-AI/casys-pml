# Publishers (FS/GitHub)

## Objet

Publication d’articles (MDX + assets) vers filesystem local ou GitHub. Orchestration: upload/copie binaire des images + mise à jour du frontmatter (chemin final), puis écriture/commit.

## Fichiers clés

- `fs-article-publisher.adapter.ts`
- `github-article-publisher.adapter.ts`
- `__tests__/` (erreurs, cover, intégrations)

## Règles Fail Fast

- `assets_path` requis
- Format image: `webp` uniquement
- Mise à jour `article.article.cover.src` avant sérialisation du frontmatter

## Notes d’archi

- `MdxFileWriterAdapter` est interne (pas exposé via DI)
  - Annoté `@internal` dans `persistence/repositories/mdx-file-writer.adapter.ts`
  - Utilisé uniquement par `FsArticlePublisherAdapter`
  - Ne pas importer directement en dehors du publisher FS — les Use Cases doivent cibler `ArticlePublisherPort`
- `GenerateArticleLinearUseCase` dépend d’un service de publication, pas d’un writer de fichier

## Exemple d’usage recommandé

```ts
import type { ArticlePublisherPort, ArticleStructure } from '@casys/core';

export class PublishArticleUseCase {
  constructor(private readonly publisher: ArticlePublisherPort) {}

  async execute(
    article: ArticleStructure,
    tenantId: string,
    projectId: string
  ) {
    // Orchestration au niveau application: un seul port de publication
    return this.publisher.publishArticle(article, tenantId, projectId);
  }
}
```

## Anti-patterns (à éviter)

- Importer `MdxFileWriterAdapter` directement dans un Use Case ou un service d’application.
- Exposer un port `ArticleFileWriterPort` dans `@casys/core` (détail d’infrastructure spécifique au publisher FS).
- Bypasser le flux de publication (images/frontmatter) en écrivant le MDX sans passer par `ArticlePublisherPort`.
