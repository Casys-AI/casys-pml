import { beforeEach, describe, expect, it } from 'vitest';

import { JinaReaderStrategy } from '../jina-reader.strategy';

describe('JinaReaderStrategy', () => {
  let strategy: JinaReaderStrategy;
  const mockApiKey = 'test-jina-api-key';

  beforeEach(() => {
    strategy = new JinaReaderStrategy(mockApiKey);
  });

  describe('canHandle', () => {
    it('should handle HTTP URLs when API key is provided', () => {
      expect(strategy.canHandle('http://example.com')).toBe(true);
      expect(strategy.canHandle('https://example.com')).toBe(true);
    });

    it('should not handle URLs when no API key', () => {
      const noKeyStrategy = new JinaReaderStrategy();
      expect(noKeyStrategy.canHandle('https://example.com')).toBe(false);
    });

    it('should not handle non-HTTP URLs', () => {
      expect(strategy.canHandle('ftp://example.com')).toBe(false);
    });
  });

  describe('extract', () => {
    it('should throw error when no API key configured', async () => {
      const noKeyStrategy = new JinaReaderStrategy();

      await expect(noKeyStrategy.extract('https://example.com/article'))
        .rejects.toThrow('Jina API key not configured');
    });

    it('should have correct priority', () => {
      expect(strategy.priority).toBe(3);
    });

    it('should have correct strategy name', () => {
      expect(strategy.name).toBe('jina-reader');
    });
  });
});
