import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MdxParserService } from '../mdx-parser.adapter';

describe('MdxParser - IDs Canoniques', () => {
  let parser: MdxParserService;
  let tempDir: string;

  beforeEach(async () => {
    parser = new MdxParserService();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdx-test-'));
  });

  afterEach(async () => {
    // Nettoyer les fichiers temporaires
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignorer les erreurs de nettoyage
    }
  });

  it('devrait générer des IDs canoniques natifs pour les sections', async () => {
    const testContent = `---
title: "Test Article"
description: "Test canonique"
---

# Introduction
Contenu introduction

## Section A
Contenu section A

## Section B
Contenu section B
`;

    // Créer un fichier temporaire
    const testFilePath = path.join(tempDir, 'article.mdx');
    await fs.writeFile(testFilePath, testContent);

    const result = await parser.parseArticleStructure(testFilePath, 'test-tenant', 'test-project');

    // Vérifier que toutes les sections ont des IDs canoniques
    expect(result.article.id).toMatch(/^article-\w+$/); // ID article généré
    expect(result.sections).toHaveLength(3);

    result.sections.forEach((section, index) => {
      // Format attendu: ${articleId}::${position}
      expect(section.id).toMatch(/^article-\w+::\d+$/);
      expect(section.id).toBe(`${result.article.id}::${index}`);
      expect(section.position).toBe(index);
      expect(section.articleId).toBe(result.article.id);
    });

    // Vérifier hiérarchie des parentSectionId (aussi canoniques)
    expect(result.sections[0].parentSectionId).toBeUndefined(); // H1 pas de parent
    expect(result.sections[1].parentSectionId).toBe(result.sections[0].id); // H2 → H1
    expect(result.sections[2].parentSectionId).toBe(result.sections[0].id); // H2 → H1
  });

  it('devrait faire référencer les textFragments aux IDs canoniques des sections', async () => {
    const testContent = `---
title: "Test Fragments"
---

# Section Test

<CommentedText id="comment1" comment="Test comment">
Texte avec commentaire sur la section
</CommentedText>

## Sous-section

<CommentedText id="comment2" comment="Autre comment">
Autre texte commenté
</CommentedText>
`;

    const testFilePath = path.join(tempDir, 'fragments.mdx');
    await fs.writeFile(testFilePath, testContent);

    const result = await parser.parseArticleStructure(testFilePath, 'test-tenant', 'test-project');

    expect(result.sections).toHaveLength(2);
    expect(result.textFragments).toHaveLength(2);

    const section = result.sections[0];
    const fragment = result.textFragments[0];

    // Vérifier que le fragment référence l'ID canonique de la section
    expect(section.id).toMatch(/^fragments-\w+::0$/);
    expect(fragment.sectionId).toBe(section.id);
    expect(fragment.content).toBe('Texte avec commentaire sur la section');
  });

  it('devrait faire référencer les componentUsages aux IDs canoniques des sections', async () => {
    const testContent = `---
title: "Test Components"
---

# Section Component

<CustomComponent prop1="value1" prop2="value2" />

## Section B

<AnotherComponent data="test" />
`;

    const testFilePath = path.join(tempDir, 'components.mdx');
    await fs.writeFile(testFilePath, testContent);

    const result = await parser.parseArticleStructure(testFilePath, 'test-tenant', 'test-project');

    expect(result.sections).toHaveLength(2);
    expect(result.componentUsages).toHaveLength(2);

    const section1 = result.sections[0]; // H1
    const section2 = result.sections[1]; // H2
    const component1 = result.componentUsages[0];
    const component2 = result.componentUsages[1];

    // Vérifier que les components référencent les IDs canoniques des sections
    expect(section1.id).toMatch(/^components-\w+::0$/);
    expect(section2.id).toMatch(/^components-\w+::1$/);

    expect(component1.textFragmentId).toContain(section1.id); // ${sectionId}-component-fragment-${lineIndex}
    expect(component2.textFragmentId).toContain(section2.id);

    expect(component1.componentId).toBe('CustomComponent');
    expect(component2.componentId).toBe('AnotherComponent');
  });

  it('devrait maintenir la cohérence des IDs canoniques avec hiérarchie complexe', async () => {
    const testContent = `---
title: "Test Hiérarchie"
---

# H1 - Niveau 1
## H2 - Niveau 2
### H3 - Niveau 3
#### H4 - Niveau 4
##### H5 - Niveau 5
###### H6 - Niveau 6
## H2 Bis - Retour Niveau 2
`;

    const testFilePath = path.join(tempDir, 'hierarchy.mdx');
    await fs.writeFile(testFilePath, testContent);

    const result = await parser.parseArticleStructure(testFilePath, 'test-tenant', 'test-project');

    expect(result.sections).toHaveLength(7);

    // Vérifier positions séquentielles
    result.sections.forEach((section, index) => {
      expect(section.position).toBe(index);
      expect(section.id).toBe(`${result.article.id}::${index}`);
    });

    // Vérifier hiérarchie des parents (IDs canoniques)
    const [h1, h2, h3, h4, h5, h6, h2bis] = result.sections;

    expect(h1.parentSectionId).toBeUndefined();
    expect(h2.parentSectionId).toBe(h1.id);
    expect(h3.parentSectionId).toBe(h2.id);
    expect(h4.parentSectionId).toBe(h3.id);
    expect(h5.parentSectionId).toBe(h4.id);
    expect(h6.parentSectionId).toBe(h5.id);
    expect(h2bis.parentSectionId).toBe(h1.id); // Retour au H1
  });

  it('devrait valider le format des IDs canoniques', () => {
    const articleId = 'article-test-123';
    const position = 42;
    const canonicalId = `${articleId}::${position}`;

    // Tests de format
    expect(canonicalId).toBe('article-test-123::42');
    expect(canonicalId).toMatch(/^.+::\d+$/);

    // Tests de parsing
    const parts = canonicalId.split('::');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe(articleId);
    expect(parts[1]).toBe('42');
    expect(parseInt(parts[1], 10)).toBe(42);
  });
});
