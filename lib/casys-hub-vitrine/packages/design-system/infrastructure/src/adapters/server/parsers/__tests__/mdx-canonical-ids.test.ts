import { beforeEach, describe, expect, it } from 'vitest';

import { MdxParserService } from '../mdx-parser.adapter';

describe('MdxParserService - IDs Canoniques', () => {
  let parser: MdxParserService;

  beforeEach(() => {
    parser = new MdxParserService();
  });

  it('devrait générer des IDs canoniques pour les sections', async () => {
    const _content = `---
title: "Test Canonical IDs"
description: "Test parser avec IDs canoniques"
---

# Section 1
Contenu section 1

## Section 2
Contenu section 2

### Section 3
Contenu section 3
`;

    // Test direct du contenu au lieu de lire un fichier
    const articleStructure = (parser as any).extractSectionsAndComponents(
      _content.split('---')[2].trim(),
      'test-article'
    );

    // Vérifier que les sections ont des IDs canoniques
    expect(articleStructure.sections).toHaveLength(3);

    const [section1, section2, section3] = articleStructure.sections;

    // Format attendu: ${articleId}::${position}
    expect(section1.id).toMatch(/^test-article::\d+$/);
    expect(section1.id).toBe('test-article::0');
    expect(section1.position).toBe(0);

    expect(section2.id).toBe('test-article::1');
    expect(section2.position).toBe(1);
    expect(section2.parentSectionId).toBe('test-article::0'); // Référence parent canonique

    expect(section3.id).toBe('test-article::2');
    expect(section3.position).toBe(2);
    expect(section3.parentSectionId).toBe('test-article::1'); // Référence parent canonique
  });

  it('devrait créer des textFragments avec sectionId canonique', async () => {
    const _content = `---
title: "Test TextFragments"
---

# Section Test

<CommentedText comment="Super commentaire">
Texte avec commentaire
</CommentedText>
`;

    const articleStructure = (parser as any).extractSectionsAndComponents(
      _content.split('---')[2].trim(),
      'test-fragments'
    );

    expect(articleStructure.sections).toHaveLength(1);
    expect(articleStructure.textFragments).toHaveLength(1);

    const section = articleStructure.sections[0];
    const fragment = articleStructure.textFragments[0];

    // Vérifier que le fragment référence l'ID canonique de la section
    expect(section.id).toBe('test-fragments::0');
    expect(fragment.sectionId).toBe('test-fragments::0');
    expect(fragment.sectionId).toBe(section.id); // Cohérence
  });

  it('devrait créer des componentUsages avec textFragmentId basé sur ID canonique', async () => {
    const _content = `---
title: "Test ComponentUsages"
---

# Section Component

<Button variant="primary" size="large">
Click me
</Button>
`;

    const articleStructure = (parser as any).extractSectionsAndComponents(
      _content.split('---')[2].trim(),
      'test-components'
    );

    expect(articleStructure.sections).toHaveLength(1);
    expect(articleStructure.componentUsages).toHaveLength(1);

    const section = articleStructure.sections[0];
    const componentUsage = articleStructure.componentUsages[0];

    // Vérifier que le componentUsage référence l'ID canonique
    expect(section.id).toBe('test-components::0');
    expect(componentUsage.textFragmentId).toMatch(/^test-components::0-component-fragment-\d+$/);
  });

  it('devrait maintenir la hiérarchie avec IDs canoniques', async () => {
    const _content = `---
title: "Test Hiérarchie"
---

# H1 Parent
Contenu H1

## H2 Enfant
Contenu H2

### H3 Petit-enfant
Contenu H3

## H2 Autre enfant
Contenu H2 bis

#### H4 Direct sous H2
Contenu H4
`;

    const articleStructure = (parser as any).extractSectionsAndComponents(
      _content.split('---')[2].trim(),
      'test-hierarchy'
    );

    expect(articleStructure.sections).toHaveLength(5);

    const [h1, h2_1, h3, h2_2, h4] = articleStructure.sections;

    // Vérifier la hiérarchie avec IDs canoniques
    expect(h1.id).toBe('test-hierarchy::0');
    expect(h1.parentSectionId).toBeUndefined();

    expect(h2_1.id).toBe('test-hierarchy::1');
    expect(h2_1.parentSectionId).toBe('test-hierarchy::0');

    expect(h3.id).toBe('test-hierarchy::2');
    expect(h3.parentSectionId).toBe('test-hierarchy::1');

    expect(h2_2.id).toBe('test-hierarchy::3');
    expect(h2_2.parentSectionId).toBe('test-hierarchy::0');

    expect(h4.id).toBe('test-hierarchy::4');
    expect(h4.parentSectionId).toBe('test-hierarchy::3');
  });

  it('devrait valider le format des IDs canoniques', () => {
    const articleId = 'my-article';
    const position = 42;
    const canonicalId = `${articleId}::${position}`;

    // Tests du format
    expect(canonicalId).toBe('my-article::42');
    expect(canonicalId).toMatch(/^[^:]+::\d+$/);

    const parts = canonicalId.split('::');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('my-article');
    expect(parts[1]).toBe('42');
    expect(Number(parts[1])).toBe(42);
  });
});
