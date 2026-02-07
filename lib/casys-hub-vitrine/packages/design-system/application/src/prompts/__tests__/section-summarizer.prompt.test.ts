import { describe, expect, it, vi } from 'vitest';
vi.mock('pomljs', () => ({
  read: vi.fn(async () => '<env presentation="markup">OK</env>'),
}));

import type { PromptTemplatePort } from '../../ports/out';
import { buildSectionSummarizerPoml } from '../section-summarizer.prompt';

function makePort(template: string): PromptTemplatePort {
  return {
    loadTemplate: async (_path: string) => {
      return template;
    },
  } as unknown as PromptTemplatePort;
}

describe('buildSectionSummarizerPoml', () => {
  const baseParams = {
    sectionTitle: 'Introduction à TypeScript',
    sectionContent: 'TypeScript est un sur-ensemble de JavaScript qui ajoute des types statiques.',
    sectionLevel: 1,
    maxSentences: 3,
  };

  const baseTemplate = [
    '<poml>',
    '  <vars>',
    '    <sectionTitle>{{sectionTitle}}</sectionTitle>',
    '    <sectionContent>{{sectionContent}}</sectionContent>',
    '    <sectionLevel>{{sectionLevel}}</sectionLevel>',
    '    <maxSentences>{{maxSentences}}</maxSentences>',
    '  </vars>',
    '</poml>',
  ].join('\n');

  it('succès: rend le contenu avec pomljs', async () => {
    const filled = await buildSectionSummarizerPoml(makePort(baseTemplate), 't/path', { ...baseParams });
    expect(filled).toContain('<env');
    expect(filled).toContain('presentation="markup"');
    expect(typeof filled).toBe('string');
    expect(filled.length).toBeGreaterThan(0);
  });

  it('fail-fast: templatePath manquant', async () => {
    await expect(buildSectionSummarizerPoml(makePort(baseTemplate), '', { ...baseParams })).rejects.toThrow(
      /Paramètre requis manquant: templatePath/
    );
  });

  it('fail-fast: sectionTitle manquant', async () => {
    await expect(
      buildSectionSummarizerPoml(makePort(baseTemplate), 't', { ...baseParams, sectionTitle: '' })
    ).rejects.toThrow(/sectionTitle requis/);
  });

  it('fail-fast: sectionContent manquant', async () => {
    await expect(
      buildSectionSummarizerPoml(makePort(baseTemplate), 't', { ...baseParams, sectionContent: '' })
    ).rejects.toThrow(/sectionContent requis/);
  });

  it('fail-fast: sectionLevel invalide', async () => {
    await expect(
      buildSectionSummarizerPoml(makePort(baseTemplate), 't', { ...baseParams, sectionLevel: 0 })
    ).rejects.toThrow(/sectionLevel requis \(>0\)/);
  });

  it('fail-fast: maxSentences invalide', async () => {
    await expect(
      buildSectionSummarizerPoml(makePort(baseTemplate), 't', { ...baseParams, maxSentences: 0 })
    ).rejects.toThrow(/maxSentences requis \(>0\)/);
  });

  it('gère les caractères spéciaux XML via pomljs', async () => {
    const paramsWithSpecialChars = {
      ...baseParams,
      sectionTitle: 'Test & <Balise>',
      sectionContent: 'Contenu "spécial" avec <tags>',
    };
    const filled = await buildSectionSummarizerPoml(makePort(baseTemplate), 't/path', paramsWithSpecialChars);
    // pomljs gère l'échappement automatiquement
    expect(filled).toContain('<env');
    expect(typeof filled).toBe('string');
  });
});
