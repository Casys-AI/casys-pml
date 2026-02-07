import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AITextModelPort } from '@casys/application';

import { OutlineWriterAgent } from '../outline-writer.agent';

describe('OutlineWriterAgent (POML forward)', () => {
  let agent: OutlineWriterAgent;
  let mockAI: AITextModelPort;

  beforeEach(() => {
    mockAI = { generateText: vi.fn() } as unknown as AITextModelPort;
    agent = new OutlineWriterAgent(mockAI);
  });

  it('expose le bon name/description', () => {
    expect(agent.name).toBe('outline_writer');
    expect(agent.description).toContain('plan');
  });

  it('rejette un prompt vide', async () => {
    await expect(agent.invoke('')).rejects.toThrow('prompt POML requis');
  });

  it('forwarde le POML directement au modèle', async () => {
    const poml = '<poml><role>Writer</role><task>Do outline</task></poml>';
    vi.mocked(mockAI.generateText as any).mockResolvedValue('{"ok":true}');
    const out = await agent.invoke(poml);
    expect(out).toBe('{"ok":true}');
    expect(mockAI.generateText).toHaveBeenCalledWith(poml);
  });
});
