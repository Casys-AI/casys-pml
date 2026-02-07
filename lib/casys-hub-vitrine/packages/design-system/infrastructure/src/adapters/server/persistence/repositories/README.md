# Repositories (MDX)

## Objet

Persistance filesystem pour les articles (MDX): lecture/écriture, slug, frontmatter, corps.

## Fichiers clés

- `mdx-article-structure.repository.ts`
- `mdx-file-writer.adapter.ts`

## Tests

- `__tests__/` (slug, mapping frontmatter, intégrations)
- Usine de test: `adapters/test/factories/article.ts` (`makeTestArticle`) pour des fixtures valides

## Bonnes pratiques

- Pas de service fichier transversal: l’écriture MDX est interne aux publishers
- Règles de frontmatter centralisées (voir `frontmatter/`)
