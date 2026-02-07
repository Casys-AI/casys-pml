import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FsPromptTemplateAdapter } from '../fs-prompt-template.adapter';

describe('FsPromptTemplateAdapter', () => {
  // Typage souple pour compat TS/Vitest
  let readSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    readSpy = vi.spyOn(fsPromises, 'readFile');
  });

  afterEach(() => {
    readSpy.mockRestore();
  });

  describe('loadTemplate', () => {
    it('should load template from file system', async () => {
      const baseDir = '/test/blueprints';
      const adapter = new FsPromptTemplateAdapter(baseDir);

      readSpy.mockResolvedValue('Test template content' as unknown as Buffer);

      const result = await adapter.loadTemplate('prompts/test-template.poml');

      const expectedPath = path.resolve(baseDir, 'prompts/test-template.poml');
      expect(readSpy).toHaveBeenCalledWith(expectedPath, 'utf-8');
      expect(result).toBe('Test template content');
    });

    it('should throw error when template file does not exist', async () => {
      const baseDir = '/test/blueprints';
      const adapter = new FsPromptTemplateAdapter(baseDir);

      readSpy.mockRejectedValue(new Error('ENOENT'));

      await expect(adapter.loadTemplate('prompts/non-existent.poml')).rejects.toThrow(
        /Impossible de lire le template/
      );
    });

    it('should handle file read errors', async () => {
      const baseDir = '/test/blueprints';
      const adapter = new FsPromptTemplateAdapter(baseDir);

      readSpy.mockRejectedValue(new Error('Permission denied'));

      await expect(adapter.loadTemplate('prompts/test-template.poml')).rejects.toThrow(
        /Permission denied/
      );
    });

    it('should construct correct file path with baseDir', async () => {
      const baseDir = '/custom/path/blueprints';
      const adapter = new FsPromptTemplateAdapter(baseDir);

      readSpy.mockResolvedValue('content' as unknown as Buffer);

      await adapter.loadTemplate('prompts/my-template.poml');

      const expectedPath = path.resolve(baseDir, 'prompts/my-template.poml');
      expect(readSpy).toHaveBeenCalledWith(expectedPath, 'utf-8');
    });

    it('should reject absolute path (security)', async () => {
      const baseDir = '/test/blueprints';
      const adapter = new FsPromptTemplateAdapter(baseDir);

      await expect(
        adapter.loadTemplate(path.resolve(baseDir, 'prompts/test-template.poml'))
      ).rejects.toThrow(/Chemin de template invalide/);
    });

    it('should enforce .poml extension', async () => {
      const baseDir = '/test/blueprints';
      const adapter = new FsPromptTemplateAdapter(baseDir);

      await expect(adapter.loadTemplate('prompts/test-template.txt')).rejects.toThrow(
        /Extension de template non supportée/
      );
    });

    it('should block path traversal outside base', async () => {
      const baseDir = '/test/blueprints';
      const adapter = new FsPromptTemplateAdapter(baseDir);

      await expect(adapter.loadTemplate('../outside.poml')).rejects.toThrow(
        /Accès en dehors de la base interdit/
      );
    });
  });
});
