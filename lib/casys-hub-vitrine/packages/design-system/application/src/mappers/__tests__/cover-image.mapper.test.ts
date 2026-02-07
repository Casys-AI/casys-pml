import { describe, expect,it } from 'vitest';

import type { GenerateCoverImageCommandDTO, ImageFormat } from '@casys/shared';

import { mapCommandToCoverPromptDTO } from '../cover-image.mapper';

function makeCommand(overrides?: Partial<GenerateCoverImageCommandDTO>): GenerateCoverImageCommandDTO {
  const base: GenerateCoverImageCommandDTO = {
    articleId: 'art-1',
    outlineTitle: 'My Article',
    outlineSummary: 'A short summary',
    tags: ['tag1', 'tag2'],
    tenantId: 'tenant-1',
    projectId: 'project-1',
  };
  return { ...base, ...(overrides as any) } as GenerateCoverImageCommandDTO;
}

describe('cover-image.mapper', () => {
  it('mappe correctement les champs de base et les tags depuis cmd.tags', () => {
    const cmd = makeCommand({ tags: ['a', 'b'] });
    const slug = 'my-article-abc123';
    const style = 'cinematic style';
    const format: ImageFormat = 'webp';

    const dto = mapCommandToCoverPromptDTO(cmd, slug, style, format);

    expect(dto.topic).toBe('My Article');
    expect(dto.summary).toBe('A short summary');
    expect(dto.slug).toBe(slug);
    expect(dto.stylePrompt).toBe(style);
    expect(dto.format).toBe('webp');
    expect(dto.tags).toEqual(['a', 'b']);
  });

  it('applique les dimensions par défaut 1536x1024 si non fournies', () => {
    const dto = mapCommandToCoverPromptDTO(makeCommand(), 's', undefined, 'png');
    expect(dto.width).toBe(1536);
    expect(dto.height).toBe(1024);
  });

  it('respecte les dimensions fournies en override', () => {
    const dto = mapCommandToCoverPromptDTO(makeCommand(), 's', undefined, 'jpeg', 1024, 1536);
    expect(dto.width).toBe(1024);
    expect(dto.height).toBe(1536);
  });

  it("summary est normalisé à '' si indéfini dans la commande", () => {
    const cmd = makeCommand({ outlineSummary: undefined as any });
    const dto = mapCommandToCoverPromptDTO(cmd, 's', undefined, 'jpg');
    expect(dto.summary).toBe('');
  });
});
