import { describe, expect,it, vi } from 'vitest';
vi.mock('pomljs', () => ({
  read: vi.fn(async () => '<env presentation="markup">OK</env>'),
}));

import type { PromptTemplatePort } from '../../ports/out';
import { buildCoverPoml } from '../cover-prompt';

function makePort(template: string): PromptTemplatePort {
  return {
    loadTemplate: async (_path: string) => {
      return template;
    },
  } as unknown as PromptTemplatePort;
}

describe('buildCoverPoml', () => {
  const baseParams = {
    topic: 'Guide TypeScript',
    slug: 'guide-typescript-abc123',
    summary: 'Un guide complet pour apprendre TypeScript',
    stylePrompt: 'style moderne et professionnel',
    tags: ['typescript', 'javascript', 'développement'],
    format: 'webp' as const,
    width: 1536,
    height: 1024,
  };

  const baseTemplate = [
    '<poml>',
    '  <let name="imageSize">1536x1024</let>',
    '  <image>',
    '    <title>{{topic}}</title>',
    '    <format>{{format}}</format>',
    '    <prompt>',
    '      Generate a high-quality cover image for: {{topic}}',
    '      Style: {{style}}',
    '      Tags: {{tags}}',
    '      Summary: {{summary}}',
    '    </prompt>',
    '    <constraints>',
    '      <size width="1536" height="1024" />',
    '    </constraints>',
    '  </image>',
    '</poml>',
  ].join('\n');

  it('succès: rend le POML et retourne les métadonnées', async () => {
    const result = await buildCoverPoml(makePort(baseTemplate), 't/path', { ...baseParams });
    console.log('=== RÉSULTAT RENDU ===');
    console.log(result);
    console.log('=== FIN ===');
    expect(result.prompt).toBeDefined();
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(result.format).toBe('webp');
    expect(result.width).toBe(1536);
    expect(result.height).toBe(1024);
  });

  it('traitement des caractères spéciaux via pomljs', async () => {
    const paramsWithSpecialChars = {
      ...baseParams,
      topic: 'Guide & <TypeScript>',
      summary: 'Un guide "complet" pour apprendre TypeScript & React',
    };
    const result = await buildCoverPoml(makePort(baseTemplate), 't/path', paramsWithSpecialChars);
    // pomljs gère l'échappement automatiquement
    expect(result.prompt).toBeDefined();
    expect(result.format).toBe('webp');
    expect(result.width).toBe(1536);
    expect(result.height).toBe(1024);
  });

  it('fail-fast: templatePath manquant', async () => {
    await expect(buildCoverPoml(makePort(baseTemplate), '', { ...baseParams })).rejects.toThrow(
      /Paramètre requis manquant: templatePath/
    );
  });

  it('fail-fast: topic manquant', async () => {
    await expect(
      buildCoverPoml(makePort(baseTemplate), 't', { ...baseParams, topic: '' })
    ).rejects.toThrow(/Paramètre requis manquant: topic/);
  });

  it('fail-fast: slug manquant', async () => {
    await expect(
      buildCoverPoml(makePort(baseTemplate), 't', { ...baseParams, slug: '' })
    ).rejects.toThrow(/Paramètre requis manquant: slug/);
  });

  it('fail-fast: tags vide', async () => {
    await expect(
      buildCoverPoml(makePort(baseTemplate), 't', { ...baseParams, tags: [] })
    ).rejects.toThrow(/Paramètre requis manquant: tags/);
  });

  it('gère summary optionnel', async () => {
    const paramsWithoutSummary = { ...baseParams, summary: '' };
    const result = await buildCoverPoml(makePort(baseTemplate), 't/path', paramsWithoutSummary);
    expect(result.prompt).toBeDefined();
    expect(result.format).toBe('webp');
    expect(result.width).toBe(1536);
    expect(result.height).toBe(1024);
  });

  it('gère stylePrompt optionnel', async () => {
    const paramsWithoutStyle = { ...baseParams, stylePrompt: undefined };
    const result = await buildCoverPoml(makePort(baseTemplate), 't/path', paramsWithoutStyle);
    expect(result.prompt).toBeDefined();
    expect(result.format).toBe('webp');
    expect(result.width).toBe(1536);
    expect(result.height).toBe(1024);
  });

  it('normalise format jpg vers jpeg', async () => {
    const result = await buildCoverPoml(
      makePort(baseTemplate),
      't/path',
      { ...baseParams, format: 'jpg' as any }
    );
    expect(result.format).toBe('jpeg'); // normalisé
    expect(result.width).toBe(1536);
    expect(result.height).toBe(1024);
  });

  it('fail-fast: format non supporté', async () => {
    await expect(
      buildCoverPoml(makePort(baseTemplate), 't/path', { ...baseParams, format: 'gif' as any })
    ).rejects.toThrow(/Format non supporté/);
  });

  it('fail-fast: taille non supportée par gpt-image-1', async () => {
    const templateWithBadSize = baseTemplate.replace('<let name="imageSize">1536x1024</let>', '<let name="imageSize">2048x2048</let>');
    await expect(
      buildCoverPoml(makePort(templateWithBadSize), 't/path', { ...baseParams })
    ).rejects.toThrow(/Taille non supportée par gpt-image-1/);
  });
});
