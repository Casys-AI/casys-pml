# GenerateCoverImageUseCase

**Source :** `packages/application/src/usecases/generate-cover-image.usecase.ts`

## Objectif

Générer une image de couverture pour un article en utilisant l'IA, avec validation stricte et configuration projet.

## Signature

```ts
interface GenerateCoverImageCommandDTO {
  outlineTitle: string;
  outlineSummary?: string;
  tenantId?: string;
  projectId?: string;
  articleId?: string;
}

interface GeneratedCoverImageDTO {
  base64: string;
  mime: string;
  alt: string;
  format: string;
  slug: string;
}

execute(input: GenerateCoverImageCommandDTO): Promise<GeneratedCoverImageDTO | null>
```

## Ports requis

- `UserProjectConfigPort` - lecture config projet
- `PromptTemplatePort` - templating du prompt IA
- `ImageGeneratorPort` - génération d'image via IA (OpenAI/DALL-E)

## Configuration requise

```ts
// ProjectConfig.publication.images
{
  generate: true,                    // Activation génération
  cover: {
    template: "cover-template-id",   // Template POML
    format: "webp" | "png" | "jpeg", // Format de sortie
    stylePrompt?: "modern, clean"    // Style additionnel
  }
}
```

## Étapes détaillées

1. **Validation contexte** : skip si `tenantId`/`projectId` manquants (pas d'erreur)
2. **Lecture config** : récupération `publication.images` depuis `ProjectConfig`
3. **Vérification activation** : skip si `images.generate=false` (pas d'erreur)
4. **Validation template** : fail-fast si `cover.template` manquant
5. **Validation sources alt** : fail-fast si ni `outlineSummary` ni `outlineTitle`
6. **Construction slug** : normalisation titre + short ID pour nom fichier
7. **Mapping prompt** : conversion input → `CoverPromptDTO`
8. **Construction POML** : template + paramètres → prompt IA structuré
9. **Génération IA** : appel `ImageGeneratorService` (délégation à OpenAI)
10. **Validation résultat** : vérification base64, mime, format attendu
11. **Construction alt** : utilise alt IA ou fallback sur outline (max 140 chars)
12. **Assemblage DTO** : résultat final avec métadonnées

## Validation fail-fast

- `publication.images.cover.template` requis si `images.generate=true`
- Ni `outlineSummary` ni `outlineTitle` disponibles
- Format d'image non supporté (webp/png/jpeg/jpg)
- Réponse IA invalide (base64 vide, mime incorrect)
- Alt finale vide après fallbacks

## Gestion des erreurs

- **Skip silencieux** : contexte insuffisant ou génération désactivée → `null`
- **Fail-fast** : configuration invalide ou génération échouée → `Error`
- **Logs non-bloquants** : erreurs de logging ne cassent pas le flux

## Formats supportés

- **webp** → `image/webp` (recommandé, plus léger)
- **png** → `image/png` (transparence)
- **jpeg/jpg** → `image/jpeg` (compatibilité)

## Construction du slug

```ts
// Exemple: "Guide Intelligence Artificielle" + articleId "abc123def"
// → "guide-intelligence-artificielle-abc123de"

buildSlug(title, id) {
  const normalized = title
    .toLowerCase()
    .normalize('NFKD')           // Décomposition Unicode
    .replace(/[\u0300-\u036f]/g, '')  // Suppression accents
    .replace(/[^a-z0-9]+/g, '-')      // Espaces → tirets
    .replace(/(^-|-$)/g, '')          // Trim tirets
    .slice(0, 64);                    // Limite longueur

  const shortId = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  return shortId ? `${normalized}-${shortId}` : normalized;
}
```

## Alt text intelligent

1. **Priorité IA** : utilise `alt` retourné par l'IA si non vide
2. **Fallback outline** : `outlineSummary` ou `outlineTitle` (max 140 chars)
3. **Fail-fast** : erreur si aucune source d'alt disponible

## Exemple d'utilisation

```ts
const useCase = new GenerateCoverImageUseCase(
  configReader,
  promptTemplate,
  imageGenerator
);

// Génération réussie
const result = await useCase.execute({
  outlineTitle: 'Guide IA pour débutants',
  outlineSummary: "Introduction complète à l'intelligence artificielle",
  tenantId: 'tenant1',
  projectId: 'blog-tech',
  articleId: 'ai-guide-123',
});

if (result) {
  console.log('Cover générée:', result.slug);
  console.log('Format:', result.format, result.mime);
  console.log('Alt:', result.alt);
  // base64 ready pour upload
}

// Skip (génération désactivée)
const skipped = await useCase.execute({
  outlineTitle: 'Article',
  // tenantId manquant → skip silencieux
});
console.log(skipped); // null
```

## Integration avec publication

```ts
// Dans GenerateArticleLinearUseCase
const coverResult = await this.generateCoverImage?.execute({
  outlineTitle: parsedOutline.title,
  outlineSummary: parsedOutline.description,
  tenantId,
  projectId,
  articleId: structure.article.id,
});

if (coverResult) {
  // Upload via ImageUploaderPort puis publication
  const uploadedCover = await this.imageUploader.upload({
    base64: coverResult.base64,
    filename: buildCoverFilename(coverResult.slug, shortId, coverResult.format),
    mime: coverResult.mime,
    alt: coverResult.alt,
  });

  structure.article.coverImageUrl = uploadedCover.url;
}
```

## Notes d'architecture

- **Service délégation** : utilise `ImageGeneratorService` (core) au lieu d'adapter direct
- **Config-driven** : activation/désactivation via `ProjectConfig`
- **Fail-fast sélectif** : skip silencieux vs erreurs bloquantes selon le contexte
- **Slug déterministe** : même titre → même slug (cache-friendly)
- **Validation mime stricte** : vérification cohérence format/mime
