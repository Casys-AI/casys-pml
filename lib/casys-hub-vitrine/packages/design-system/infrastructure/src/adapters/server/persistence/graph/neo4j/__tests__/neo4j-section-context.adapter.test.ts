import { describe, it, expect, vi } from 'vitest';

import { Neo4jSectionContextAdapter } from '../neo4j-section-context.adapter';

describe('Neo4jSectionContextAdapter', () => {
  it('maps query result to SectionGraphContextDTO with coalesced summaries', async () => {
    const mockConn = {
      query: vi.fn().mockResolvedValueOnce([
        {
          aTitle: 'A Title',
          aDesc: 'A Desc',
          curId: 'a1::3',
          curTitle: 'Current',
          curPos: 3,
          ancestors: [
            { id: 'a1::0', title: 'H1', level: 1, position: 0, summary: 'Sum H1' },
            { id: 'a1::1', title: 'H2', level: 2, position: 1, description: 'Desc H2' },
          ],
          siblings: [
            { id: 'a1::1', title: 'Sib1', position: 1, summary: 'Sum S1' },
            { id: 'a1::2', title: 'Sib2', position: 2, description: 'Desc S2' },
            { id: 'a1::3', title: 'Sib3', position: 3, summary: 'Sum S3' },
          ],
          previous: { id: 'a1::2', title: 'Prev', position: 2, summary: 'Sum Prev' },
          nextPlanned: { title: 'Next', description: 'Planned next' },
        },
      ]),
    } as any;

    const adapter = new Neo4jSectionContextAdapter(mockConn);
    const dto = await adapter.getContext({ articleId: 'a1', sectionId: 'a1::3' });

    expect(dto.article.title).toBe('A Title');
    expect(dto.article.description).toBe('A Desc');

    expect(dto.current).toEqual({ id: 'a1::3', title: 'Current', position: 3 });

    expect(dto.ancestors.length).toBe(2);
    expect(dto.ancestors[0]).toMatchObject({ title: 'H1', summary: 'Sum H1' });
    expect(dto.ancestors[1]).toMatchObject({ title: 'H2', summary: 'Desc H2' });

    // siblings are sliced to last 2
    expect(dto.siblings.length).toBe(2);
    expect(dto.siblings[0]).toMatchObject({ title: 'Sib2', summary: 'Desc S2' });
    expect(dto.siblings[1]).toMatchObject({ title: 'Sib3', summary: 'Sum S3' });

    expect(dto.previous).toMatchObject({ title: 'Prev', position: 2, summary: 'Sum Prev' });
    expect(dto.nextPlanned).toMatchObject({ title: 'Next', description: 'Planned next' });

    expect(mockConn.query).toHaveBeenCalledTimes(1);
  });

  it('returns empty defaults when no rows', async () => {
    const mockConn = { query: vi.fn().mockResolvedValueOnce([]) } as any;
    const adapter = new Neo4jSectionContextAdapter(mockConn);
    const dto = await adapter.getContext({ articleId: 'a1', sectionId: 'a1::0' });

    expect(dto.article).toEqual({ title: undefined, summary: undefined, description: undefined });
    expect(dto.current.id).toBe('a1::0');
    expect(dto.ancestors).toEqual([]);
    expect(dto.siblings).toEqual([]);
    expect(dto.previous).toBeNull();
    expect(dto.nextPlanned).toBeNull();
  });
});
