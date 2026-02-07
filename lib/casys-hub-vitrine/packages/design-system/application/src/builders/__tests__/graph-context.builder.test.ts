import { describe, expect, it } from 'vitest';

import type { SectionNode } from '@casys/core';
import type { NeighborSummary } from '../../mappers/graph-context.mapper';

import { GraphContextBuilder } from '../../mappers/graph-context.mapper';

describe('GraphContextBuilder', () => {
  it('construit un contexte avec title/summary et outline', () => {
    const builder = new GraphContextBuilder();
    const outline = {
      title: 'Mon Article',
      summary: 'Résumé court',
      sections: [{ title: 'Intro', description: 'Présentation' }, { title: 'Développement' }],
    };
    const current: SectionNode = {
      id: 'a1::0',
      title: 'Intro',
      level: 1,
      content: '',
      position: 0,
      articleId: 'a1',
    };
    const neighbors: NeighborSummary[] = [
      { title: 'Contexte A', position: 3, summary: '' },
      { title: 'Contexte B', position: 1, summary: '' },
    ];

    const out = builder.build({
      outline,
      currentIndex: 0,
      generatedSections: [],
      current,
      neighbors,
    });

    expect(out).toContain('Mon Article');
    expect(out).toContain('Résumé court');
    // Plus d'affichage des "Topics" (ex-Sources) dans le mapper
    expect(out).toContain('Outline:');
    expect(out).toContain('Focus: [0] Intro');
    // Les neighbors sont inline, pas de section séparée
  });

  it('ajoute des previews adjacents si le contenu existe aux positions ±1', () => {
    const builder = new GraphContextBuilder();
    const outline = {
      title: 'Mon Article',
      sections: [
        { title: 'Intro', description: 'Présentation' },
        { title: 'Suite' },
        { title: 'Fin' },
      ],
    };
    const generatedSections: SectionNode[] = [
      {
        id: 'a1::0',
        title: 'Intro',
        level: 1,
        content: 'Contenu Intro',
        position: 0,
        articleId: 'a1',
      },
      {
        id: 'a1::1',
        title: 'Suite',
        level: 1,
        content: 'Contenu Suite',
        position: 1,
        articleId: 'a1',
      },
      { id: 'a1::2', title: 'Fin', level: 1, content: '', position: 2, articleId: 'a1' },
    ];
    const neighbors: NeighborSummary[] = [];

    const out = builder.build({
      outline,
      currentIndex: 1,
      generatedSections,
      current: generatedSections[1],
      neighbors,
    });

    // Vérifier les sections siblings, previous et next
    expect(out).toContain('Sibling sections');
    expect(out).toContain('Previous section');
    expect(out).toContain('Next section');
    expect(out).toContain('Intro'); // section précédente
    expect(out).toContain('Fin'); // section suivante
  });

  it('builds hierarchy with ancestors up to 3 levels deep', () => {
    const builder = new GraphContextBuilder();
    const generatedSections: SectionNode[] = [
      { id: 'h1', title: 'Parent L1', level: 1, content: '', position: 0, articleId: 'a1' },
      { id: 'h2', title: 'Parent L2', level: 2, content: '', position: 1, articleId: 'a1', parentSectionId: 'h1' },
      { id: 'h3', title: 'Parent L3', level: 3, content: '', position: 2, articleId: 'a1', parentSectionId: 'h2' },
      { id: 'h4', title: 'Current', level: 4, content: '', position: 3, articleId: 'a1', parentSectionId: 'h3' },
    ];

    const out = builder.build({
      outline: { sections: [] },
      currentIndex: 3,
      generatedSections,
      current: generatedSections[3],
      neighbors: [
        { title: 'Parent L1', position: 0, summary: 'Summary 1' },
        { title: 'Parent L2', position: 1, summary: 'Summary 2' },
        { title: 'Parent L3', position: 2, summary: 'Summary 3' },
      ],
    });

    expect(out).toContain('Hierarchy (parent sections)');
    expect(out).toContain('Parent L1');
    expect(out).toContain('Summary 1');
    expect(out).toContain('Parent L2');
    expect(out).toContain('Summary 2');
    expect(out).toContain('Parent L3');
    expect(out).toContain('Summary 3');
  });

  it('handles missing parent in hierarchy chain gracefully', () => {
    const builder = new GraphContextBuilder();
    const generatedSections: SectionNode[] = [
      { id: 'orphan', title: 'Orphan Section', level: 2, content: '', position: 0, articleId: 'a1', parentSectionId: 'missing-parent' },
    ];

    const out = builder.build({
      outline: {},
      currentIndex: 0,
      generatedSections,
      current: generatedSections[0],
      neighbors: [],
    });

    // Should not crash, and should not show hierarchy section since parent chain breaks
    expect(out).toContain('Focus: [0] Orphan Section');
  });

  it('includes next section with description if available', () => {
    const builder = new GraphContextBuilder();
    const outline = {
      sections: [
        { title: 'Current' },
        { title: 'Next Section', description: 'This is the next planned section' },
      ],
    };

    const out = builder.build({
      outline,
      currentIndex: 0,
      generatedSections: [],
      current: { id: 's1', title: 'Current', level: 1, content: '', position: 0, articleId: 'a1' },
      neighbors: [],
    });

    expect(out).toContain('Next section (planned)');
    expect(out).toContain('Next Section: This is the next planned section');
  });

  it('includes next section without description (title only)', () => {
    const builder = new GraphContextBuilder();
    const outline = {
      sections: [
        { title: 'Current' },
        { title: 'Next Without Desc' },
      ],
    };

    const out = builder.build({
      outline,
      currentIndex: 0,
      generatedSections: [],
      current: { id: 's1', title: 'Current', level: 1, content: '', position: 0, articleId: 'a1' },
      neighbors: [],
    });

    expect(out).toContain('Next section (planned)');
    expect(out).toContain('Next Without Desc');
  });

  it('does not show previous section if it is the same as parent', () => {
    const builder = new GraphContextBuilder();
    const generatedSections: SectionNode[] = [
      { id: 'parent', title: 'Parent', level: 1, content: '', position: 0, articleId: 'a1' },
      { id: 'child', title: 'Child', level: 2, content: '', position: 1, articleId: 'a1', parentSectionId: 'parent' },
    ];

    const out = builder.build({
      outline: { sections: [] },
      currentIndex: 1,
      generatedSections,
      current: generatedSections[1],
      neighbors: [],
    });

    // Parent should be in hierarchy, but not duplicated in "Previous section" since prevSection.id === current.parentSectionId
    expect(out).toContain('Hierarchy (parent sections)');
    expect(out).toContain('Parent');
    expect(out).not.toContain('Previous section (sequential)');
  });
});
