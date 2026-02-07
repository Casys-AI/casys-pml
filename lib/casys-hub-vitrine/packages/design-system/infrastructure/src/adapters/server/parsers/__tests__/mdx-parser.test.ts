// ComponentUsage retiré car plus utilisé avec la nouvelle architecture TextFragment
import * as fsPromises from 'fs/promises';
import matter from 'gray-matter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MdxParserService } from '../mdx-parser.adapter';

// Mock pour fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

// Mock de gray-matter
vi.mock('gray-matter', () => ({
  default: vi.fn(),
}));

// Typage des mocks
const mockMatter = vi.mocked(matter);
const mockReadFile = vi.mocked(fsPromises.readFile);

// Configuration des mocks avant chaque test
beforeEach(() => {
  // Réinitialisation des mocks
  vi.clearAllMocks();

  // Configuration par défaut du mock fs.readFile
  mockReadFile.mockResolvedValue('---\ntitle: Test Article\n---\n\n# Test Content');

  // Configuration par défaut du mock gray-matter
  (mockMatter as any).mockImplementation((content: string) => {
    return {
      data: {
        title: 'Test Article',
        description: 'Test Description',
        keywords: ['test', 'article'],
      },
      content: content.includes('---') ? content.split('---').slice(2).join('---').trim() : content,
    };
  });
});

it('extractLinks should separate external and internal links', () => {
  const parser = new MdxParserService();
  const md = `Text with [Google](https://google.com) and [Internal](/blog/post) and [Mail](mailto:a@b.com) and [Anchor](#part)`;
  const res = parser.extractLinks(md);
  expect(res.external).toEqual(['https://google.com']);
  expect(res.internal).toEqual(['/blog/post']);
});

it('extractLinksForArticle should return per-section links', async () => {
  const parser = new MdxParserService();
  const mdxContent = `---\ntitle: Links Test\n---\n\n# S1\nSee [Site](https://example.com) and [Rel](./doc)\n\n## S2\nAnother [Ext](http://foo.bar)`;
  (fsPromises.readFile as any).mockResolvedValue(mdxContent);
  const result = await parser.parseArticleStructure('/path/to/links.mdx');
  const perSection = parser.extractLinksForArticle(result);
  // S1 should have one external and one internal
  const s1 = perSection.find(s => result.sections.find(x => x.id === s.sectionId)?.title === 'S1');
  expect(s1).toBeDefined();
  expect(s1?.external).toEqual(['https://example.com']);
  expect(s1?.internal).toEqual(['./doc']);
  // S2 should have one external
  const s2 = perSection.find(s => result.sections.find(x => x.id === s.sectionId)?.title === 'S2');
  expect(s2).toBeDefined();
  expect(s2?.external).toEqual(['http://foo.bar']);
});

it('parseArticleStructure should auto-fill article.sources from section external links when frontmatter has no sources', async () => {
    const parser = new MdxParserService();
    const mdxContent = `---\ntitle: No Sources\n---\n\n# One\nExternal [A](https://a.example) and [B](https://b.example) and duplicate [A](https://a.example)`;
    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const result = await parser.parseArticleStructure('/path/to/no-sources.mdx');
    expect(result.article.sources?.sort()).toEqual(['https://a.example', 'https://b.example'].sort());
});

describe('MdxParserService', () => {
  let service: MdxParserService;
  const mockMdxContent = `---
title: Test Article
description: Test Description
keywords: ['test', 'article']
---

# Section 1

This is a test article.

<TestComponent prop1="value1" prop2={123}>
  Content inside component
</TestComponent>

## Subsection 1.1

More content here.

# Section 2

<AnotherComponent data={{ key: "value" }}>
  More nested content
</AnotherComponent>
`;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MdxParserService();

    // Mock de readFile pour retourner notre contenu MDX de test
    (fsPromises.readFile as any).mockResolvedValue(mockMdxContent);
  });

  it('should parse MDX file and extract article structure', async () => {
    const articleId = 'test-article';
    const filePath = `/path/to/${articleId}.mdx`;
    const result = await service.parseArticleStructure(filePath);

    // Vérification de la structure de l'article
    expect(result).toBeDefined();
    expect(result.article).toBeDefined();
    expect(result.article.id).toMatch(/^test-article-\w+$/); // Vérifie que l'ID avec hash est généré
    expect(result.article.title).toBe('Test Article');
    expect(result.article.language).toBe('fr');
    expect(result.article.keywords).toEqual(['test', 'article']);
    expect(result.article.createdAt).toBeDefined();
    expect(result.article.sources).toEqual([]);
    expect(result.article.agents).toEqual([]);

    // Vérification des sections
    expect(result.sections).toBeDefined();
    expect(result.sections.length).toBeGreaterThanOrEqual(2);

    // Vérification de la première section
    const section1 = result.sections.find((s: any) => s.title === 'Section 1');
    expect(section1).toBeDefined();
    expect(section1?.level).toBe(1);

    // Vérification des composants
    expect(result.componentUsages).toBeDefined();
    expect(result.componentUsages.length).toBeGreaterThanOrEqual(2);

    // Vérification du premier composant
    const testComponent = result.componentUsages.find(
      (c: any) => c.componentId === 'TestComponent'
    );
    expect(testComponent).toBeDefined();
    expect(testComponent?.props).toEqual({
      prop1: 'value1',
      prop2: '123',
    });
  });

  it('should handle files without components', async () => {
    // Modifier le mock pour un contenu sans composants
    const noComponentsMdx = `---
title: No Components
description: Article without components
---

# Just Text

This is just text content without any components.

## More Text

More plain text here.
`;
    (fsPromises.readFile as any).mockResolvedValue(noComponentsMdx);

    const articleId = 'no-components';
    const filePath = `/path/to/${articleId}.mdx`;
    const result = await service.parseArticleStructure(filePath);

    expect(result).toBeDefined();
    expect(result.article).toBeDefined();
    expect(result.article.id).toMatch(/^no-components-\w+$/); // Vérifie que l'ID avec hash est généré
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.componentUsages.length).toBe(0);
  });

  it('should handle errors gracefully', async () => {
    // Simuler une erreur de lecture de fichier
    (fsPromises.readFile as any).mockRejectedValue(new Error('File not found'));

    const articleId = 'non-existent';
    const filePath = `/path/to/${articleId}.mdx`;

    await expect(service.parseArticleStructure(filePath)).rejects.toThrow();
  });

  it('should detect Hero component as a section header', async () => {
    // Contenu MDX avec un composant Hero au lieu d'un titre H1
    const mdxContent = `---
title: Test Article
keywords: [test, hero, mdx]
description: Testing Hero component as section header
---

<Hero title="My Hero Title" subtitle="Hero Subtitle" />

### Section 1
This is content under section 1.

<TestComponent prop1="value1" prop2={123} />

### Section 2
This is content under section 2.
`;

    // Mock de fs/promises.readFile
    (fsPromises.readFile as any).mockResolvedValue(mdxContent);

    // Création du service avec le mock
    const parser = new MdxParserService();

    // Appel du service
    const result = await parser.parseArticleStructure('/path/to/article-with-hero.mdx');

    // Vérifications
    expect(result.article).toBeDefined();

    // Vérifier que le composant Hero est marqué comme titre de section
    const heroComponent = result.componentUsages.find(
      (c: { componentId: string; isSectionHeader?: boolean }) => c.componentId === 'Hero'
    );
    expect(heroComponent).toBeDefined();
    expect(heroComponent?.isSectionHeader).toBe(true);

    // Vérifier que les sections H3 sont correctement rattachées à la section Hero
    const section1 = result.sections.find(
      (s: { title: string; level?: number }) => s.title === 'Section 1'
    );
    expect(section1).toBeDefined();
    expect(section1?.level).toBe(3);

    // Vérifier que les autres composants sont correctement détectés
    const testComponent = result.componentUsages.find(
      (c: { componentId: string; props?: Record<string, unknown> }) =>
        c.componentId === 'TestComponent'
    );
    expect(testComponent).toBeDefined();
    expect(testComponent?.props).toEqual({
      prop1: 'value1',
      prop2: '123',
    });
  });

  it('should detect CommentedText components and transform them into ArticleComment entities', async () => {
    // Contenu MDX avec des composants CommentedText - NOUVEAU FORMAT
    const mdxContent = `---
    title: Article with Comments
    description: Testing comment detection
    ---

    # Section with Comments

    <CommentedText id="comment-1" comment="Ceci est un commentaire">Le texte commenté</CommentedText>

    ## Subsection

    Regular content here.

    <CommentedText id="comment-2" comment="Un autre commentaire avec des métadonnées">Plus de texte commenté</CommentedText>

    ### Nested section

    <CommentedText id="comment-3" comment="Commentaire dans une sous-section">Texte de sous-section</CommentedText>
    `;

    // Mock de fs/promises.readFile
    (fsPromises.readFile as any).mockResolvedValue(mdxContent);

    // Création du service avec le mock
    const parser = new MdxParserService();

    // Appel du service
    const result = await parser.parseArticleStructure('/path/to/article-with-comments.mdx');

    // Vérifications
    expect(result.article).toBeDefined();

    // Vérifier que les TextFragments sont créés
    expect(result.textFragments?.length).toBe(3);

    // Vérifier que les commentaires sont correctement extraits
    expect(result.comments?.length).toBe(3);

    // Vérifier le premier commentaire
    const firstComment = result.comments?.[0];
    expect(firstComment).toBeDefined();
    expect(firstComment?.id).toBe('comment-1');
    expect(firstComment?.content).toBe('Ceci est un commentaire');
    expect(firstComment?.authorId).toBe(undefined); // Pas d'auteur dans le nouveau format
    expect(firstComment?.articleId).toBe(result.article.id);
    expect(firstComment?.textFragmentId).toBeDefined();

    // Vérifier le deuxième commentaire
    const secondComment = result.comments?.[1];
    expect(secondComment).toBeDefined();
    expect(secondComment?.id).toBe('comment-2');
    expect(secondComment?.content).toBe('Un autre commentaire avec des métadonnées');
    expect(secondComment?.authorId).toBe(undefined);
    expect(secondComment?.textFragmentId).toBeDefined();

    // Vérifier les TextFragments
    const firstFragment = result.textFragments?.find(f => f.id === 'fragment-comment-1');
    expect(firstFragment).toBeDefined();
    expect(firstFragment?.content).toBe('Le texte commenté');

    const secondFragment = result.textFragments?.find(f => f.id === 'fragment-comment-2');
    expect(secondFragment).toBeDefined();
    expect(secondFragment?.content).toBe('Plus de texte commenté');

    // Vérifier la liaison commentaire → fragment
    expect(firstComment?.textFragmentId).toBe('fragment-comment-1');
    expect(secondComment?.textFragmentId).toBe('fragment-comment-2');
  });

  it('should handle multiple CommentedText on the same line', async () => {
    const mdxContent = `---
title: Multi Comments Test
---

# Section

<CommentedText id="c1" comment="Premier">Texte 1</CommentedText> et <CommentedText id="c2" comment="Second">Texte 2</CommentedText> sur la même ligne.`;

    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const parser = new MdxParserService();
    const result = await parser.parseArticleStructure('/path/to/multi.mdx');

    expect(result.textFragments?.length).toBe(2);
    expect(result.comments?.length).toBe(2);

    // Vérifier que les deux commentaires sont bien extraits
    expect(result.comments?.find(c => c.id === 'c1')).toBeDefined();
    expect(result.comments?.find(c => c.id === 'c2')).toBeDefined();
    expect(result.textFragments?.find(f => f.id === 'fragment-c1')).toBeDefined();
    expect(result.textFragments?.find(f => f.id === 'fragment-c2')).toBeDefined();
  });

  it('should handle CommentedText without id attribute', async () => {
    const mdxContent = `---
title: No ID Test
---

# Section

<CommentedText comment="Commentaire sans ID">Texte sans ID</CommentedText>`;

    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const parser = new MdxParserService();
    const result = await parser.parseArticleStructure('/path/to/noid.mdx');

    expect(result.textFragments?.length).toBe(1);
    expect(result.comments?.length).toBe(1);

    // Vérifier qu'un UUID est généré
    const comment = result.comments?.[0];
    expect(comment?.id).toMatch(/^[a-f0-9-]{36}$/); // UUID pattern
    expect(comment?.content).toBe('Commentaire sans ID');
  });

  it('should handle CommentedText with complex props', async () => {
    const mdxContent = `---
title: Complex Props Test
---

# Section

<CommentedText id="complex" comment="Commentaire complexe" author="John Doe" status="approved" metadata={{"importance": "high"}}>Texte avec métadonnées</CommentedText>`;

    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const parser = new MdxParserService();
    const result = await parser.parseArticleStructure('/path/to/complex.mdx');

    expect(result.comments?.length).toBe(1);
    const comment = result.comments?.[0];

    expect(comment?.id).toBe('complex');
    expect(comment?.content).toBe('Commentaire complexe');
    expect(comment?.metadata).toEqual({
      id: 'complex',
      comment: 'Commentaire complexe',
      author: 'John Doe',
      status: 'approved',
      metadata: '{"importance": "high"}',
    });
  });

  it('should handle empty CommentedText', async () => {
    const mdxContent = `---
title: Empty Test
---

# Section

<CommentedText id="empty" comment="Commentaire vide"></CommentedText>`;

    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const parser = new MdxParserService();
    const result = await parser.parseArticleStructure('/path/to/empty.mdx');

    expect(result.textFragments?.length).toBe(1);
    expect(result.comments?.length).toBe(1);

    const fragment = result.textFragments?.[0];
    expect(fragment?.content).toBe('Texte commenté'); // Valeur par défaut
  });

  it('should preserve hierarchical structure with CommentedText in nested sections', async () => {
    const mdxContent = `---
title: Hierarchy Test
---

# H1 Section

<CommentedText id="h1-comment" comment="Commentaire H1">Texte H1</CommentedText>

## H2 Section

<CommentedText id="h2-comment" comment="Commentaire H2">Texte H2</CommentedText>

### H3 Section

<CommentedText id="h3-comment" comment="Commentaire H3">Texte H3</CommentedText>`;

    (fsPromises.readFile as any).mockResolvedValue(mdxContent);
    const parser = new MdxParserService();
    const result = await parser.parseArticleStructure('/path/to/hierarchy.mdx');

    expect(result.sections?.length).toBe(3);
    expect(result.textFragments?.length).toBe(3);
    expect(result.comments?.length).toBe(3);

    // Vérifier que chaque fragment est lié à la bonne section
    const h1Section = result.sections?.find(s => s.title === 'H1 Section');
    const h2Section = result.sections?.find(s => s.title === 'H2 Section');
    const h3Section = result.sections?.find(s => s.title === 'H3 Section');

    expect(h1Section).toBeDefined();
    expect(h2Section).toBeDefined();
    expect(h3Section).toBeDefined();

    // Vérifier la hiérarchie parent-enfant
    expect(h2Section?.parentSectionId).toBe(h1Section?.id);
    expect(h3Section?.parentSectionId).toBe(h2Section?.id);

    // Vérifier que les fragments sont dans les bonnes sections
    const h1Fragment = result.textFragments?.find(f => f.id === 'fragment-h1-comment');
    const h2Fragment = result.textFragments?.find(f => f.id === 'fragment-h2-comment');
    const h3Fragment = result.textFragments?.find(f => f.id === 'fragment-h3-comment');

    expect(h1Fragment?.sectionId).toBe(h1Section?.id);
    expect(h2Fragment?.sectionId).toBe(h2Section?.id);
    expect(h3Fragment?.sectionId).toBe(h3Section?.id);
  });
});
