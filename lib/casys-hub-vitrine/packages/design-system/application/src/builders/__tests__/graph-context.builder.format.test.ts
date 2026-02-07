import { describe, it, expect } from 'vitest';

import { GraphContextBuilder } from '../../mappers/graph-context.mapper';
import type { SectionGraphContextDTO } from '@casys/shared';

describe('GraphContextBuilder.format', () => {
  it('formats context from DTO with article, sources, outline, ancestors, siblings, prev, next', () => {
    const builder = new GraphContextBuilder();

    const dto: SectionGraphContextDTO = {
      article: { title: 'Article T', summary: 'Résumé A', description: 'Desc A' },
      current: { id: 'a1::2', title: 'Current', position: 2 },
      ancestors: [
        { id: 'a1::0', title: 'H1', position: 0, level: 1, summary: 'S H1' },
        { id: 'a1::1', title: 'H2', position: 1, level: 2, summary: 'S H2' },
      ],
      siblings: [
        { id: 'a1::0', title: 'Sib0', position: 0, summary: 'S s0' },
        { id: 'a1::1', title: 'Sib1', position: 1, summary: 'S s1' },
        { id: 'a1::2', title: 'Sib2', position: 2, summary: 'S s2' },
      ],
      previous: { id: 'a1::1', title: 'Prev', position: 1, summary: 'S prev' },
      nextPlanned: { title: 'Next', description: 'Planned desc' },
    };

    const out = builder.format(dto, {
      outlineSections: [
        { title: 'H1', description: 'Outline H1' },
        { title: 'H2', description: 'Outline H2' },
        { title: 'Current', description: 'Outline Curr' },
        { title: 'Next', description: 'Planned desc' },
      ],
    });

    expect(out).toContain('# Article: Article T');
    expect(out).toContain('Summary: Résumé A');
    // Plus d'affichage de "Sources/Topics" dans le mapper
    expect(out).toContain('Outline:');
    expect(out).toContain('- [0] H1');

    expect(out).toContain('Hierarchy (parent sections):');
    expect(out).toContain('[H1] H1: S H1');
    expect(out).toContain('[H2] H2: S H2');

    expect(out).toContain('Sibling sections (same level, already written):');
    expect(out).toContain('Sib1: S s1');
    expect(out).toContain('Sib2: S s2');
    expect(out).not.toContain('Sib0: S s0');

    expect(out).toContain('Previous section (sequential):');
    expect(out).toContain('Prev: S prev');

    expect(out).toContain('Next section (planned):');
    expect(out).toContain('Next: Planned desc');

    expect(out).toContain('Focus: [2] Current');
  });

  it('falls back to article.description when summary is missing', () => {
    const builder = new GraphContextBuilder();
    const dto: SectionGraphContextDTO = {
      article: { title: 'Article T', description: 'Desc A' },
      current: { id: 'a1::0', title: 'Intro', position: 0 },
      ancestors: [],
      siblings: [],
      previous: null,
      nextPlanned: null,
    };
    const out = builder.format(dto, { outlineSections: [] });
    expect(out).toContain('Summary: Desc A');
  });
});
